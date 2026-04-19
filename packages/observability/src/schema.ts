/**
 * Core Observability Attributes
 * 
 * Standardized metadata specifically for observing 
 * HTTP request and response lifecycles.
 * Values strictly follow OpenTelemetry semantic conventions.
 */
export const ObservabilityAttr = {
  METHOD: 'http.request.method',
  URL: 'url.full',
  STATUS_CODE: 'http.response.status_code',
  USER_AGENT: 'user_agent.original',
  ROUTE: 'http.route',
} as const;

/**
 * Standard Log Levels
 * 
 * Vocabulary for describing the severity of log events.
 */
export const LogLevel = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
  SILENT: 'silent',
} as const;

/**
 * Infrastructure Metric Instrument Names
 *
 * The single source of truth for all OTel metric names emitted by
 * `@ecomx/infra` hooks. Centralized here so metric names are consistent
 * across all dashboards and alerts without duplication.
 *
 * IMPORTANT: These are treated like a public API contract.
 * Changing a name will break any Grafana dashboard or PagerDuty alert
 * that queries it. Only rename with a coordinated rollout.
 */
export const InfraMetrics = {
  METER_NAME: 'ecomx.infra',
  HTTP_CLIENT: {
    RETRY_TOTAL: 'infra.http_client.retry_total',
    TIMEOUT_TOTAL: 'infra.http_client.timeout_total',
    DURATION: 'infra.http_client.request.duration',
  },
  CIRCUIT_BREAKER: {
    TRANSITION_TOTAL: 'infra.circuit_breaker.transition_total',
    STATE: 'infra.circuit_breaker.state',
  },
} as const;
