FROM node:22-bookworm-slim

# A couple of transitive deps (e.g. image-processing libs) need a C toolchain to install.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

# HOME still drives the book-folder default (see DEFAULT_PUBLICATIONS_DIR) -- ISHI_CONFIG_DIR
# moves config.json/users.json to a clean, dedicated mount point instead of ~/.config/ishi-read.
ENV HOME=/home/deck
ENV ISHI_CONFIG_DIR=/config
ENV NODE_ENV=production
# CLAUDE-ADDED: Must be set here, not just in docker-compose.yml's `environment:` -- next.config.mjs's
# redirects() (which gates /read/manifest/*, the only URL shape every book on this fork actually
# links to, see api/books/route.ts) reads this at `next build` time below and bakes the result
# permanently into the compiled output. docker-compose's `environment:` only injects vars when the
# container starts, which is already too late; setting it only there silently has no effect at all.
ENV MANIFEST_ROUTE_FORCE_ENABLE=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

# No USER directive -- runs as root (uid/gid 0), matching PUID/PGID=0 in docker-compose.yml.
CMD ["pnpm", "start"]
