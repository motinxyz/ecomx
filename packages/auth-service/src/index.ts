import {
  initTelemetry,
  createLogger,
  observabilityPlugin,
  recordLogin,
  opentelemetry,
} from '@ecomx/observability';

import {
  createAnalyticsClient,
  StructuredLogAnalyticsProvider,
} from '@ecomx/analytics';

import Elysia from 'elysia';

// 1. Create the service-scoped logger (Wait for dynamic ESM import if prettifying)
const log = await createLogger({
  serviceName: 'auth-service',
  level: process.env.LOG_LEVEL ?? 'info',
  pretty: process.env.NODE_ENV !== 'production',
});

// 3. Initialize the Analytics Orchestrator with our strategy
const analytics = createAnalyticsClient([new StructuredLogAnalyticsProvider()]);

// 4. Import and initialize Elysia

const app = new Elysia()
  // 1. Official Plugin: Automatically tracks how long routes take (Tracing)
  .use(opentelemetry())
  // 2. DIY Observability Plugin: Attaches the Pino logger (Logging)
  .use(observabilityPlugin(log))
  .get('/*', ({ params, logger: reqLog }) => {
    // Record login metric (for System Dashboards - DevOps)
    recordLogin('success');

    // Record behavioral event (Multiplexed to all registered Analytics Providers)
    analytics.track('UserLoggedIn', {
      userId: 'user_12345',
      method: 'email',
    });

    // We now use `logger` instead of standard console to pipe to Pino -> OTLP
    reqLog.info({ path: params['*'] }, 'wildcard route hit');
    return params['*'] ?? 'Sorry!';
  });

app.listen(3000);

log.info({ port: 3000 }, 'auth-service started');
