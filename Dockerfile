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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

# Matches uid/gid 1000 (the "deck" user) so files written into the bind-mounted
# book/config folders stay owned by deck on the host, not root.
USER node

CMD ["pnpm", "start"]
