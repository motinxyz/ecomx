import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import type { Instrumentation } from '@opentelemetry/instrumentation';

/**
 * Returns a list of default auto-instrumentations for a 2026 production app.
 * Can be extended later with database, redis, or messaging tracers.
 */
export function getCoreInstrumentations(): Instrumentation[] {
  return [
    new HttpInstrumentation(),
    new PinoInstrumentation({
      // Forwards every pino log as an OTel LogRecord
      disableLogSending: false,
    }),
  ];
}
