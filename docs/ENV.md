# Environment variables

All are validated at startup (`apps/api/src/config.ts`); the API refuses to start on invalid values.
Production values come from the secret manager, never from committed files.

## API

| Variable            | Required | Default                 | Notes                                                                   |
| ------------------- | -------- | ----------------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`          | no       | `development`           | `development`, `test` or `production`                                   |
| `API_HOST`          | no       | `0.0.0.0`               | Listen address                                                          |
| `API_PORT`          | no       | `3000`                  | 1–65535                                                                 |
| `CORS_ORIGINS`      | no       | `http://localhost:5173` | Comma-separated allowed origins                                         |
| `DATABASE_URL`      | yes      | —                       | PostgreSQL connection string; also read by `pnpm db:migrate`            |
| `ENABLE_DEV_ROUTES` | no       | `false`                 | Enables `/dev/v1/*` (GPS simulator). Startup fails if set in production |

## Tests

| Variable            | Notes                                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL` | Migrated test database. Database tests are skipped when unset; CI always sets it |

## Web (build time)

| Variable       | Default                 | Notes                                                                                 |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `VITE_API_URL` | `http://localhost:3000` | Public API base URL. Never put secrets in `VITE_*` variables: they ship in the bundle |
