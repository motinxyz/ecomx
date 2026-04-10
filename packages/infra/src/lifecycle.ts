/**
 * Lifecycle Hook Priority Constants
 * Lower numbers run earlier in the shutdown sequence.
 */
export const LifecyclePriority = {
  /** Stop external traffic ingress first (e.g. Server.stop) */
  EARLY: 10,
  /** Default priority for internal business logic/queues */
  DEFAULT: 50,
  /** Close persistent IO connections (DB, Redis) */
  IO: 70,
  /** Flush observability buffers last (OTel, Metrics, Logs) */
  LATE: 90,
} as const;

export type ShutdownHook = () => Promise<void> | void;

interface HookEntry {
  name: string;
  priority: number;
  fn: ShutdownHook;
}

// Module-level state (private to this file)
const hooks: HookEntry[] = [];
let isShuttingDown = false;

/**
 * Register a new shutdown hook.
 */
export function addShutdownHook(priority: number, name: string, fn: ShutdownHook) {
  hooks.push({ name, priority, fn });
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

  for (const hook of sortedHooks) {
    process.stdout.write(`[Lifecycle] Executing hook: ${hook.name} (Priority ${hook.priority})...\n`);
    try {
      await hook.fn();
    } catch (err) {
      process.stderr.write(`[Lifecycle] Error in hook "${hook.name}": ${err}\n`);
    }
  }

  process.stdout.write('[Lifecycle] All hooks executed. Bye!\n\n');
  clearTimeout(timeout);
  
  // Give stdout a tiny bit of time to flush before hard exit
  await new Promise(r => setTimeout(r, 50));
  process.exit(0);
}

/**
 * Attach SIGTERM/SIGINT listeners to the process.
 */
export function initLifecycleListeners() {
  process.on('SIGTERM', () => startShutdown());
  process.on('SIGINT', () => startShutdown());
}
