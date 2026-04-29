# aiforge-router

> MCP bridge between local LLMs and remote agent systems — routes coding tasks across both based on complexity.

Local-first hybrid coding system design that routes coding tasks through local models and tooling.

Current state: active monorepo scaffold with NestJS core and container runtime baseline.

## Start Here

The recommended path is:

1. Build and validate **Phase 1 fast pipeline** first (no Hermes).
2. Add Hermes delegation only after the local path is stable.

This sequence keeps bring-up simple and avoids blocking on still-open API and config questions.

## What This Project Is

This repository defines a local pipeline in a `pnpm` monorepo with:

- `apps/hybrid-mcp`: MCP bridge server for Cursor tool calls.
- `apps/hybrid-core`: NestJS service host for workflow orchestration.
- `packages/shared-types`: shared task input and routing types.
- `apps/hermes`: Hermes runtime configuration for container deployment.

For full architecture, interfaces, and implementation phases, use:

- `docs/00_hybrid-system-blueprint.md`

## Prerequisites

Install and verify:

- Node.js 24+
- pnpm 10+
- Python 3.11+ (for Hermes-related workflows later)
- Docker + Docker Compose
- Ollama (local model server)
- Git

Hardware note:

- 7B models work on most consumer GPUs.
- 32B model tier usually needs around 24 GB VRAM.
- If you have less VRAM, start with 7B-only development and keep Hermes for later.

## Local Setup

### 1) Clone and enter repository

```bash
git clone <your-repo-url> hybrid-llm-system
cd hybrid-llm-system
pnpm install
```

### 2) Install dependencies

```bash
pnpm install
```

### 3) Install Ollama and pull baseline model(s)

```bash
ollama pull qwen2.5-coder:7b
```

Optional higher tier (if hardware allows):

```bash
ollama pull qwen2.5-coder:32b
```

Optional alternative:

```bash
ollama pull deepseek-coder-v2
```

### 4) Start Ollama

If Ollama is not already running, start it locally and verify:

```bash
curl http://localhost:11434/api/tags
```

### 5) Prepare local environment variables

Use these as baseline values while implementing:

```bash
OLLAMA_HOST=http://localhost:11434
HERMES_HOST=http://localhost:8080
MASTRA_PORT=4111
COMPLEXITY_THRESHOLD=0.65
```

Do not hardcode production-specific values; keep this local-first during early phases.

## Quickstart (Phase 1 MVP First)

Goal: establish end-to-end local flow without Hermes.

1. Implement `apps/hybrid-mcp` with a `run_task` MCP tool.
2. Implement `apps/hybrid-core` Mastra workflow:
   - classify
   - select model
   - execute
   - validate
3. Wire Ollama model calls into the execute step.
4. Connect local MCP filesystem and git tools for task execution context.
5. Register MCP server in Cursor via `.cursor/mcp.json`.
6. Run simple refactor/test tasks and confirm confidence and result formatting.

Useful root commands:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
```

## Full Docker Runtime (Node 24)

This repo includes full containerized runtime for:

- `ollama`
- `hermes`
- `hybrid-core` (NestJS)
- `hybrid-mcp`

Run:

```bash
pnpm docker:up
```

Smoke-check endpoints:

```bash
curl http://localhost:4111/health
curl http://localhost:4120/health
curl http://localhost:4120/core-health
```

Stop:

```bash
pnpm docker:down
```

Phase 1 exit signal:

- Tasks route through local flow and return stable output with acceptable confidence.

## Suggested Development Order

- First: `qwen2.5-coder:7b` only.
- Then: add 32B tier and complexity-based routing.
- After that: introduce Hermes delegation for complex tasks.

This order minimizes variables while the core pipeline is still being proven.

## Monorepo Structure

```text
apps/
  hybrid-mcp/
  hybrid-core/
  hermes/
packages/
  config-typescript/
  config-eslint/
  shared-types/
docs/
  00_hybrid-system-blueprint.md
  01_setup.md
  02_runbook.md
  03_architecture.md
```

## Architecture at a Glance

High-level flow:

1. Cursor sends a task through MCP.
2. `apps/hybrid-mcp` forwards to Mastra workflow.
3. Workflow classifies complexity.
4. If simple/medium, local model path executes via Ollama.
5. If complex (later phase), workflow delegates to Hermes.
6. Result returns to Cursor with confidence and metadata.

Reference: `docs/00_hybrid-system-blueprint.md`

## Known Open Questions (Before Phase 2)

These are intentionally unresolved and should be validated before Hermes work:

- Hermes REST endpoint shape and payload details.
- Current Mastra branching API syntax.
- VRAM-based model fallback policy for low-memory GPUs.
- Hermes subagent configuration format in current release.
- MCP transport details for Mastra MCP client integrations.

## Immediate Next Steps Checklist

- [ ] Confirm local hardware constraints (especially VRAM tier).
- [ ] Finalize Phase 1 package/workspace layout in repo.
- [ ] Implement minimal `hybrid-mcp` tool handler and smoke test.
- [ ] Implement Mastra classify and local execute steps.
- [ ] Add validation step and confidence output.
- [ ] Verify Cursor MCP registration and first successful task run.
- [ ] Revisit Hermes only after Phase 1 is stable.

## Documentation Reference

- Core blueprint: `docs/00_hybrid-system-blueprint.md`
- Setup guide: `docs/01_setup.md`
- Runbook: `docs/02_runbook.md`
- Architecture notes: `docs/03_architecture.md`
- Compose stack: `docker-compose.yml`
- License: `LICENSE`
