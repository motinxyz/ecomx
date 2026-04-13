# `@ecomx/analytics`

The `analytics` package is the centralized Behavioral Event Engine for the Ecomx monorepo. It manages *Product Metrics* (what the users do) rather than *System Metrics* (how the servers perform).

This package depends *only* on `@ecomx/infra`.

## 🎯 Module Responsibility (The Contract)
1. **The Multiplexer**: Providing the `createAnalyticsClient()` orchestrator. This allows your application to fire a single tracking event (`analytics.track()`) which is automatically distributed to an array of Data Warehouse destinations concurrently (e.g. Mixpanel, Kafka, Datadog).
2. **The Data Dictionary**: Enforcing the exact shape of behavioral events via strongly-typed TypeScript definitions in `events.ts`.

## 🛑 What is Forbidden Here
*   **System Observability (OpenTelemetry)**: This package must NOT contain `@opentelemetry/api`. If you need to write a system Histogram or Counter (e.g. `recordMemoryPressure` or `recordOrdersProcessed`), it goes directly into the microservice codebase that owns the domain. 
*   **Inverted Dependencies**: This package sits extremely low in the dependency graph. It cannot import from `@ecomx/auth-service` or `@ecomx/billing-service`.

## 📝 Usage Example
```typescript
import { createAnalyticsClient, StructuredLogAnalyticsProvider, EventName, BusinessAttr } from '@ecomx/analytics';

// Instantiate the client in the boot sequence with your environment-specific providers
const analytics = createAnalyticsClient([
    new StructuredLogAnalyticsProvider()
]);

// Track strongly-typed events in the route handler
analytics.track(EventName.CART_ADDED, {
    [BusinessAttr.USER_ID]: 'usr_9182',
    [BusinessAttr.PRODUCT_ID]: 'sku_apple'
});
```
