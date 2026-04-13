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
