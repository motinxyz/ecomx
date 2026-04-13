import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { metrics } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { addShutdownHook, LifecyclePriority, InfraAttr } from '@ecomx/infra';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  /** OTLP collector base endpoint. Default: http://localhost:4318 */
  otlpEndpoint?: string;
}

/**
 * Initializes the full OpenTelemetry SDK pipeline (Resource, Exporters, Sensors)
 * cleanly in a single sequence.
 */
export async function initTelemetry(config: TelemetryConfig): Promise<{
  shutdown: () => Promise<void>;
}> {
  const {
    serviceName,
    serviceVersion = '0.0.1',
    environment = process.env.NODE_ENV || 'development',
    otlpEndpoint = 'http://localhost:4318',
  } = config;

  // 1. Define Resource (Identity)
  const resource = resourceFromAttributes({
    [InfraAttr.SERVICE_NAME]: serviceName,
    [InfraAttr.SERVICE_VERSION]: serviceVersion,
    [InfraAttr.ENVIRONMENT]: environment,
  });

  // 2. Define Exporters (Network Transport)
  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });
  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
  });
  const logExporter = new OTLPLogExporter({ url: `${otlpEndpoint}/v1/logs` });

  // 3. Define Sensors (Auto-instrumentations)
  const instrumentations = [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) => {
        return request.url?.includes('/health') || false;
      },
    }),
    new PinoInstrumentation({ disableLogSending: false }),
  ];

  // 4. Boot the SDK
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10_000,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
  });

  // 5. Start OpenTelemetry and Host Hardware Sensors
  sdk.start();
  const hostMetrics = new HostMetrics({
    meterProvider: metrics.getMeterProvider(),
  });
  hostMetrics.start();

  // 6. Provide a safe shutdown hook returning a Promise
  const shutdown = async () => {
    await sdk.shutdown();
  };

  // 7. Auto-register with the monorepo's lifecycle system
  addShutdownHook({
    priority: LifecyclePriority.LATE,
    name: `opentelemetry-${serviceName}`,
    fn: shutdown,
  });

  return { shutdown };
}
