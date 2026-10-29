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
  APP_URL: Type.String({ default: 'http://localhost:5173' }),
  MAIL_DRIVER: Type.Union([Type.Literal('log'), Type.Literal('memory')], { default: 'log' }),
  DEFAULT_REGION: Type.String({ minLength: 2, maxLength: 2, default: 'ES' }),
  SESSION_TTL_DAYS: Type.Integer({ minimum: 1, maximum: 90, default: 30 }),
  MAGIC_LINK_TTL_MIN: Type.Integer({ minimum: 5, maximum: 60, default: 15 }),
  REAUTH_WINDOW_MIN: Type.Integer({ minimum: 1, maximum: 60, default: 15 }),
  JOBS_ENABLED: Type.Boolean({ default: true }),
});

export type Env = Static<typeof EnvSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  host: string;
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  devRoutes: boolean;
  appUrl: string;
  mailDriver: Env['MAIL_DRIVER'];
  defaultRegion: string;
  sessionTtlDays: number;
  magicLinkTtlMin: number;
  reauthWindowMin: number;
  /** Cookies get the Secure flag outside development and test. */
  secureCookies: boolean;
  /** Run scheduled jobs (retention, risk decay) in this process. */
  jobsEnabled: boolean;
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
  const prod = env.NODE_ENV === 'production';
  if (prod && env.ENABLE_DEV_ROUTES) {
    throw new ConfigError('ENABLE_DEV_ROUTES must not be set in production');
  }
  // Only development drivers exist so far, and both expose sign-in links. Adding a real
  // provider (Phase 1 open item) is what will let the API start in production.
  if (prod) {
    throw new ConfigError(
      `MAIL_DRIVER=${env.MAIL_DRIVER} writes sign-in links to logs or memory; configure a real email provider for production`,
    );
  }
  if (prod && !env.APP_URL.startsWith('https://')) {
    throw new ConfigError('APP_URL must use https in production');
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
    appUrl: env.APP_URL.replace(/\/+$/, ''),
    mailDriver: env.MAIL_DRIVER,
    defaultRegion: env.DEFAULT_REGION.toUpperCase(),
    sessionTtlDays: env.SESSION_TTL_DAYS,
    magicLinkTtlMin: env.MAGIC_LINK_TTL_MIN,
    reauthWindowMin: env.REAUTH_WINDOW_MIN,
    secureCookies: prod,
    jobsEnabled: env.JOBS_ENABLED,
  };
}
