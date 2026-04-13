/**
 * Builds a frozen analytics payload envelope.
 * All providers must call this to construct their payload,
 * ensuring consistent structure across every transport (Pino, stdout, Kafka).
 */
export function buildAnalyticsPayload(
  eventName: string,
  properties: Record<string, unknown>
) {
  return {
    __type: 'analytics_event',
    __timestamp: new Date().toISOString(),
    event: eventName,
    properties,
  };
}
