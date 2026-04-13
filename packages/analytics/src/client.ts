import type { AnalyticsProvider } from './types';

/**
 * The Master Orchestrator (Client)
 * 
 * This creates a multiplexer for analytics tracking calls. 
 * Instead of hardcoding a connection to PostHog, it accepts an array of Providers.
 * When `track()` is called, it iterates through the active providers and executes
 * them in parallel.
 * 
 * This allows the Application to easily toggle destinations based on environments:
 * e.g. NodeEnv="dev" array contains [StructuredLogProvider]
 *      NodeEnv="prod" array contains [MixpanelProvider, KafkaProvider]
 */
export function createAnalyticsClient(providers: AnalyticsProvider[] = []): AnalyticsProvider {
  return {
    /**
     * Dispatches the heavily-typed event to all active providers.
     */
    track: (eventName, properties) => {
      // Fire and forget across all providers. 
      // They are executed concurrently so one slow provider doesn't block the next.
      for (const provider of providers) {
        provider.track(eventName, properties);
      }
    },

    /**
     * Executes graceful shutdown procedures for all registered tools
     * (e.g. flushing SaaS SDK queues).
     */
    async shutdown() {
      await Promise.allSettled(
        providers.map((p) => p.shutdown?.())
      );
    }
  } as const;
}
