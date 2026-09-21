# The `api` container: runs the api/*.ts functions (the same files Vercel runs)
# with server/api-server.ts. nginx in the `app` container proxies /api/* here,
# so the browser still talks to one same-origin site.
#
# Build context is the REPO ROOT (see docker-compose.yml).

FROM node:24-alpine

WORKDIR /app

# Lockfile first so a source-only change reuses the install layer. Full install
# (not --omit=dev): tsx, which loads the TypeScript handlers, is a devDependency.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Only what the handlers import. No src for the browser app, no tests' fixtures
# in the runtime path beyond what lib/ carries.
COPY api ./api
COPY lib ./lib
COPY server ./server
COPY types.ts tsconfig.json ./

# viewpoint.config.ts is NOT baked in: it is per-deployment, and compose mounts
# it read-only at /app/viewpoint.config.ts. Secrets arrive via env_file.

ENV NODE_ENV=production \
    API_PORT=8787 \
    API_HOST=0.0.0.0

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8787/healthz || exit 1

CMD ["node", "--import", "tsx", "server/api-server.ts"]
