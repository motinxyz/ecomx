import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import { InfraAttr } from '@ecomx/infra';
import { ObservabilityAttr } from './schema';

// Inject the custom 'log' property into the Express Request type globally
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      log: Logger;
    }
  }
}

/**
 * Express observability middleware.
 *
 * Attaches a Pino child logger to `req.log` and captures request
 * lifecycle events using standardized categorized semantic tags.
 */
export function expressObservabilityMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Inject the configured OTel logger into the request context
    req.log = logger;

    const requestContext = {
      [ObservabilityAttr.METHOD]: req.method,
      [ObservabilityAttr.URL]: req.url,
    };

    // 2. Log request start
    logger.info(requestContext, 'request started');

    // 3. Hook into response finish to log completion status
    res.on('finish', () => {
      logger.info(
        { ...requestContext, [ObservabilityAttr.STATUS_CODE]: res.statusCode },
        'request completed',
      );
    });

    // 4. Hook into response errors (socket drops, early terminates)
    res.on('error', (err) => {
      logger.error(
        { 
          ...requestContext, 
          [InfraAttr.ERROR_MESSAGE]: err.message, 
          [InfraAttr.ERROR_TYPE]: err.name 
        },
        'request failed',
      );
    });

    next();
  };
}
