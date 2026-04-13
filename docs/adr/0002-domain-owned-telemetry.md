# 2. Domain-Owned Telemetry Metrics

*   **Status:** Accepted
*   **Date:** 2026-04-11
*   **Deciders:** Core Engineering Team

## Context and Problem Statement
When initializing OpenTelemetry, a common anti-pattern is for the foundational `observability` package to instantiate all specific business counters and histograms (e.g. `recordLogin`, `recordOrder`). This creates a "God Package" bottleneck. If the `billing-service` team wants to track a new metric, they are forced to modify the lowest layer of the monorepo's infrastructure to define it, causing high coupling and circular dependencies.

## Decision Drivers
*   Strict adherence to Domain-Driven Design (DDD).
*   Eliminating circular dependencies (Infrastructure packages must not import Business packages).
*   Scaling velocity (Microservice teams should not need approval to add their own standard metrics).

## Considered Options
*   **Option 1: Global metrics in `observability`**: All metrics live in `@ecomx/observability/src/metrics.ts`. 
    *   *Rejected:* Causes inverted dependencies. The infra layer has to know what a `PaymentMethod` or an `AuthMethod` is.
*   **Option 2: Global metrics in `analytics`**: All OTel metrics live in an `analytics` package.
    *   *Rejected:* Mixes behavioral product analytics (Mixpanel/PostHog) with systems engineering observability (Prometheus/Grafana).
*   **Option 3: Domain-Owned Microservice Metrics**: Infrastructure only provides the `Sdk` and `@opentelemetry/api`. The Microservice defines its own metrics internally.

## Decision Outcome
Chosen option: **Option 3: Domain-Owned Microservice Metrics**.

The `@ecomx/observability` package is strictly an engine. It initializes the OTel exporters, Context propagation, and Pino interceptors. It is globally forbidden from containing business logic or specific counters.

Each microservice (e.g. `@ecomx/auth-service`) must import `@opentelemetry/api` into its own `package.json` and declare its own meters and metrics in a localized `src/metrics.ts` file.

### Positive Consequences
*   If a microservice is deleted, its metrics are naturally deleted with it. No dead code is left rotting in global packages.
*   Zero circular dependencies. The dependency graph strictly flows down: `Service` -> `Analytics` -> `Observability` -> `Infra`.

### Negative Consequences
*   Slight boilerplate repetition: Each individual service has to manually call `metrics.getMeter('my-service')`. This is an accepted trade-off for perfect domain isolation.
