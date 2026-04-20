import { z } from 'zod';
import {
  createEnv,
  NodeEnvSchema,
  PortSchema,
  LogLevelSchema,
  OtelServiceNameSchema,
} from '@ecomx/env';

/**
 * The Auth Service Environment Schema.
 *
 * Composes shared schemas from @ecomx/env for common fields (PORT, NODE_ENV, etc.)
 * and defines service-specific secrets locally.
 *
 * If any field is missing or invalid, the service crashes immediately on boot.
 */
export const env = createEnv(
  z.object({
    NODE_ENV: NodeEnvSchema,
    PORT: PortSchema,
    OTEL_SERVICE_NAME: OtelServiceNameSchema.default('auth-service'),
    LOG_LEVEL: LogLevelSchema,
  }),
);
