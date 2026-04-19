import { CircuitState, type ResilienceConfig } from './resilience';
import { InfraAttr } from './schema/tags';

/**
 * Minimal logger contract that any structured logger (Pino, Winston, etc.)
 * satisfies out of the box. This avoids coupling @ecomx/infra to a specific
 * logging implementation.
 */
export interface TelemetryLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/**
 * State-to-log-level mapping for circuit breaker transitions.
 * Centralised here so every service in the monorepo logs identically.
 */
const STATE_LOG_LEVEL: Record<CircuitState, keyof TelemetryLogger> = {
  [CircuitState.Open]: 'error',
  [CircuitState.HalfOpen]: 'warn',
  [CircuitState.Closed]: 'info',
  [CircuitState.Isolated]: 'error', // Isolated means manually forced open
};

/**
 * Creates standardised telemetry hooks for an HttpClient instance.
 *
 * Returns `onStateChange`, `onRetry`, and `onTimeout` callbacks that are
 * ready to spread directly into an `HttpClientConfig`. This guarantees
 * every service in the monorepo produces identical, structured log output
 * for resilience events — no copy-paste, no drift.
 *
 * @example
 * ```typescript
 * const paymentClient = new HttpClient({
 *   baseUrl: 'https://api.stripe.com/v1',
 *   resilience: { 
 *     maxAttempts: 3, 
 *     timeoutMs: 4000,
 *     ...createHttpClientTelemetry(log)
 *   },
 * });
 * ```
 */
export function createHttpClientTelemetry(
  logger: TelemetryLogger,
): Partial<Pick<ResilienceConfig, 'onStateChange' | 'onRetry' | 'onTimeout'>> {
  return {
    onStateChange: [(state: CircuitState, name: string) => {
      const level = STATE_LOG_LEVEL[state];
      logger[level](
        { [InfraAttr.COMPONENT]: 'circuit-breaker', state: CircuitState[state] },
        `Dependency ${name} transitioned to ${CircuitState[state]}`,
      );
    }],

    onRetry: [({ name, attempt, delay }) => {
      logger.warn(
        { [InfraAttr.COMPONENT]: 'retry', dependency: name, attempt, delayMs: delay },
        `Retrying ${name} — attempt ${attempt} in ${delay}ms`,
      );
    }],

    onTimeout: [({ name, timeoutMs }) => {
      logger.error(
        { [InfraAttr.COMPONENT]: 'timeout', dependency: name, timeoutMs },
        `${name} timed out after ${timeoutMs}ms`,
      );
    }],
  };
}
