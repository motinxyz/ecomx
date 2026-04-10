import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { metrics } from '@opentelemetry/api';
import type { Resource } from '@opentelemetry/resources';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { PushMetricExporter } from '@opentelemetry/sdk-metrics';
import type { LogRecordExporter } from '@opentelemetry/sdk-logs';

export interface SDKConfig {
  resource: Resource;
  instrumentations: Instrumentation[];
  traceExporter: SpanExporter;
  metricExporter: PushMetricExporter;
  logExporter: LogRecordExporter;
}

/**
 * Orchestrates the full OpenTelemetry SDK lifecycle.
 */
export async function createSDK(config: SDKConfig) {
  const { resource, instrumentations, traceExporter, metricExporter, logExporter } = config;

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(logExporter),
    ],
  });

  // Start the SDK
  sdk.start();

  // Start Host Metrics
  const hostMetrics = new HostMetrics({
    meterProvider: metrics.getMeterProvider(),
  });
  hostMetrics.start();

  return {
    sdk,
    /**
     * Cleanly shut down all telemetry exporters and processors.
     */
    shutdown: () => sdk.shutdown(),
  };
}
