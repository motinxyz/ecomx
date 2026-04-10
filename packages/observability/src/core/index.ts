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
 * Refactored to use a modular internal architecture (Resource, Exporters, SDK).
 * Preserves the original signature for backward compatibility.
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
  // Note: We use a synchronous initialization here to match the project's bootstrap style,
  // although createSDK internally is async ready.
  const sdkPromise = createSDK({
    resource,
    instrumentations,
    ...exporters,
  });

  // Provide a clean shutdown handle for the caller
  return {
    shutdown: async () => {
      const { shutdown } = await sdkPromise;
      await shutdown();
    },
  };
}
