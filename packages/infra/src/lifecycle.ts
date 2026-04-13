/**
 * Lifecycle Hook Priority Constants
 * Lower numbers run earlier in the shutdown sequence.
 */
export const LifecyclePriority = {
  /** Mark as unhealthy/not ready (Inform Load Balancer) */
  PROBE_OFF: 0,
  /** Stop external traffic ingress first (e.g. Server.stop) */
  EARLY: 10,
  /** Default priority for internal business logic/queues */
  DEFAULT: 50,
  /** Close persistent IO connections (DB, Redis) */
  IO: 70,
  /** Flush observability buffers last (OTel, Metrics, Logs) */
  LATE: 90,
} as const;

export type LifecyclePriority = typeof LifecyclePriority[keyof typeof LifecyclePriority];

export type ShutdownHook = () => Promise<void> | void;

interface HookEntry {
  priority: LifecyclePriority;
  name: string;
  fn: ShutdownHook;
}

// Module-level state
const hooks: HookEntry[] = [];
let isShuttingDown = false;

/**
 * Returns true if the process is currently in a termination sequence.
 * Used by the Readiness engine to instantly fail external probes.
 */
export function isCurrentlyShuttingDown() {
  return isShuttingDown;
}

/**
 * Register a new shutdown hook.
 */
export function addShutdownHook(hook: HookEntry) {
  hooks.push(hook);
}

/**
 * Execute all registered hooks in order of priority.
 */
export async function startShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  process.stdout.write('\n[Lifecycle] Starting graceful shutdown...\n');

  // Sort by priority (asc)
  const sortedHooks = [...hooks].sort((a, b) => a.priority - b.priority);

  // Global dead-man's switch (25s)
  const timeout = setTimeout(() => {
    process.stderr.write('[Lifecycle] Shutdown timed out. Forcing exit.\n');
    process.exit(1);
  }, 25000);

  for (const { priority, name, fn } of sortedHooks) {
    process.stdout.write(
      `[Lifecycle] Executing hook: ${name} (Priority ${priority})...\n`
    );
    try {
      await fn();
    } catch (err) {
      process.stderr.write(
        `[Lifecycle] Error in hook "${name}": ${err}\n`
      );
    }
  }

  process.stdout.write('[Lifecycle] All hooks executed!\n\n');
  clearTimeout(timeout);

  // Give stdout a tiny bit of time to flush before hard exit
  await new Promise((r) => setTimeout(r, 50));
  process.exit(0);
}

/**
 * Attach SIGTERM/SIGINT listeners.
 */
export function initLifecycleListeners() {
  process.on('SIGTERM', () => startShutdown());
  process.on('SIGINT', () => startShutdown());
}
