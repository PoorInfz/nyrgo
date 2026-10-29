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
  /**
   * Admin access tokens: `name:role:token` entries separated by commas; role is `reviewer` or
   * `admin`; tokens are 32+ characters. Empty disables the admin API.
   */
  ADMIN_TOKENS: Type.String({ default: '' }),
  /** NEAR network for wallet links. Mainnet stays closed until the Phase 6 gates. */
  NEAR_NETWORK: Type.Union([Type.Literal('testnet'), Type.Literal('mainnet')], {
    default: 'testnet',
  }),
  NEAR_RPC_URL: Type.String({ default: 'https://rpc.testnet.near.org' }),
  /** Where players' wallets and marketplaces reach this API (NFT card images and attributes). */
  PUBLIC_API_URL: Type.String({ default: 'http://localhost:3000' }),
  /** The web app's public folder, for the creature portraits drawn on NFT cards. */
  NFT_ART_DIR: Type.String({ default: '../web/public' }),
  /** The creatures NFT contract (contracts/creatures). Empty: creatures cannot leave as NFTs. */
  NEAR_NFT_CONTRACT: Type.String({ default: '' }),
  /** The game account that mints, and its key (`ed25519:…`). Secret: only the API holds it. */
  NEAR_MINTER_ACCOUNT: Type.String({ default: '' }),
  NEAR_MINTER_KEY: Type.String({ default: '' }),
  /** Who the signed message is for (NEP-413 `recipient`); wallets show it to the player. */
  NEAR_SIGN_RECIPIENT: Type.String({ minLength: 1, maxLength: 64, default: 'nyrgo' }),
  /** Seeds wild spawns. Anyone holding it can predict where creatures appear. */
  SPAWN_SECRET: Type.String({ minLength: 16, default: 'dev-only-spawn-secret-change-me' }),
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
  spawnSecret: string;
  admins: AdminAccount[];
  publicApiUrl: string;
  nftArtDir: string;
  near: {
    network: 'testnet' | 'mainnet';
    rpcUrl: string;
    recipient: string;
    /** Minutes a wallet challenge stays valid. */
    challengeTtlMin: number;
    /** Null when creature NFTs are switched off. */
    nft: { contractId: string; minterAccount: string; minterKey: string } | null;
  };
}

export type AdminRole = 'reviewer' | 'admin';
export interface AdminAccount {
  name: string;
  role: AdminRole;
  token: string;
}

function parseAdmins(raw: string): AdminAccount[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, role, token] = entry.split(':');
      if (!name || !token || (role !== 'reviewer' && role !== 'admin') || token.length < 32) {
        throw new ConfigError(
          'ADMIN_TOKENS entries must be name:role:token with role reviewer|admin and a token of 32+ characters',
        );
      }
      return { name, role, token };
    });
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
  if (prod && (env.SPAWN_SECRET.startsWith('dev-only') || env.SPAWN_SECRET.length < 32)) {
    throw new ConfigError(
      'SPAWN_SECRET must be a random value of at least 32 characters in production',
    );
  }
  if (env.NEAR_NETWORK === 'mainnet') {
    throw new ConfigError(
      'NEAR_NETWORK=mainnet is closed until the Phase 6 gates (anti-cheat on native clients, MiCA review)',
    );
  }
  const nftParts = [env.NEAR_NFT_CONTRACT, env.NEAR_MINTER_ACCOUNT, env.NEAR_MINTER_KEY];
  if (nftParts.some(Boolean) && !nftParts.every(Boolean)) {
    throw new ConfigError(
      'NEAR_NFT_CONTRACT, NEAR_MINTER_ACCOUNT and NEAR_MINTER_KEY go together (all set or none)',
    );
  }
  if (env.NEAR_MINTER_KEY && !/^ed25519:[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(env.NEAR_MINTER_KEY)) {
    throw new ConfigError('NEAR_MINTER_KEY must be an ed25519 secret key (ed25519:…)');
  }
  if (prod && env.NEAR_NFT_CONTRACT && !env.PUBLIC_API_URL.startsWith('https://')) {
    throw new ConfigError('PUBLIC_API_URL must use https in production (NFT images live there)');
  }
  if (!/^https:\/\//.test(env.NEAR_RPC_URL) && prod) {
    throw new ConfigError('NEAR_RPC_URL must use https in production');
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
    spawnSecret: env.SPAWN_SECRET,
    admins: parseAdmins(env.ADMIN_TOKENS),
    publicApiUrl: env.PUBLIC_API_URL.replace(/\/+$/, ''),
    nftArtDir: env.NFT_ART_DIR,
    near: {
      network: env.NEAR_NETWORK,
      rpcUrl: env.NEAR_RPC_URL,
      recipient: env.NEAR_SIGN_RECIPIENT,
      challengeTtlMin: 5,
      nft: env.NEAR_NFT_CONTRACT
        ? {
            contractId: env.NEAR_NFT_CONTRACT,
            minterAccount: env.NEAR_MINTER_ACCOUNT,
            minterKey: env.NEAR_MINTER_KEY,
          }
        : null,
    },
  };
}
