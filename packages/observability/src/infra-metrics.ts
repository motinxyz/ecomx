import { metrics } from '@opentelemetry/api';
import {
  circuitBreakerRegistry,
  CircuitState,
} from '@ecomx/infra';
import type { ResilienceConfig, HookKeys } from '@ecomx/infra';
import { InfraMetrics } from './schema';



/**
 * Creates OpenTelemetry metrics instrumentation for `@ecomx/infra` resilience hooks.
 *
 * Returns hook arrays that plug directly into `mergeResilienceHooks`.
 * Also registers an ObservableGauge that polls the global `circuitBreakerRegistry`
 * every scrape interval for true real-time breaker state in Grafana.
 *
 * @example
 * ```typescript
 * import { createInfraMetrics } from '@ecomx/observability';
 * import { HttpClient, mergeResilienceHooks, createHttpClientTelemetry } from '@ecomx/infra';
 *
 * const paymentClient = new HttpClient({
 *   name: 'stripe-api',
 *   baseUrl: 'https://api.stripe.com/v1',
 *   resilience: mergeResilienceHooks(
 *     { maxAttempts: 2, timeoutMs: 4000 },
 *     createHttpClientTelemetry(logger),
 *     createInfraMetrics(),
 *   ),
 * });
 * ```
 */
export function createInfraMetrics(): Pick<ResilienceConfig, HookKeys> {
  const meter = metrics.getMeter(InfraMetrics.METER_NAME);

  // ── Counters ──────────────────────────────────────────────
  const retryCounter = meter.createCounter(InfraMetrics.HTTP_CLIENT.RETRY_TOTAL, {
    description: 'Total retry attempts across all HttpClient instances',
  });

  const timeoutCounter = meter.createCounter(InfraMetrics.HTTP_CLIENT.TIMEOUT_TOTAL, {
    description: 'Total timeout events across all HttpClient instances',
  });

  const transitionCounter = meter.createCounter(InfraMetrics.CIRCUIT_BREAKER.TRANSITION_TOTAL, {
    description: 'Total circuit breaker state transitions',
  });

  // ── Histogram ─────────────────────────────────────────────
  const durationHistogram = meter.createHistogram(InfraMetrics.HTTP_CLIENT.DURATION, {
    description: 'Duration of individual outbound HTTP requests in milliseconds',
    unit: 'ms',
  });

  // ── ObservableGauge (polls the WeakRef registry every scrape interval) ──
  meter.createObservableGauge(InfraMetrics.CIRCUIT_BREAKER.STATE, {
    description: 'Current circuit breaker state (0=Closed, 1=Open, 2=HalfOpen, 3=Isolated)',
  }).addCallback((result) => {
    for (const ref of circuitBreakerRegistry) {
      const engine = ref.deref();
      if (engine) {
        result.observe(engine.getBreakerState(), { dependency: engine.name });
      } else {
        // The engine was garbage collected. Clean up the dead reference.
        circuitBreakerRegistry.delete(ref);
      }
    }
  });

  // ── Return hooks as arrays (compatible with mergeResilienceHooks) ──
  return {
    onStateChange: [(state: CircuitState, name: string) => {
      transitionCounter.add(1, {
        dependency: name,
        to_state: CircuitState[state],
      });
    }],

    onRetry: [(info: { name: string }) => {
      retryCounter.add(1, { dependency: info.name });
    }],

    onTimeout: [(info: { name: string }) => {
      timeoutCounter.add(1, { dependency: info.name });
    }],

    onResponse: [(info: { name: string; durationMs: number; statusCode: number }) => {
      durationHistogram.record(info.durationMs, {
        dependency: info.name,
        status_code: info.statusCode,
      });
    }],
  };
}
