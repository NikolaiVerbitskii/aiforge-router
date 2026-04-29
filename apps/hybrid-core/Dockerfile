FROM node:24-bookworm-slim AS base
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/hybrid-core/package.json apps/hybrid-core/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json

RUN pnpm install --frozen-lockfile --filter @apps/hybrid-core...

COPY packages/config-typescript packages/config-typescript
COPY apps/hybrid-core apps/hybrid-core

RUN pnpm --filter @apps/hybrid-core build

EXPOSE 4111
CMD ["pnpm", "--filter", "@apps/hybrid-core", "start"]
