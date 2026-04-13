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
