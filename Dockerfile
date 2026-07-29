FROM node:22-bookworm-slim

# A couple of transitive deps (e.g. image-processing libs) need a C toolchain to install.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

# Matches the real Steam Deck paths so the existing ~/.config/ishi-read/config.json
# (book folder, readium port, users, etc.) keeps working unmodified when bind-mounted in.
ENV HOME=/home/deck
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
