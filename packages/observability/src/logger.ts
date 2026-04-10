import pino, { type Logger, type LoggerOptions } from 'pino';

export interface LoggerConfig {
  serviceName: string;
  level?: string;
  /** Set to true for pretty-printed dev output. In production, leave false for JSON. */
  pretty?: boolean;
}

/**
 * Create a service-scoped Pino logger.
 *
 * How log shipping works:
 * 1. PinoInstrumentation (configured in telemetry.ts) monkey-patches Pino
 * 2. Every pino.info/warn/error call is intercepted on the main thread
 * 3. The log record is forwarded to BatchLogRecordProcessor → OTLPLogExporter
 * 4. trace_id and span_id are injected automatically from the active OTel context
 */
export function createLogger(config: LoggerConfig): Logger {
  const { serviceName, level = 'info', pretty = false } = config;

  const options: LoggerOptions = {
    level,
    // Redact sensitive fields from log output
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };

  let stream = process.stdout;

  if (pretty) {
    try {
      // Use synchronous pino-pretty stream to keep execution on main thread.
      // This avoids the worker-thread `transport` issue, allowing OTel to intercept!
      const prettyFactory = require('pino-pretty');
      stream = prettyFactory({
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      });
    } catch {
      // pino-pretty missing (prod mode), fallback to pure JSON stdout
    }
  }

  const baseLogger = pino(options, stream);

  // Child logger binds `service` to every log line from this instance
  return baseLogger.child({ service: serviceName });
}
