# Architecture Notes

High-level architecture notes for the monorepo scaffold.

## Monorepo Mapping

- `apps/hybrid-mcp`: MCP boundary for Cursor tool integration
- `apps/hybrid-core`: Mastra-based orchestration core
- `packages/shared-types`: common input/output typing surface
- `apps/hermes-placeholder`: Phase 2 integration placeholder only

## Phase Strategy

- Phase 1: local fast pipeline only
- Phase 2: Hermes delegation path

## Data Flow (Planned)

1. Cursor task arrives through MCP tool call
2. `hybrid-mcp` forwards task to `hybrid-core`
3. `hybrid-core` classifies and executes local flow
4. Complex routing to Hermes is added in Phase 2

## Reference

Canonical architecture and contracts: `docs/00_hybrid-system-blueprint.md`.
