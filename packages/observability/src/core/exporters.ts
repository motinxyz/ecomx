import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

export interface ExporterConfig {
  /** OTLP collector base endpoint. e.g. http://localhost:4318 */
  otlpEndpoint: string;
}

/**
 * Factory for OTLP HTTP Exporters.
 * Standardizes the URL sub-paths for each signal type.
 */
export function createExporters(config: ExporterConfig) {
  const { otlpEndpoint } = config;

  return {
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),
    metricExporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
    }),
    logExporter: new OTLPLogExporter({
      url: `${otlpEndpoint}/v1/logs`,
    }),
  };
}
