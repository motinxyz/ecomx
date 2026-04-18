/**
 * The standard enterprise dictionary for HTTP Status Codes.
 * Use this to completely eliminate Magic Numbers from your codebase.
 */
export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499, // Standard Nginx code for user closing the browser/connection
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

/**
 * The Global Base Error that all microservice errors must extend cleanly.
 * Strictly enforces HTTP Status Codes and Operational Safety tracking.
 */
export abstract class BaseAppError extends Error {
  public readonly isOperational: boolean;
  public readonly statusCode: HttpStatusCode;

  constructor(
    message: string,
    statusCode: HttpStatusCode,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

/**
 * Triggers when an external dependency (Database, Redis) fails to respond to a ping.
 */
export class ReadinessTimeoutError extends BaseAppError {
  constructor(ms: number) {
    // 503 Service Unavailable
    super(
      `Readiness check timed out after ${ms}ms`,
      HttpStatus.SERVICE_UNAVAILABLE,
      true,
    );
    this.name = 'ReadinessTimeoutError';
  }
}

export class ResilienceError extends BaseAppError {
  constructor(
    message: string,
    originalErrorName: string,
    statusCode: HttpStatusCode = HttpStatus.SERVICE_UNAVAILABLE,
  ) {
    super(
      `Resilience layer rejected call: ${message} [Reason: ${originalErrorName}]`,
      statusCode,
      true,
    );
    this.name = 'ResilienceError';
  }
}

export class FetchClientError extends BaseAppError {
  /** Whether this error should trigger retries. 4xx client errors are non-retryable. */
  public readonly retryable: boolean;

  constructor(
    message: string,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    retryable = true,
  ) {
    // We cast to HttpStatusCode because an upstream server might theoretically
    // return an obscure code (like 525) that isn't explicitly in our HttpStatus dictionary.
    super(message, statusCode as HttpStatusCode, true);
    this.name = 'FetchClientError';
    this.retryable = retryable;
  }
}
