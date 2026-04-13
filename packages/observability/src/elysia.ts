import type { Logger } from 'pino';
import { Elysia } from 'elysia';
import { InfraAttr } from '@ecomx/infra';
import { ObservabilityAttr } from './schema';

/**
 * Elysia observability plugin.
 *
 * Decorates every request context with a logger and automatically
 * captures request lifecycle events using categorized semantic tags.
 */
export function elysiaObservabilityPlugin(logger: Logger) {
  return new Elysia({ name: 'observability' })
    .decorate('logger', logger)
    .onRequest(({ request, logger }) => {
      logger.info(
        {
          [ObservabilityAttr.METHOD]: request.method,
          [ObservabilityAttr.URL]: request.url,
        },
        'request started'
      );
    })
    .onAfterResponse(({ request, logger, set }) => {
      logger.info(
        {
          [ObservabilityAttr.METHOD]: request.method,
          [ObservabilityAttr.URL]: request.url,
          [ObservabilityAttr.STATUS_CODE]: set.status,
        },
        'request completed'
      );
    })
    .onError(({ request, logger, error }) => {
      // Cast to any to safely access message/name on varying Elysia error types
      const err = error as any;
      logger.error(
        {
          [ObservabilityAttr.METHOD]: request.method,
          [ObservabilityAttr.URL]: request.url,
          [InfraAttr.ERROR_MESSAGE]: err?.message || String(error),
          [InfraAttr.ERROR_TYPE]: err?.name || 'Error',
        },
        'request failed'
      );
    })
    .as('global');
}
