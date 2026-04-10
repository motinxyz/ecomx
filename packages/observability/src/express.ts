import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';

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
 * Attaches a Pino child logger to `req.log` and hooks into the Node
 * response `finish` pipeline for automatic request/response logging,
 * ensuring trace contexts remain linked.
 */
export function expressObservabilityMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Inject the configured OTel logger into the request context
    req.log = logger;

    // 2. Log request start
    logger.info({ method: req.method, url: req.url }, 'request started');

    // 3. Hook into response finish to log completion status
    res.on('finish', () => {
      logger.info(
        { method: req.method, url: req.url, status: res.statusCode },
        'request completed',
      );
    });

    // 4. Hook into response errors (socket drops, early terminates)
    res.on('error', (err) => {
      logger.error(
        { method: req.method, url: req.url, err: err },
        'request failed',
      );
    });

    next();
  };
}
