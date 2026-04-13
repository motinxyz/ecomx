import {
  isCurrentlyShuttingDown,
  addShutdownHook,
  LifecyclePriority,
} from './lifecycle';
import { ReadinessTimeoutError } from './errors';
import { Status } from './schema/values';

interface ReadinessEntry {
  name: string;
  check: () => Promise<boolean> | boolean;
}

// Module-level state
const readinessChecks: ReadinessEntry[] = [];
let isHealthy = true;

/**
 * Register a new dependency readiness check (e.g. database ping).
 */
export function addReadinessCheck(entry: ReadinessEntry) {
  readinessChecks.push(entry);
}

/**
 * Mark the process as unhealthy (e.g. following a SIGTERM).
 */
export function markUnhealthy() {
  isHealthy = false;
  process.stdout.write(
    '[Lifecycle] Process marked as UNHEALTHY (Readiness Probe OFF)\n'
  );
}

/**
 * Returns the dynamic, physical health status of the process and all dependencies.
 */
export async function getHealthStatus(): Promise<{
  isReady: boolean;
  details: Record<string, string>;
}> {
  // If we took a SIGTERM, we are completely unready.
  if (!isHealthy || isCurrentlyShuttingDown()) {
    return { isReady: false, details: { lifecycle: 'shutting_down' } };
  }

  // If no readiness checks exist, we default to healthy
  if (readinessChecks.length === 0) {
    return { isReady: true, details: {} };
  }

  const details: Record<string, string> = {};
  let isReady = true;

  // Run all dependency checks concurrently with a strict 3-second timeout constraint
  // If a DB is frozen, we do NOT want the HTTP health probe to hang indefinitely, causing K8s to reboot us.
  await Promise.allSettled(
    readinessChecks.map(async ({ name, check }) => {
      try {
        const timeoutMs = 3000;
        const timeoutBomb = new Promise<boolean>((_, reject) =>
          setTimeout(
            () => reject(new ReadinessTimeoutError(timeoutMs)),
            timeoutMs
          )
        );
        const passed = await Promise.race([check(), timeoutBomb]);

        if (passed) {
          details[name] = Status.UP;
        } else {
          details[name] = Status.FAILED;
          isReady = false;
        }
      } catch (error) {
        // Whether it was an external crash or our own DependencyTimeoutError, we catch it securely
        details[name] =
          error instanceof ReadinessTimeoutError
            ? Status.TIMEOUT
            : Status.FAILED;
        isReady = false;
      }
    })
  );

  return { isReady, details };
}

// Auto-register the probe to turn off the instant a shutdown sequence begins
addShutdownHook({
  priority: LifecyclePriority.PROBE_OFF,
  name: 'readiness-probe-off',
  fn: () => {
    markUnhealthy();
  },
});
