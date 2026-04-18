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
  // StructuredLogAnalyticsProvider,
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
  HttpClient,
  addReadinessCheck,
  CircuitState,
  createHttpClientTelemetry,
} from '@ecomx/infra';
import Elysia from 'elysia';

// 1. Initialize deterministic shutdown listeners
initLifecycleListeners();

// 2. Create the service-scoped logger
const logger = createLogger({
  serviceName: 'auth-service',
  level: process.env.LOG_LEVEL ?? LogLevel.INFO,
});

// 3. Initialize the Analytics Orchestrator with our strategy
// const analytics = createAnalyticsClient([new StructuredLogAnalyticsProvider()]);
const analytics = createAnalyticsClient([new PinoAnalyticsProvider(logger)]);

// 4. Initialize external dependencies with pure Resilience
const paymentClient = new HttpClient({
  name: 'stripe-api',
  baseUrl: 'https://api.stripe.com/v1',
  resilience: {
    maxAttempts: 2,
    timeoutMs: 4000,
    ...createHttpClientTelemetry(logger),
  },
});

// 5. Connect the Circuit Breaker to K8s Readiness (if Stripe is fully down, take us offline!)
addReadinessCheck({
  name: 'stripe-api',
  check: () => paymentClient.getBreakerState() !== CircuitState.Open,
});

const app = new Elysia()
  // Official Plugin: Automatically tracks how long routes take (Tracing)
  .use(opentelemetry())
  // DIY Observability Plugin: Attaches the Pino logger (Logging)
  .use(elysiaObservabilityPlugin(logger))
  // Health Probes: Liveness & Readiness checks
  .use(healthPlugin())

  // Real-world lifecycle example
  .post('/checkout', async ({ body, request, logger: reqLog }) => {
    reqLog.info('Initiating external payment call...');

    // The request.signal automatically aborts if the Elysia client drops connection.
    // We pass it to the paymentClient so the Retry engine inside Cockatiel knows to stop.
    try {
      const receipt = await paymentClient.post('/charges', body, {
        signal: request.signal,
        idempotencyKey: crypto.randomUUID(),
      });
      return { success: true, receipt };
    } catch (err: unknown) {
      // The ResilienceError (503) or FetchClientError (502) bubbles up cleanly
      // We narrow the type from "unknown" to an object we can log safely
      const errorData =
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err);
      reqLog.error(
        { err: errorData },
        'Payment processing failed due to upstream error',
      );
      throw err;
    }
  })

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
      'wildcard route hit',
    );
    return params['*'] ?? 'Sorry!';
  });

// Register the Elysia server with the Lifecycle orchestrator
addShutdownHook({
  priority: LifecyclePriority.EARLY,
  name: 'elysia-http-server',
  fn: async () => {
    logger.info('stopping elysia http server...');
    await app.stop();
  },
});

app.listen(3000);
logger.info({ [InfraAttr.PORT]: 3000 }, 'auth-service started');
