import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { metrics } from '@opentelemetry/api';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions/incubating';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
// import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP collector base endpoint. Default: http://localhost:4318 */
  otlpEndpoint?: string;
}

/**
 * Initialize the full OpenTelemetry stack (Traces, Metrics, Logs).
 *
 * MUST be called at the very top of your service's entry point,
 * before importing Elysia or any other library, so that
 * auto-instrumentation can patch modules before they are used.
 */
export function initTelemetry(config: TelemetryConfig): NodeSDK {
  const {
    serviceName,
    serviceVersion = '0.0.1',
    otlpEndpoint = 'http://localhost:4318',
  } = config;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? 'development',
  });

  const sdk = new NodeSDK({
    resource,

    // Only capture 5% of traces
    // sampler: new TraceIdRatioBasedSampler(0.05),

    // ── Traces ────────────────────────────────────────────────
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),

    // ── Metrics ──────────────────────────────────────────────
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${otlpEndpoint}/v1/metrics`,
      }),
      exportIntervalMillis: 10_000,
    }),

    // ── Logs ─────────────────────────────────────────────────
    // BatchLogRecordProcessor batches log records in memory and
    // flushes them periodically
    // PinoInstrumentation intercepts pino.info/warn/error calls
    // and feeds them into this pipeline automatically.
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `${otlpEndpoint}/v1/logs`,
        })
      ),
    ],

    // ── Instrumentations ─────────────────────────────────────
    instrumentations: [
      new HttpInstrumentation(),
      new PinoInstrumentation({
        // When true, PinoInstrumentation forwards every pino log
        // as an OTel LogRecord to the processor pipeline above.
        disableLogSending: false,
      }),
    ],
  });

  // this SDK registers the global providers
  sdk.start();

  // Host-level metrics (CPU, Memory, Network I/O)
  // Uses the global MeterProvider that NodeSDK just configured
  const hostMetrics = new HostMetrics({
    meterProvider: metrics.getMeterProvider(),
  });
  hostMetrics.start();

  // Graceful shutdown — flush all buffered telemetry before exit
  const shutdown = async () => {
    await sdk.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return sdk;
}
