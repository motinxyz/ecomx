import type { ResilienceConfig } from './resilience';

/**
 * Automatically extracts every key from ResilienceConfig whose type
 * is an optional Array of functions. If a new hook is added to
 * ResilienceConfig, this type updates itself — zero maintenance.
 */

export type HookKeys = {
  [K in keyof ResilienceConfig]: ResilienceConfig[K] extends  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | Array<(...args: any[]) => void>
    | undefined
    ? K
    : never;
}[keyof ResilienceConfig] &
  string;

type PartialHooks = Partial<Pick<ResilienceConfig, HookKeys>>;
type PartialConfig = Partial<Omit<ResilienceConfig, 'name' | HookKeys>>;

/**
 * The definitive set of hook keys, kept in sync with the derived type.
 * Used at runtime to distinguish hooks (concatenate) from scalars (overwrite).
 */
const _hookKeyExhaustiveCheck: Record<HookKeys, true> = {
  onStateChange: true,
  onRetry: true,
  onTimeout: true,
  onResponse: true,
};

/**
 * The definitive set of hook keys, kept in sync with the derived type.
 * Used at runtime to distinguish hooks (concatenate) from scalars (overwrite).
 */
const HOOK_KEYS: ReadonlySet<string> = new Set(
  Object.keys(_hookKeyExhaustiveCheck),
);

/**
 * Merges resilience configuration and any number of hook providers
 * into a single ResilienceConfig (minus `name`, which HttpClient injects).
 *
 * Hook arrays from all sources are concatenated (fan-out).
 * Scalar config values use last-write-wins semantics.
 *
 * @example
 * ```typescript
 * const paymentClient = new HttpClient({
 *   name: 'stripe-api',
 *   baseUrl: 'https://api.stripe.com/v1',
 *   resilience: mergeResilienceHooks(
 *     { maxAttempts: 2, timeoutMs: 4000 },
 *     createHttpClientTelemetry(logger),
 *     createInfraMetrics(),
 *   ),
 * });
 * ```
 */
export function mergeResilienceHooks(
  ...sources: Array<PartialConfig & PartialHooks>
): Omit<ResilienceConfig, 'name'> {
  const merged: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hookArrays: Record<string, Array<(...args: any[]) => void>> = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (HOOK_KEYS.has(key)) {
        // Initialize the array bucket on first encounter
        if (!hookArrays[key]) hookArrays[key] = [];
        if (!value) continue; // Guard against undefined/null hook properties
        // Collect hook callbacks into arrays
        const hooks = Array.isArray(value) ? value : [value];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hookArrays[key].push(...(hooks as Array<(...args: any[]) => void>));
      } else {
        // Last-write-wins for scalar config (maxAttempts, timeoutMs, etc.)
        merged[key] = value;
      }
    }
  }

  // Only attach non-empty hook arrays
  for (const [key, arr] of Object.entries(hookArrays)) {
    if (arr.length > 0) merged[key] = arr;
  }

  return merged as Omit<ResilienceConfig, 'name'>;
}

/**
 * Safely executes an array of observability/telemetry hooks.
 * Wraps execution in a try/catch block so that poorly written or failing
 * telemetry listeners do not crash the primary execution path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeInvokeHooks<T extends any[]>(
  hookName: string,
  hooks: Array<(...args: T) => void> | undefined,
  ...args: T
) {
  if (!hooks || hooks.length === 0) return;

  for (const fn of hooks) {
    try {
      const result = fn(...args) as unknown;
      
      // If the hook was async, it returns a Promise. The synchronous try/catch above
      // will NOT catch promise rejections. We must attach a .catch() to prevent 
      // UnhandledPromiseRejection from crashing the entire Node.js process.
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch((asyncErr) => {
          console.error(
            `[Observability Error]: The '${hookName}' async telemetry hook rejected. Context:`,
            args, // Node's console.error handles circular references natively
            asyncErr,
          );
        });
      }
    } catch (err) {
      // Intentionally swallow the error to prevent cascading failure.
      // We log it to stderr so DevOps can still spot broken telemetry plugins.
      console.error(
        `[Observability Error]: The '${hookName}' telemetry hook threw an exception. Context:`,
        args, // Avoid JSON.stringify here! If args has circular refs, stringify will crash the catch block.
        err,
      );
    }
  }
}
