import { type Counter, metrics } from '@opentelemetry/api';
import { InfraAttr, type Status } from '@ecomx/infra';

/**
 * Auth Service Domain Metrics
 *
 * Centralizes counters and histograms specific to the authentication domain.
 */

const getMeter = () => metrics.getMeter('auth-service-metrics');

let _authCounter: Counter | undefined;

export const recordLogin = (
  status: typeof Status.SUCCESS | typeof Status.FAILED | string
) => {
  if (!_authCounter) {
    _authCounter = getMeter().createCounter('ecomx_authentication_total', {
      description: 'Tracks user login attempts (success and failures)',
    });
  }
  _authCounter.add(1, { [InfraAttr.ERROR_TYPE]: status });
};
