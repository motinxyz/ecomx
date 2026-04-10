import { initTelemetry } from './core';

/**
 * Instrumentation Script
 *
 * This file is designed to be used with the `--preload` flag (Bun) or `--import` flag (Node.js).
 * It initializes the OpenTelemetry SDK before any other application code runs,
 * solving the ESM hoisting issue and ensuring all modules are correctly instrumented.
 *
 * It reads configuration from standard OpenTelemetry environment variables:
 * - OTEL_SERVICE_NAME: The name of the service (required)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: The OTLP collector endpoint (optional, defaults to http://localhost:4318)
 * - OTEL_SERVICE_VERSION: The version of the service (optional)
 */

const serviceName =
  process.env.OTEL_SERVICE_NAME ||
  process.env.npm_package_name ||
  'unknown-service';
const serviceVersion =
  process.env.OTEL_SERVICE_VERSION ||
  process.env.npm_package_version ||
  '0.0.1';
const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

// Initialize the telemetry engine
// We do not store the SDK instance here because the telemetry.ts handles registration to global providers.
initTelemetry({
  serviceName,
  serviceVersion,
  otlpEndpoint,
});

console.log(
  `[Observability] Telemetry engine initialized for "${serviceName}" via preload.`
);
