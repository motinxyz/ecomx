import { addShutdownHook, LifecyclePriority } from '@ecomx/infra';
import { createResource } from './resource';
import { createExporters } from './exporters';
import { getCoreInstrumentations } from './sensors';
import { createSDK } from './sdk';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP collector base endpoint. Default: http://localhost:4318 */
  otlpEndpoint?: string;
}

/**
 * High-level entry point to initialize the full OpenTelemetry stack.
 * 
 * Automatically registers a shutdown hook with the global Lifecycle registry
 * to ensure spans and metrics are flushed before the process exits.
 */
export function initTelemetry(config: TelemetryConfig): {
  shutdown: () => Promise<void>;
} {
  const {
    serviceName,
    serviceVersion = '0.0.1',
    otlpEndpoint = 'http://localhost:4318',
  } = config;

  // 1. Build the metadata (Resource)
  const resource = createResource({ serviceName, serviceVersion });

  // 2. Build the transport (Exporters)
  const exporters = createExporters({ otlpEndpoint });

  // 3. Build the sensors (Instrumentations)
  const instrumentations = getCoreInstrumentations();

  // 4. Boot the SDK
  const sdkPromise = createSDK({
    resource,
    instrumentations,
    ...exporters,
  });

  const shutdown = async () => {
    const { shutdown } = await sdkPromise;
    await shutdown();
  };

  // 5. Auto-register with Lifecycle (Priority 90 - Flush last)
  addShutdownHook(LifecyclePriority.LATE, `opentelemetry-${serviceName}`, shutdown);

  return { shutdown };
}
