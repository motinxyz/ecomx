import { z, type ZodSchema, type ZodError } from 'zod';

// ── Shared Schemas ─────────────────────────────────────────────
// Reusable Zod schemas for environment fields common across all microservices.
// Services compose these into their local env.ts instead of duplicating magic strings.

export const NodeEnvSchema = z
  .enum(['development', 'production', 'test'])
  .default('development');

export const PortSchema = z.coerce.number().positive().default(3000);

export const LogLevelSchema = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  .default('info');

export const OtelServiceNameSchema = z.string().min(1);

// ── Factory ────────────────────────────────────────────────────

/**
 * Validates process.env against a provided Zod schema.
 *
 * In a production environment (like Kubernetes), this strictly guarantees
 * that the application will crash immediately during boot if any required
 * environment variables are missing or misconfigured, preventing bad pods
 * from accepting live traffic.
 *
 * @param schema - The Zod schema defining the required environment variables.
 * @returns A strongly-typed, validated object representing the environment.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { createEnv, PortSchema, NodeEnvSchema, LogLevelSchema } from '@ecomx/env';
 *
 * export const env = createEnv(
 *   z.object({
 *     NODE_ENV: NodeEnvSchema,
 *     PORT: PortSchema,
 *     LOG_LEVEL: LogLevelSchema,
 *     JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
 *   })
 * );
 * ```
 */
export function createEnv<T extends ZodSchema>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const formatted = formatZodErrors(result.error);

    process.stderr.write('\n❌ [Environment Error] Invalid Configuration\n');
    process.stderr.write(
      'The application failed to start due to missing or invalid environment variables:\n\n',
    );

    for (const line of formatted) {
      process.stderr.write(`   👉 ${line}\n`);
    }

    process.stderr.write('\n');
    // Fail Fast: Instantly terminate the process before traffic is accepted.
    process.exit(1);
  }

  return result.data;
}

/**
 * Formats Zod validation errors into human-readable strings.
 */
function formatZodErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}
