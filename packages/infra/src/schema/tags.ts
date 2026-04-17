/**
 * Core Infrastructure Attributes
 * 
 * Contains exactly what is needed for process identity, tracing, and errors.
 * Values are strictly mapped to OpenTelemetry semantic conventions.
 */
export const InfraAttr = {
  // ── Process Identity ───────────────────────────────────────
  SERVICE_NAME: 'service.name',
  SERVICE_VERSION: 'service.version',
  ENVIRONMENT: 'deployment.environment.name', // OTel Standard
  HOST_NAME: 'host.name',
  PORT: 'server.port',

  // ── Distributed Tracing ────────────────────────────────────
  REQUEST_ID: 'request.id',

  // ── Result Semantics ───────────────────────────────────────
  ERROR_TYPE: 'error.type',
  ERROR_MESSAGE: 'exception.message', // OTel Standard
  COMPONENT: 'system.component', // OTel Standard for identifying the internal subsystem
} as const;
