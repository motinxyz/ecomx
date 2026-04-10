import type { EcommerceEvents } from './events';

/**
 * The Strategy Pattern Interface
 * 
 * Defines the contract that every Analytics Destination must implement.
 * By enforcing this, the `AnalyticsClient` can multiplex identical payloads
 * to Mixpanel, Kafka, and PostHog simultaneously.
 */
export interface AnalyticsProvider {
  track<K extends keyof EcommerceEvents>(
    eventName: K,
    properties: EcommerceEvents[K],
  ): void | Promise<void>;
  
  // Future-proofing: allowing providers to execute graceful shutdowns 
  // (e.g. flushing network queues before container exit).
  shutdown?: () => Promise<void>;
}
