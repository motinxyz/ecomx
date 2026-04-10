import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions/incubating';
import type { Resource } from '@opentelemetry/resources';

export interface ResourceConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
}

/**
 * Creates a standard OpenTelemetry Resource.
 * Resources describe the object that is generating telemetry.
 */
export function createResource(config: ResourceConfig): Resource {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '0.0.1',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment ?? process.env.NODE_ENV ?? 'development',
  });
}
