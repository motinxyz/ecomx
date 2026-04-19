import {
  createResiliencePolicy,
  type ResilienceConfig,
} from './resilience';
import { FetchClientError, HttpStatus } from './errors';
import { safeInvokeHooks } from './hooks';

/** Shared options for HTTP methods that carry a request body (POST, PUT, PATCH). */
export interface MutationRequestOpts {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface HttpClientConfig {
  /** 
   * Logical, human-readable identifier for this dependency (e.g., 'stripe-api', 'inventory-service').
   * Used for metrics, circuit breakers, and logs. Do NOT use raw URLs.
   */
  name: string;

  /** The base URL for the external service (e.g., 'https://api.stripe.com') */
  baseUrl: string;

  /** Default headers attached to every request. */
  defaultHeaders?: Record<string, string>;

  /**
   * Async hook called before EVERY fetch attempt, including retries.
   * Use this for dynamic auth: OAuth2 token refresh, short-lived JWTs, HMAC signatures.
   *
   * Receives the assembled RequestInit so you can read or mutate any part of the request.
   * Return a (partial) RequestInit to deep-merge into the outgoing request.
   *
   * @example
   * beforeRequest: async (init) => ({
   *   headers: { Authorization: `Bearer ${await tokenCache.getOrRefresh()}` },
   * })
   */
  beforeRequest?: (
    init: Readonly<RequestInit>,
  ) => Promise<Partial<RequestInit>> | Partial<RequestInit>;

  /**
   * Configuration for the underlying resilience policy (timeouts, retries, circuit breaker).
   * Note: The breaker strictly uses the `baseUrl` as its 'name' identifier.
   */
  resilience?: Partial<Omit<ResilienceConfig, 'name'>>;
}

/**
 * A highly resilient HTTP client designed strictly for Outbound Application calls.
 * Transparently wraps the native `fetch` API in a Cockatiel Resilience Policy.
 *
 * Provides out-of-the-box Circuit Breaking, Exponential Backoff Retries, and
 * Aggressive Timeouts to protect the Node event loop from external network failures.
 */
export class HttpClient {
  private readonly policy: ReturnType<typeof createResiliencePolicy>;
  private readonly name: string;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly beforeRequest?: HttpClientConfig['beforeRequest'];
  private readonly onResponse?: ResilienceConfig['onResponse'];

  constructor(config: HttpClientConfig) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.beforeRequest = config.beforeRequest;
    this.onResponse = config.resilience?.onResponse;

    this.policy = createResiliencePolicy({
      name: config.name,
      ...config.resilience,
    });
  }

  /**
   * Core execution wrapper. Maps upstream `fetch` rejections into predictable `FetchClientError`s
   * or allows the `ResilienceError` to safely bubble up.
   */
  private async executeFetch<T>(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<T> {
    // Safely join baseUrl and path, guaranteeing exactly one slash between them.
    const url = `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

    return this.policy.execute(async (policySignal) => {
      // Assemble the base request from defaults + per-call overrides.
      const baseInit: RequestInit = {
        ...init,
        headers: { ...this.defaultHeaders, ...init.headers },
      };

      // Run the interceptor on every attempt (including retries).
      // This is critical for token refresh: a retry after a 401 will fetch a fresh token.
      const intercepted = this.beforeRequest
        ? await this.beforeRequest(baseInit)
        : {};

      const finalInit: RequestInit = {
        ...baseInit,
        ...intercepted,
        signal: policySignal, // Always override — Cockatiel owns the kill switch.
        headers: {
          ...(baseInit.headers as Record<string, string>),
          ...(intercepted.headers as Record<string, string> | undefined),
        },
      };

      let response: Response;
      const start = performance.now();
      try {
        response = await fetch(url, finalInit);
      } catch (err: unknown) {
        // AbortError means either the user cancelled or the timeout fired.
        // Re-throw WITHOUT wrapping so Cockatiel's cancellation logic handles it
        // properly. This prevents aborts from polluting Circuit Breaker statistics.
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }

        // We had a genuine network failure (DNS, ECONNREFUSED) without an HTTP response.
        // Track the latency anyway so we can see the network drop on the dashboard.
        const durationMs = Math.round(performance.now() - start);
        safeInvokeHooks('onResponse', this.onResponse, { name: this.name, durationMs, statusCode: 0 });

        // Genuine network failures (DNS, ECONNREFUSED, CORS) — retryable.
        const message = err instanceof Error ? err.message : String(err);
        throw new FetchClientError(
          `Network failure during call to ${url}: ${message}`,
          HttpStatus.BAD_GATEWAY,
          true,
        );
      }

      if (!response.ok) {
        const durationMs = Math.round(performance.now() - start);
        // Fire onResponse hooks even for error responses (for latency tracking)
        safeInvokeHooks('onResponse', this.onResponse, { name: this.name, durationMs, statusCode: response.status });
        // 4xx = client error (bad input, auth failure) → NOT retryable, doesn't trip breaker.
        // 5xx = server error (upstream is down) → retryable, counts toward breaker.
        const isRetryable = response.status >= 500;
        throw new FetchClientError(
          `Upstream ${url} returned ${response.status}`,
          response.status,
          isRetryable,
        );
      }

      const durationMs = Math.round(performance.now() - start);

      // Fire onResponse hooks for successful responses
      safeInvokeHooks('onResponse', this.onResponse, { name: this.name, durationMs, statusCode: response.status });

      // Handle empty responses (like 204 No Content) gracefully
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return undefined as unknown as T;
      }

      // Check the Content-Type to avoid crashing on plaintext or HTML error pages
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new FetchClientError(
            `Failed to parse JSON response from ${url}`,
            HttpStatus.BAD_GATEWAY,
            false,
          );
        }
      }

      // Fallback for non-JSON responses (text, html, etc.)
      return (await response.text()) as unknown as T;
    }, signal);
  }

  /** Performs a resilient GET request. */
  async get<T>(
    path: string,
    opts?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<T> {
    return this.executeFetch<T>(
      path,
      { method: 'GET', headers: opts?.headers },
      opts?.signal,
    );
  }

  /**
   * Internal helper for HTTP methods that carry a body (POST, PUT, PATCH).
   * Standardizes JSON serialization and Idempotency-Key injection.
   */
  private async executeMutation<T>(
    method: 'POST' | 'PUT' | 'PATCH',
    path: string,
    body: unknown,
    opts?: MutationRequestOpts,
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...opts?.headers,
      'Content-Type': 'application/json',
    };
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    return this.executeFetch<T>(
      path,
      { method, body: JSON.stringify(body), headers },
      opts?.signal,
    );
  }

  /** Performs a resilient POST request with an implicit JSON payload. */
  async post<T>(
    path: string,
    body: unknown,
    opts?: MutationRequestOpts,
  ): Promise<T> {
    return this.executeMutation<T>('POST', path, body, opts);
  }

  /** Performs a resilient PUT request with an implicit JSON payload. */
  async put<T>(
    path: string,
    body: unknown,
    opts?: MutationRequestOpts,
  ): Promise<T> {
    return this.executeMutation<T>('PUT', path, body, opts);
  }

  /** Performs a resilient PATCH request with an implicit JSON payload. */
  async patch<T>(
    path: string,
    body: unknown,
    opts?: MutationRequestOpts,
  ): Promise<T> {
    return this.executeMutation<T>('PATCH', path, body, opts);
  }

  /** Performs a resilient DELETE request. */
  async delete<T>(
    path: string,
    opts?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<T> {
    return this.executeFetch<T>(
      path,
      { method: 'DELETE', headers: opts?.headers },
      opts?.signal,
    );
  }

  /**
   * Exposes the raw Cockatiel CircuitBreaker state.
   * Compare against the exported `CircuitState` enum for readability.
   *
   * @example
   * ```typescript
   * import { CircuitState } from '@ecomx/infra';
   * const isHealthy = client.getBreakerState() !== CircuitState.Open;
   * ```
   */
  getBreakerState() {
    return this.policy.getBreakerState();
  }

  /**
   * Manually force the circuit breaker OPEN permanently (Kill Switch).
   * It will never attempt to recover until `reset()` is called.
   * Useful for security breaches or planned downstream maintenance.
   */
  isolate() {
    this.policy.isolate();
  }

  /**
   * Manually heal the circuit breaker and restore traffic immediately.
   */
  reset() {
    this.policy.reset();
  }
}
