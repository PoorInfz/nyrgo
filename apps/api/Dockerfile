# The game API (Fastify) for production. Built from the repository root:
#   docker build -f apps/api/Dockerfile -t nyrgo-api .
# Runs the database migrations, then the server. Configuration comes from the environment
# (see apps/api/src/config.ts and docs/DEPLOY.md); no secret is baked into the image.

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @nyrgo/shared build \
 && pnpm --filter @nyrgo/api build \
 && pnpm --filter @nyrgo/api deploy --prod --legacy /out \
 && mkdir -p /out/art \
 && cp -r apps/web/public/creatures /out/art/creatures

FROM node:24-bookworm-slim
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=8080 NFT_ART_DIR=/app/art
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 8080
CMD ["sh", "-c", "node node_modules/node-pg-migrate/bin/node-pg-migrate.js up --migrations-dir migrations --migration-file-language sql && exec node dist/server.js"]
