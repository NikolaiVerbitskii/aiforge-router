# Setup Guide

This document contains setup and bootstrap details for the monorepo implementation.

## Scope

- Focus on Phase 1 (`apps/hybrid-mcp` and `apps/hybrid-core`)
- Keep Hermes integration deferred to Phase 2

## Quick Environment Checklist

- Node.js 20+
- pnpm 10+
- Docker + Docker Compose
- Ollama available at `http://localhost:11434`

## Workspace Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

## Reference

For full technical specification and contracts, use `docs/00_hybrid-system-blueprint.md`.
