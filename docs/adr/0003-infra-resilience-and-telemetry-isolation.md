# Architecture Decision Record (ADR) 0003

## Title: Infrastructure Resilience & Telemetry Isolation
*   **Status:** Accepted
*   **Date:** 2026-04-18
*   **Deciders:** Core Platform Team

## Context and Problem Statement
When standardizing the `@ecomx/infra` package for network resilience (via Cockatiel) and observability, we needed to decide how deeply to couple our resilience tools with our telemetry layer, and how much control to expose to consuming microservices (e.g., `auth-service`). We had to balance developer experience (DevEx) with production safety.

## Decision Drivers
*   **Production Safety:** We cannot risk "kill switch" mechanisms causing permanent downtime due to memory leaks or unhandled garbage collection.
*   **Event Loop Performance:** Logging must not block the Node.js event loop or cause runaway ingestion costs.
*   **Interface Segregation:** Consumers should not be forced to implement telemetry hooks they don't need in unit tests.

## Considered Options
*   **Option 1:** Expose raw Cockatiel policies and handles to the consumer, forcing microservices to implement their own telemetry logging.
*   **Option 2:** Encapsulate policies in a strict `HttpClient` wrapper, bind native telemetry hooks internally, and enforce a minimalist `TelemetryLogger` interface.

## Decision Outcome
Chosen option: **Option 2**, because it perfectly insulates consuming microservices from the chaotic reality of the network and enforces enterprise-wide logging standards without violating SOLID principles.

### Key Implementation Details
1.  **Telemetry Isolation (No Debug Level):** The `TelemetryLogger` interface explicitly omits `debug` and `trace`. This enforces that resilience events only emit `info`, `warn`, and `error`, preventing developers from accidentally enabling costly `debug` logs in production that choke the event loop.
2.  **Circuit Breaker Isolation (Hidden Disposable Handles):** Cockatiel's `.isolate()` method returns a disposable handle rather than offering a symmetrical `.reset()` method. We encapsulate this handle internally within the `HttpClient` class. Exposing it to the consumer creates poor DevEx and risks the handle being garbage collected, which would render the circuit breaker permanently unhealable.
3.  **Strict State Change Telemetry:** We bind directly to Cockatiel's native `cbPolicy.onStateChange` emitter. This guarantees that when a human triggers the kill switch (`isolate()`), the telemetry explicitly logs an `error` level event for `Isolated`, immediately triggering DevOps alerts.
4.  **Semantic Metric Naming (Observability Ownership):** To maintain the zero-dependency purity of the `infra` package, all OpenTelemetry metric string identifiers (e.g., `infra.http_client.retry_total`) are explicitly owned by the `observability` package. They are centralized in a single `schema.ts` file to act as a strict public API contract with our Dashboards and Alerts, preventing "magic string" drift.

### Positive Consequences
*   Zero cognitive load for microservice developers; they do not write HTTP `try/catch` blocks.
*   Foolproof kill switches: Developers just call `client.isolate()` and `client.reset()`.
*   Standardized, high-quality logs across the entire monorepo with no drift.

### Negative Consequences
*   Slightly less granular control for consuming microservices compared to raw Cockatiel.
*   The `infra` package bears the full burden of correctly formatting error status codes (e.g., mapping `AbortError` to `499` vs `504`).

## Validation
*   When a microservice triggers `client.isolate()`, Datadog successfully registers a massive red alert due to the mapped `error` log level.
*   Network timeouts correctly bubble up to Elysia as `HTTP 504`, while user-aborted requests silently bubble up as `HTTP 499`.
