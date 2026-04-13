import pino from 'pino';
import type { Logger, LoggerOptions } from 'pino';
import { LogLevel } from './schema';

export interface LogConfig {
  serviceName: string;
  level?: string;
}

/**
 * Creates a pre-configured Pino logger.
 *
 * How log shipping works:
 * 1. PinoInstrumentation (configured in telemetry.ts) monkey-patches Pino
 * 2. Every pino.info/warn/error call is intercepted on the main thread
 * 3. The log record is forwarded to BatchLogRecordProcessor → OTLPLogExporter
 * 4. trace_id and span_id are injected automatically from the active OTel context
 */
export function createLogger(config: LogConfig): Logger {
  const { serviceName, level = LogLevel.INFO } = config;

  const options: LoggerOptions = {
    level,
    base: {
      service: serviceName,
    },
    redact: ['req.headers.authorization', 'res.headers.authorization'],
  };

  return pino(options, pino.destination({ dest: 1, sync: true }));
}
