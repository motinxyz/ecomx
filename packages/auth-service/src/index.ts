import {
  createLogger,
  elysiaObservabilityPlugin,
  opentelemetry,
  healthPlugin,
  ObservabilityAttr,
  LogLevel,
} from '@ecomx/observability';

import {
  createAnalyticsClient,
  StructuredLogAnalyticsProvider,
  EventName,
  AuthMethod,
  PinoAnalyticsProvider,
} from '@ecomx/analytics';

import { recordLogin } from './metrics';

import {
  addShutdownHook,
  initLifecycleListeners,
  LifecyclePriority,
  InfraAttr,
  Status,
} from '@ecomx/infra';
import Elysia from 'elysia';

// 1. Initialize deterministic shutdown listeners
initLifecycleListeners();

// 2. Create the service-scoped logger
const log = createLogger({
  serviceName: 'auth-service',
  level: process.env.LOG_LEVEL ?? LogLevel.INFO,
});

// 3. Initialize the Analytics Orchestrator with our strategy
// const analytics = createAnalyticsClient([new StructuredLogAnalyticsProvider()]);
const analytics = createAnalyticsClient([new PinoAnalyticsProvider(log)]);

const app = new Elysia()
  // Official Plugin: Automatically tracks how long routes take (Tracing)
  .use(opentelemetry())
  // DIY Observability Plugin: Attaches the Pino logger (Logging)
  .use(elysiaObservabilityPlugin(log))
  // Health Probes: Liveness & Readiness checks
  .use(healthPlugin())
  .get('/*', ({ params, logger: reqLog }) => {
    // Record login metric
    recordLogin(Status.SUCCESS);

    // Record behavioral event
    analytics.track(EventName.USER_LOGGED_IN, {
      'user.id': 'user_12345',
      'auth.method': AuthMethod.EMAIL,
    });

    // Use ObservabilityAttr for technical request logging
    reqLog.info(
      { [ObservabilityAttr.ROUTE]: params['*'] },
      'wildcard route hit'
    );
    return params['*'] ?? 'Sorry!';
  });

// Register the Elysia server with the Lifecycle orchestrator
addShutdownHook({
  priority: LifecyclePriority.EARLY,
  name: 'elysia-http-server',
  fn: async () => {
    log.info('stopping elysia http server...');
    await app.stop();
  },
});

app.listen(3000);

// Use InfraAttr for the core process info (port)
log.info({ [InfraAttr.PORT]: 3000 }, 'auth-service started');
