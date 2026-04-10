import { 
  initTelemetry, 
  createLogger, 
  observabilityPlugin, 
  recordLogin,
} from '@ecomx/observability';

import {
  AnalyticsClient,
  StructuredLogAnalyticsProvider
} from '@ecomx/analytics';

// 1. Initialize distributed tracing (MUST BE FIRST)
initTelemetry({
  serviceName: 'auth-service',
  serviceVersion: '0.0.1',
  // otlpEndpoint: 'http://localhost:4318', 
});

// 2. Create the service-scoped logger
const log = createLogger({
  serviceName: 'auth-service',
  level: process.env.LOG_LEVEL ?? 'info',
  pretty: process.env.NODE_ENV !== 'production',
});

// 3. Initialize the Analytics Orchestrator with our strategy
const analytics = new AnalyticsClient([
  new StructuredLogAnalyticsProvider()
]);

// 4. Import and initialize Elysia
import Elysia from 'elysia';

const app = new Elysia()
  // Use the DIY observability plugin
  .use(observabilityPlugin(log))
  .get('/*', ({ params, logger: reqLog }) => {
    // Record login metric (for System Dashboards - DevOps)
    recordLogin('success');

    // Record behavioral event (Multiplexed to all registered Analytics Providers)
    analytics.track('UserLoggedIn', {
      userId: 'user_12345',
      method: 'email'
    });

    // We now use `logger` instead of standard console to pipe to Pino -> OTLP
    reqLog.info({ path: params['*'] }, 'wildcard route hit');
    return params['*'] ?? "Sorry!"
  })
  .listen(3000);

log.info({ port: 3000 }, 'auth-service started');
