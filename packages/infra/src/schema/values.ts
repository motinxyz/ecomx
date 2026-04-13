/**
 * Standard Status and Enums Values (Infrastructure Level)
 *
 * Contains generic statuses that apply to all services regardless of domain.
 */
export const Status = {
  // ── General Statuses ─────────────────────────────────────
  SUCCESS: 'success',
  FAILED: 'failed',
  ERROR: 'error',
  PENDING: 'pending',
  SHUTTING_DOWN: 'shutting_down',
  UP: 'up',
  READY: 'ready',
  TIMEOUT: 'timeout',
} as const;

// export const Region = { US_EAST: 'us-east-1' };
