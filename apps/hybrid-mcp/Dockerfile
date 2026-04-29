FROM node:24-bookworm-slim AS base
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/hybrid-mcp/package.json apps/hybrid-mcp/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json

RUN pnpm install --frozen-lockfile --filter @apps/hybrid-mcp...

COPY packages/config-typescript packages/config-typescript
COPY apps/hybrid-mcp apps/hybrid-mcp

RUN pnpm --filter @apps/hybrid-mcp build

EXPOSE 4120
CMD ["pnpm", "--filter", "@apps/hybrid-mcp", "start"]
