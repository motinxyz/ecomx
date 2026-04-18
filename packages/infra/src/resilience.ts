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
  CircuitState,
} from 'cockatiel';
import {
  ResilienceError,
  BaseAppError,
  HttpStatus,
  FetchClientError,
} from './errors';

export { CircuitState };

export interface ResilienceConfig {
  /** Human-readable identifier (e.g., 'bkash-api', 'billing-service') */
  name: string;

  /** Total number of attempts (initial + retries). Default: 3 */
  maxAttempts?: number;

  /** Timeout per individual attempt in ms. Default: 5000 */
  timeoutMs?: number;

  /** Failure rate threshold (0–1) to trip the breaker. Default: 0.5 (50%) */
  threshold?: number;

  /** Minimum Requests Per Second required before the breaker starts sampling. Default: 5 */
  minimumRps?: number;

  /** Rolling window duration for sampling failures in ms. Default: 10_000 */
  samplingDurationMs?: number;

  /** How long breaker stays OPEN before probing in ms. Default: 30_000 */
  breakerCooldownMs?: number;

  /**
   * Injected callback for state change telemetry.
   * Consumers wire this to their observability layer — no circular dependency.
   */
  onStateChange?: (state: CircuitState, name: string) => void;

  /**
   * Emitted when Cockatiel schedules a retry attempt.
   * Wire this to a Prometheus counter to track retry volume per dependency.
   */
  onRetry?: (info: {
    name: string;
    attempt: number;
    delay: number;
    reason: string;
  }) => void;

  /**
   * Emitted when an individual attempt exceeds the timeout deadline.
   * Wire this to a Prometheus counter to track timeout frequency.
   */
  onTimeout?: (info: { name: string; timeoutMs: number }) => void;
}

/**
 * Creates a composable resilience policy: Timeout → Retry → Circuit Breaker.
 *
 * This is the pure policy engine. It has zero knowledge of HTTP or fetch.
 * The HttpClient consumes this to protect outbound network calls.
 */
export function createResiliencePolicy(config: ResilienceConfig) {
  const {
    name,
    maxAttempts = 3,
    timeoutMs = 5000,
    threshold = 0.5,
    minimumRps = 5,
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
    if (err instanceof FetchClientError && err.retryable === false) {
      return false;
    }
    return true;
  });

  // 2. RETRY — exponential backoff (defaults to starting at 128ms) before giving up.
  const rPolicy = retry(retryableFilter, {
    maxAttempts: maxAttempts,
    backoff: new ExponentialBackoff(),
  });

  // 3. CIRCUIT BREAKER — statistical sampling over a rolling window.
  // Trips when `threshold` % of calls fail within `samplingDurationMs`.
  const cbPolicy = circuitBreaker(retryableFilter, {
    halfOpenAfter: breakerCooldownMs,
    breaker: new SamplingBreaker({
      threshold,
      duration: samplingDurationMs,
      minimumRps,
    }),
  });

  // Wire state change events to the injected callback (Inversion of Control)
  if (onStateChange) {
    // We bind directly to Cockatiel's native state change emitter.
    // This guarantees that isolate() accurately emits CircuitState.Isolated
    // rather than accidentally masquerading as CircuitState.Open.
    cbPolicy.onStateChange((state) => onStateChange(state, name));
  }

  // Wire retry telemetry — fires BEFORE each retry delay begins.
  if (config.onRetry) {
    rPolicy.onRetry((event) => {
      config.onRetry!({
        name,
        attempt: event.attempt,
        delay: event.delay,
        reason:
          'error' in event
            ? event.error.message
            : 'Retryable error encountered',
      });
    });
  }

  // Wire timeout telemetry — fires when an individual attempt exceeds the deadline.
  if (config.onTimeout) {
    tPolicy.onTimeout(() => {
      config.onTimeout!({ name, timeoutMs });
    });
  }

  // 4. COMPOSE — order matters: breaker wraps retry wraps timeout.
  // If breaker is OPEN, we never even attempt the timeout or retry.
  const policy = wrap(cbPolicy, rPolicy, tPolicy);

  let isolateHandle: { dispose: () => void } | null = null;

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

        // 2. Individual attempt timed out OR User manually aborted
        if (err instanceof TaskCancelledError) {
          // If the external signal was aborted, the user cancelled it (e.g. closed browser)
          if (signal?.aborted) {
            throw new ResilienceError(
              `[${name}] request was aborted by caller`,
              err.name,
              HttpStatus.CLIENT_CLOSED_REQUEST,
            );
          }

          // Otherwise, it was the internal Cockatiel timeout policy that fired
          throw new ResilienceError(
            `[${name}] timed out after ${timeoutMs}ms`,
            err.name,
            HttpStatus.GATEWAY_TIMEOUT,
          );
        }

        // 3. Non-retryable errors (e.g., 4xx) bypassed the retry engine.
        //    Let them pass through to the consumer without wrapping.
        if (err instanceof FetchClientError && err.retryable === false) {
          throw err;
        }

        // 4. All retry attempts exhausted for a retryable error.
        //    Wrap with context so consumers know retries were attempted.
        if (err instanceof BaseAppError) {
          throw new ResilienceError(
            `[${name}] failed after ${maxAttempts} attempts: ${err.message}`,
            err.name,
            err.statusCode,
          );
        }

        // 5. Unknown error — wrap with generic 503
        if (err instanceof Error) {
          throw new ResilienceError(
            `[${name}] failed after ${maxAttempts} attempts: ${err.message}`,
            err.name,
          );
        }

        throw err;
      }
    },

    /** Expose breaker state for K8s readiness probe integration */
    getBreakerState: () => cbPolicy.state,

    /** Manually force the circuit breaker OPEN permanently (Kill Switch). */
    isolate: () => {
      if (!isolateHandle) {
        isolateHandle = cbPolicy.isolate();
      }
    },

    /** Manually heal the circuit breaker and restore traffic. */
    reset: () => {
      if (isolateHandle) {
        isolateHandle.dispose();
        isolateHandle = null;
      }
    },
  };
}
