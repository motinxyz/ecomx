# `@ecomx/infra`

The `infra` package is the absolute foundation of the Ecomx monorepo. It sits at layer 0 (Layer Zero) of the dependency graph. **No package below this exists.**

## 🎯 Module Responsibility (The Contract)
This package has exactly two responsibilities:
1. **The Core Vocabulary**: Centralizing all string literals (`InfraAttr`, `Status`) into strictly-typed TypeScript objects.
2. **The Lifecycle Orchestrator**: Providing the `addShutdownHook` mechanism to manage graceful degradation of services via `SIGTERM` handlers.

## 🛑 What is Forbidden Here
*   **Business Logic**: You may not import `user`, `cart`, `payment`, or `auth` logic here.
*   **Third-Party Telemetry SDKs**: Do not put Pino, OpenTelemetry, Datadog or Prometheus here. This package should run completely agnostic to what monitoring tools we buy or use.
*   **External Dependencies**: Keep `package.json` zero-dependency or as close to zero-dependency as mathematically possible.

## 📝 Usage Example
```typescript
import { InfraAttr, Status, addShutdownHook, LifecyclePriority } from '@ecomx/infra';

// Use standardized schemas
const myService = {
  [InfraAttr.SERVICE_NAME]: 'shipping-service',
  status: Status.SUCCESS
};

// Graceful shut down DB connections before the HTTP server dies
addShutdownHook(LifecyclePriority.MIDDLE, 'postgres', async () => {
  await prisma.$disconnect();
});
```

## 🔄 Resilience Error Execution Pipeline

The `HttpClient` normalizes network chaos into structured `BaseAppError` objects through a strict 4-layer pipeline.

### Layer 1: The Native Network (`http-client.ts`)
Intercepts the raw `fetch` call.
*   **Network Crash (DNS/ECONNREFUSED):** Wraps `TypeError` in `FetchClientError(502)` (`retryable: true`).
*   **Request Aborted:** Passes native DOM `AbortError` directly to Cockatiel.
*   **Client Error (4xx):** Throws `FetchClientError` (`retryable: false`).
*   **Server Error (5xx):** Throws `FetchClientError` (`retryable: true`).
*   **Corrupt Payload (JSON parse failure):** Throws `FetchClientError(502)` (`retryable: false`).

### Layer 2: The Resilience Engine (`resilience.ts` / Cockatiel)
*   **The Gateway:** Bypasses retries for `retryable: false` errors completely.
*   **The Retry Loop:** Attempts `ExponentialBackoff` up to 3 times for `retryable: true` errors.
*   **The Stopwatch:** Forcibly triggers `AbortSignal` if execution exceeds `timeoutMs`, converting to a retryable `TaskCancelledError`.
*   **The Circuit Breaker:** Trips to `OPEN` if the failure threshold is exceeded, instantly rejecting future requests.

### Layer 3: The Final Translation
Translates Cockatiel engine state into standard HTTP errors before leaving the package.
1.  **Breaker OPEN:** -> `ResilienceError(503 Service Unavailable)`
2.  **User Aborted:** -> `ResilienceError(499 Client Closed Request)` (Silences false-positive alarms)
3.  **Timeout Exhausted:** -> `ResilienceError(504 Gateway Timeout)`
4.  **Exhausted Server Errors (5xx):** -> `ResilienceError(5xx)` (Preserves original status code)
5.  **Bypassed Errors (4xx):** -> Passed through raw.

### Layer 4: The Consumer
Microservices consuming this package do not need `try/catch` blocks. A global error handler (e.g., Elysia `app.onError`) can safely return `error.statusCode` directly to the client.
