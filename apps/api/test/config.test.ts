import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const base = { DATABASE_URL: 'postgres://x@localhost/x' };

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ env: 'development', port: 3000, devRoutes: false });
    expect(c.corsOrigins).toEqual(['http://localhost:5173']);
  });

  it('parses ports, booleans and origin lists from strings', () => {
    const c = loadConfig({
      ...base,
      API_PORT: '8080',
      ENABLE_DEV_ROUTES: 'true',
      CORS_ORIGINS: 'https://a.test, https://b.test',
    });
    expect(c.port).toBe(8080);
    expect(c.devRoutes).toBe(true);
    expect(c.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('requires a database URL', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...base, API_PORT: '70000' })).toThrow(ConfigError);
  });

  it('refuses dev routes in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', ENABLE_DEV_ROUTES: 'true' }),
    ).toThrow(/production/);
  });

  it('refuses development mail drivers in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', APP_URL: 'https://nyrgo.test' }),
    ).toThrow(/MAIL_DRIVER/);
  });

  it('sets auth defaults and secure cookies only in production', () => {
    const c = loadConfig({ ...base, APP_URL: 'http://localhost:5173/' });
    expect(c).toMatchObject({
      appUrl: 'http://localhost:5173',
      defaultRegion: 'ES',
      sessionTtlDays: 30,
      magicLinkTtlMin: 15,
      reauthWindowMin: 15,
      secureCookies: false,
    });
  });
});
