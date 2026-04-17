import {
  createResiliencePolicy,
  type ResilienceConfig,
  type BreakerState,
} from './resilience';
import { FetchClientError, HttpStatus } from './errors';

export interface InfraClientConfig {
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
   * Overrides for the resilience policy (timeout, retries, etc.).
   * The breaker strictly uses the `baseUrl` as its 'name' identifier.
   */
  resilience?: Omit<Partial<ResilienceConfig>, 'name' | 'onStateChange'>;

  /** Hook for observability. Emits OPEN/HALF_OPEN/CLOSED state changes. */
  onStateChange?: (state: BreakerState, baseUrl: string) => void;
}

/**
 * A highly resilient HTTP client designed strictly for Outbound Application calls.
 * Transparently wraps the native `fetch` API in a Cockatiel Resilience Policy.
 *
 * Provides out-of-the-box Circuit Breaking, Exponential Backoff Retries, and
 * Aggressive Timeouts to protect the Node event loop from external network failures.
 */
export class InfraClient {
  private readonly policy;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly beforeRequest?: InfraClientConfig['beforeRequest'];

  constructor(config: InfraClientConfig) {
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.beforeRequest = config.beforeRequest;

    this.policy = createResiliencePolicy({
      name: config.baseUrl,
      onStateChange: config.onStateChange,
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
    const url = `${this.baseUrl}${path}`;

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
      try {
        response = await fetch(url, finalInit);
      } catch (err: unknown) {
        // AbortError means either the user cancelled or the timeout fired.
        // Re-throw WITHOUT wrapping so Cockatiel's cancellation logic handles it
        // properly. This prevents aborts from polluting Circuit Breaker statistics.
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }

        // Genuine network failures (DNS, ECONNREFUSED, CORS) — retryable.
        const message = err instanceof Error ? err.message : String(err);
        throw new FetchClientError(
          `Network failure during call to ${url}: ${message}`,
          HttpStatus.BAD_GATEWAY,
          true,
        );
      }

      if (!response.ok) {
        // 4xx = client error (bad input, auth failure) → NOT retryable, doesn't trip breaker.
        // 5xx = server error (upstream is down) → retryable, counts toward breaker.
        const isRetryable = response.status >= 500;
        throw new FetchClientError(
          `Upstream ${url} returned ${response.status}`,
          response.status,
          isRetryable,
        );
      }

      // Safely parse JSON — protect against malformed responses from upstream.
      try {
        return (await response.json()) as T;
      } catch {
        throw new FetchClientError(
          `Failed to parse JSON response from ${url}`,
          HttpStatus.BAD_GATEWAY,
          false,
        );
      }
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

  /** Shared options for HTTP methods that carry a request body. */
  /** Performs a resilient POST request with an implicit JSON payload. */
  async post<T>(
    path: string,
    body: unknown,
    opts?: {
      signal?: AbortSignal;
      headers?: Record<string, string>;
      idempotencyKey?: string;
    },
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
      { method: 'POST', body: JSON.stringify(body), headers },
      opts?.signal,
    );
  }

  /** Performs a resilient PUT request with an implicit JSON payload. */
  async put<T>(
    path: string,
    body: unknown,
    opts?: {
      signal?: AbortSignal;
      headers?: Record<string, string>;
      idempotencyKey?: string;
    },
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
      { method: 'PUT', body: JSON.stringify(body), headers },
      opts?.signal,
    );
  }

  /** Performs a resilient PATCH request with an implicit JSON payload. */
  async patch<T>(
    path: string,
    body: unknown,
    opts?: {
      signal?: AbortSignal;
      headers?: Record<string, string>;
      idempotencyKey?: string;
    },
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
      { method: 'PATCH', body: JSON.stringify(body), headers },
      opts?.signal,
    );
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
   * Provides the raw Cockatiel CircuitBreaker state (0=Closed, 1=Open, 2=HalfOpen).
   * Inject this deeply into K8s Readiness Probes.
   */
  getBreakerState() {
    return this.policy.getBreakerState();
  }
}
