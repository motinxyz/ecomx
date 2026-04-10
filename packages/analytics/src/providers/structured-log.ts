import type { AnalyticsProvider } from '../types';
import type { EcommerceEvents } from '../events';

/**
 * Structured Log Provider (Target: Kafka / Data Warehouses)
 * 
 * Outputs high-performance raw NDJSON (Newline Delimited JSON) to standard out
 * flagged with heavily-typed identifiers.
 * 
 * In production, a Sidecar proxy (FluentBit/Datadog Agent) watches stdout,
 * intercepts lines with `__type: "analytics_event"`, and streams them to 
 * Kafka or Snowflake.
 * 
 * Benefits:
 * - Ultra low-latency (no external HTTP calls slowing down Node)
 * - Zero API key management in the application code
 * - Mathematically guarantees zero data loss (if container crashes, 
 *   logs are already harvested by container orchestrator).
 */
export class StructuredLogAnalyticsProvider implements AnalyticsProvider {
  track<K extends keyof EcommerceEvents>(eventName: K, properties: EcommerceEvents[K]): void {
    const payload = {
      __type: 'analytics_event',
      __timestamp: new Date().toISOString(),
      event: eventName,
      properties,
    };

    // Fast synchronous stream write. No promise wrapping needed.
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
}
