import type { Logger } from 'pino';
import { Elysia } from 'elysia';

/**
 * Elysia observability plugin.
 *
 * Decorates `ctx.logger` with a Pino child logger and hooks into
 * the request lifecycle for automatic request/response logging.
 *
 * Uses `.as('global')` so these hooks apply to ALL routes in the app,
 * not just routes defined inside this plugin instance.
 */
export function observabilityPlugin(logger: Logger) {
  return new Elysia({ name: 'observability' })
    .decorate('logger', logger)
    .onRequest(({ request, logger }) => {
      logger.info(
        {
          method: request.method,
          url: request.url,
        },
        'request started',
      );
    })
    .onAfterResponse(({ request, logger, set }) => {
      logger.info(
        {
          method: request.method,
          url: request.url,
          status: set.status,
        },
        'request completed',
      );
    })
    .onError(({ request, logger, error }) => {
      logger.error(
        {
          method: request.method,
          url: request.url,
          err: error,
        },
        'request failed',
      );
    })
    .as('global');
}
