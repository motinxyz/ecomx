import type { ResilienceConfig } from './resilience';

/**
 * Automatically extracts every key from ResilienceConfig whose type
 * is an optional Array of functions. If a new hook is added to
 * ResilienceConfig, this type updates itself — zero maintenance.
 */

export type HookKeys = {
  [K in keyof ResilienceConfig]: ResilienceConfig[K] extends
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
  const hookArrays: Record<string, Array<(...args: any[]) => void>> = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (HOOK_KEYS.has(key)) {
        // Initialize the array bucket on first encounter
        if (!hookArrays[key]) hookArrays[key] = [];
        // Collect hook callbacks into arrays
        const hooks = Array.isArray(value) ? value : [value];
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
