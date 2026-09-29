# syntax=docker/dockerfile:1

# ---- dependencies -----------------------------------------------------------
# Separate stage so the (slow) install layer is cached against the lockfile
# alone and is not invalidated by every source edit.
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
# Runs the full verification gate before bundling, so an image can never be
# produced from code that fails formatting, lint, type-check or tests. That
# includes the browser suite, so this stage carries Chromium and Firefox; they
# never reach the runtime stage, which is a separate FROM.
FROM node:26-slim AS build
WORKDIR /app
# CI=true is what the Playwright config reads to pick the list reporter, refuse
# a stray test.only, and start its own server rather than adopting one.
ENV NODE_ENV=production \
    CI=true
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
# Ahead of the source copy so an edit does not re-download ~500 MB of browsers.
RUN npx --no-install playwright install --with-deps chromium firefox
COPY . .
RUN npm run test:all
RUN npm run build

# ---- runtime ----------------------------------------------------------------
# Ships only the bundles. esbuild inlines every dependency, so there is no
# node_modules here at all. Revisit if a native dependency is ever added.
FROM node:26-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DOCS_ROOT=/data/docs \
    TEMPLATES_DIR=./templates \
    DEBUG=vixen-editor:*

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/src/templates ./templates

# The `node` user ships with the official image; create the document root with
# its ownership so a bind mount is writable without running as root.
RUN mkdir -p /data/docs && chown -R node:node /data/docs /app
USER node

EXPOSE 3000
VOLUME ["/data/docs"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
