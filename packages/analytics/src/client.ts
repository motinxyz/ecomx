import type { EcommerceEvents } from './events';
import type { AnalyticsProvider } from './types';

/**
 * The Master Orchestrator (Client)
 * 
 * This class multiplexes analytics tracking calls. 
 * Instead of hardcoding a connection to PostHog, it accepts an array of Providers.
 * When `track()` is called, it iterates through the active providers and executes
 * them in parallel.
 * 
 * This allows the Application to easily toggle destinations based on environments:
 * e.g. NodeEnv="dev" array contains [StructuredLogProvider]
 *      NodeEnv="prod" array contains [MixpanelProvider, KafkaProvider]
 */
export class AnalyticsClient {
  private providers: AnalyticsProvider[];

  constructor(providers: AnalyticsProvider[] = []) {
    this.providers = providers;
  }

  /**
   * Registers a new provider at runtime.
   */
  public addProvider(provider: AnalyticsProvider) {
    this.providers.push(provider);
  }

  /**
   * Dispatches the heavily-typed event to all active providers.
   */
  public track<K extends keyof EcommerceEvents>(
    eventName: K,
    properties: EcommerceEvents[K]
  ): void {
    if (this.providers.length === 0) {
      console.warn(`[AnalyticsClient] Event heavily dropped: ${eventName} - No providers registered.`);
      return;
    }

    // Fire and forget across all providers. 
    // They are executed concurrently so one slow provider doesn't block the next.
    for (const provider of this.providers) {
      provider.track(eventName, properties);
    }
  }

  /**
   * Executes graceful shutdown procedures for all registered tools
   * (e.g. flushing SaaS SDK queues).
   */
  public async shutdown() {
    await Promise.all(
      this.providers.map((p) => p.shutdown && p.shutdown())
    );
  }
}
