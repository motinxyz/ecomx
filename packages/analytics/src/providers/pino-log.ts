import type { Logger } from 'pino';
import type { AnalyticsProvider } from '../types';
import type { EcommerceEvents } from '../events';
import { buildAnalyticsPayload } from '../payload';

export class PinoAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly logger: Logger) {}

  track<K extends keyof EcommerceEvents>(
    eventName: K,
    properties: EcommerceEvents[K]
  ): void {
    const payload = buildAnalyticsPayload(eventName, properties);
    this.logger.info(payload, `[analytics] ${eventName}`);
  }
}
