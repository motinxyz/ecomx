# `@ecomx/observability`

The `observability` package is the central Telemetry Engine (Layer 1) for the Ecomx monorepo. It automatically intercepts, formats, and exports all system logs, traces, and metrics to your backend (Prometheus/Grafana/Datadog) via OpenTelemetry.

This package depends *only* on `@ecomx/infra`.

## 🎯 Module Responsibility (The Contract)
1. **The Telemetry Engine**: Managing the OpenTelemetry `NodeSDK`, configuring OTLP exporters, and registering automated instrumentation sensors (HTTP, Pino framework hooks).
2. **Infrastructure Metrics Adapter**: Providing the `createInfraMetrics` bridge to translate `@ecomx/infra` hooks into OTel Counters, Histograms, and ObservableGauges.
3. **Standardized Logging**: Exporting `createLogger()`, a perfectly configured synchronous Pino instance guaranteed to preserve OTel Trace Context across asynchronous boundaries.
4. **Framework Middleware**: Exporting plug-and-play middleware (e.g. `elysiaObservabilityPlugin`) to instantly trace HTTP routers.

## 🛑 What is Forbidden Here
*   **Domain Specific Metrics**: This package provides the **Engine**, not the **Data**. You may *not* define `recordLogin()`, `recordCheckout()`, or `recordDatabaseError()` here. If you need a specialized counter, you must define it locally inside the microservice (`@ecomx/auth-service/src/metrics.ts`). *(Note: We DO own the string constants for standard infrastructure metrics in `schema.ts`, as they are universal across all services).*
*   **Behavioral Trackers**: Do not install Mixpanel, PostHog, or Google Analytics SDKs here. Those are product analytics, not system observability. (See `@ecomx/analytics`).
*   **`pino-pretty` logic**: For trace context to work correctly, production logging must be raw JSON pumped directly to `stdout`. Do not configure `pretty` printing inside the logger options. Instead, pipe the output in your `package.json` execution scripts (`node dist/index.js | pino-pretty`).

## 📝 Usage Example
```typescript
import { createLogger, elysiaObservabilityPlugin, opentelemetry } from '@ecomx/observability';
import Elysia from 'elysia';

const log = createLogger({ serviceName: 'user-service' });

const app = new Elysia()
  .use(opentelemetry())
  .use(elysiaObservabilityPlugin(log))
```
