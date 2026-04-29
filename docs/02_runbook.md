# Runbook

Operational notes for local development and troubleshooting.

## Scope

- Covers local bring-up of Phase 1 components
- Includes basic checks before Hermes is introduced

## Starter Checks

1. Verify Ollama:
   - `curl http://localhost:11434/api/tags`
2. Verify workspace install:
   - `pnpm install`
3. Verify task graph:
   - `pnpm build`
   - `pnpm lint`
   - `pnpm typecheck`

## Typical Early Issues

- Missing `pnpm` or wrong Node version
- Ollama server not running
- 32B model unavailable due to VRAM constraints

## Reference

Use `docs/00_hybrid-system-blueprint.md` for detailed architecture and phased execution criteria.
