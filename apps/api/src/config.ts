import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const EnvSchema = Type.Object({
  NODE_ENV: Type.Union(
    [Type.Literal('development'), Type.Literal('test'), Type.Literal('production')],
    { default: 'development' },
  ),
  API_HOST: Type.String({ default: '0.0.0.0' }),
  API_PORT: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
  CORS_ORIGINS: Type.String({ default: 'http://localhost:5173' }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  ENABLE_DEV_ROUTES: Type.Boolean({ default: false }),
});

export type Env = Static<typeof EnvSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  host: string;
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  devRoutes: boolean;
}

export class ConfigError extends Error {}

/** Parses and validates environment variables. Fails fast on anything unsafe. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw: Record<string, unknown> = { ...source };
  const converted = Value.Convert(EnvSchema, Value.Default(EnvSchema, raw));
  const cleaned = Value.Clean(EnvSchema, converted);
  if (!Value.Check(EnvSchema, cleaned)) {
    const issues = [...Value.Errors(EnvSchema, cleaned)].map((e) => `${e.path} ${e.message}`);
    throw new ConfigError(`Invalid environment: ${issues.join('; ')}`);
  }
  const env = cleaned;
  if (env.NODE_ENV === 'production' && env.ENABLE_DEV_ROUTES) {
    throw new ConfigError('ENABLE_DEV_ROUTES must not be set in production');
  }
  return {
    env: env.NODE_ENV,
    host: env.API_HOST,
    port: env.API_PORT,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    databaseUrl: env.DATABASE_URL,
    devRoutes: env.ENABLE_DEV_ROUTES,
  };
}
