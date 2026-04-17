import {
  BrokenCircuitError,
  TaskCancelledError,
  TimeoutStrategy,
  timeout,
  retry,
  circuitBreaker,
  handleWhen,
  wrap,
  ExponentialBackoff,
  SamplingBreaker,
} from 'cockatiel';
import { ResilienceError, BaseAppError, HttpStatus } from './errors';

export type BreakerState = 'OPEN' | 'HALF_OPEN' | 'CLOSED';

export interface ResilienceConfig {
  /** Human-readable identifier (e.g., 'bkash-api', 'billing-service') */
  name: string;

  /** Max retry attempts before giving up. Default: 2 */
  maxRetries?: number;

  /** Timeout per individual attempt in ms. Default: 5000 */
  timeoutMs?: number;

  /** Failure rate threshold (0–1) to trip the breaker. Default: 0.5 (50%) */
  threshold?: number;

  /** Rolling window duration for sampling failures in ms. Default: 10_000 */
  samplingDurationMs?: number;

  /** How long breaker stays OPEN before probing in ms. Default: 30_000 */
  breakerCooldownMs?: number;

  /**
   * Injected callback for state change telemetry.
   * Consumers wire this to their observability layer — no circular dependency.
   */
  onStateChange?: (state: BreakerState, name: string) => void;
}

/**
 * Creates a composable resilience policy: Timeout → Retry → Circuit Breaker.
 *
 * This is the pure policy engine. It has zero knowledge of HTTP or fetch.
 * The InfraClient consumes this to protect outbound network calls.
 */
export function createResiliencePolicy(config: ResilienceConfig) {
  const {
    name,
    maxRetries = 2,
    timeoutMs = 5000,
    threshold = 0.5,
    samplingDurationMs = 10_000,
    breakerCooldownMs = 30_000,
    onStateChange,
  } = config;

  // 1. TIMEOUT — kill any single attempt that exceeds the deadline.
  // Aggressive strategy: immediately rejects without waiting for cooperative cancellation.
  const tPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);

  // Custom filter: only retry/break on errors that are explicitly retryable.
  // 4xx client errors (e.g., 400 Bad Request, 401 Unauthorized) bypass both
  // the retry engine AND the circuit breaker statistics entirely.
  const retryableFilter = handleWhen((err) => {
    if ('retryable' in err && (err as { retryable: boolean }).retryable === false) {
      return false;
    }
    return true;
  });

  // 2. RETRY — exponential backoff (500ms → 1s → 2s) before giving up.
  const rPolicy = retry(retryableFilter, {
    maxAttempts: maxRetries,
    backoff: new ExponentialBackoff(),
  });

  // 3. CIRCUIT BREAKER — statistical sampling over a rolling window.
  // Trips when `threshold` % of calls fail within `samplingDurationMs`.
  const cbPolicy = circuitBreaker(retryableFilter, {
    halfOpenAfter: breakerCooldownMs,
    breaker: new SamplingBreaker({ threshold, duration: samplingDurationMs }),
  });

  // Wire state change events to the injected callback (Inversion of Control)
  if (onStateChange) {
    cbPolicy.onBreak(() => onStateChange('OPEN', name));
    cbPolicy.onHalfOpen(() => onStateChange('HALF_OPEN', name));
    cbPolicy.onReset(() => onStateChange('CLOSED', name));
  }

  // 4. COMPOSE — order matters: breaker wraps retry wraps timeout.
  // If breaker is OPEN, we never even attempt the timeout or retry.
  const policy = wrap(cbPolicy, rPolicy, tPolicy);

  return {
    /**
     * Execute an async action through the full resilience chain.
     *
     * @param action - The async work to protect. Receives a merged AbortSignal
     *   that fires if the caller aborts OR the timeout expires.
     * @param signal - Optional external AbortSignal (e.g., from Elysia `request.signal`).
     *   If the user closes the browser, this cancels all in-flight retries immediately.
     */
    async execute<T>(
      action: (signal: AbortSignal) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      try {
        return await policy.execute(
          ({ signal: policySignal }) => action(policySignal),
          signal,
        );
      } catch (err) {
        // 1. Circuit breaker is OPEN → reject immediately with 503
        if (err instanceof BrokenCircuitError) {
          throw new ResilienceError(
            `Breaker [${name}] is OPEN — calls rejected`,
            err.name,
          );
        }

        // 2. Individual attempt timed out → reject with 504 Gateway Timeout
        if (err instanceof TaskCancelledError) {
          throw new ResilienceError(
            `[${name}] timed out after ${timeoutMs}ms`,
            err.name,
            HttpStatus.GATEWAY_TIMEOUT,
          );
        }

        // 3. Non-retryable errors (e.g., 4xx) bypassed the retry engine.
        //    Let them pass through to the consumer without wrapping.
        if (err instanceof Error && 'retryable' in err && (err as { retryable: boolean }).retryable === false) {
          throw err;
        }

        // 4. All retry attempts exhausted for a retryable error.
        //    Wrap with context so consumers know retries were attempted.
        if (err instanceof BaseAppError) {
          throw new ResilienceError(
            `[${name}] failed after ${maxRetries} retries: ${err.message}`,
            err.name,
            err.statusCode,
          );
        }

        // 5. Unknown error — wrap with generic 503
        if (err instanceof Error) {
          throw new ResilienceError(
            `[${name}] failed after ${maxRetries} retries: ${err.message}`,
            err.name,
          );
        }

        throw err;
      }
    },

    /** Expose breaker state for K8s readiness probe integration */
    getBreakerState: () => cbPolicy.state,
  };
}
