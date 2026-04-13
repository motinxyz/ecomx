import { Elysia } from 'elysia';
import { getHealthStatus, Status } from '@ecomx/infra';

/**
 * Health Probes Plugin.
 *
 * Provides:
 * - GET /health/live: Liveness probe (The process is at least running)
 * - GET /health/ready: Readiness probe (The process is ready for traffic)
 */
export const healthPlugin = () =>
  new Elysia({ name: 'health-probes', prefix: '/health' })
    .get('/live', () => ({ status: Status.UP }))
    .get('/ready', async ({ set }) => {
      const { isReady, details } = await getHealthStatus();

      if (!isReady) {
        set.status = 503; // Service Unavailable
        return {
          status: Status.FAILED,
          dependencies: details,
        };
      }

      return {
        status: Status.READY,
        dependencies: details,
      };
    });
