# Hybrid LLM System — Technical Blueprint & Requirements

**Version:** 0.1.0-draft  
**Stack:** TypeScript / Node.js (core) · Python / Docker (Hermes)  
**Status:** Pre-implementation design

---

The blueprint covers 11 sections. A few things worth flagging before you start implementation:
The 5 open questions at the bottom are genuinely blocking. Most critical ones:

Hermes REST API shape — before writing hermes-delegate.ts, fetch http://localhost:8080/api from a running Hermes container and confirm the exact endpoint. The /api/message shape in the blueprint is inferred from the docs, not verified from source.
Mastra .branch() syntax — Mastra is moving fast (22k stars, weekly releases). Run npm create mastra@latest and check the actual Workflow API before committing to the workflow code. The fluent chaining API has had breaking changes between minor versions.
VRAM check first — the whole model selection table collapses if you're on a consumer GPU (< 24 GB VRAM). Know your hardware before Phase 1 so you pick realistic model tiers.

Recommended starting point: Phase 1 only, no Hermes. Get hybrid-mcp + Mastra fast pipeline working with just qwen2.5-coder:7b end-to-end through Cursor. Once that loop is solid, bring in Hermes for complex tasks. Attempting to wire both simultaneously before either is tested is the most common reason these systems stall.

---

## 1. System Overview

A local-first AI coding assistant pipeline that bridges cloud coding agents (Cursor) with local LLM inference (Ollama) through two orchestration layers: a fast deterministic workflow engine (Mastra) and an autonomous team-leader agent (Hermes) for complex multi-step tasks.

### 1.1 Design principles

- **Cloud at the edges only.** Cursor (Claude) provides the task and validates the final result. All processing between those two points runs locally.
- **No cloud calls inside hybrid-core.** The local boundary is enforced at the Mastra workflow level — no Anthropic/OpenAI API calls inside the pipeline.
- **Two-tier execution.** Simple and medium tasks (complexity ≤ 0.65) run through a fast deterministic Mastra workflow. Complex tasks delegate to Hermes, which spawns parallel specialist subagents.
- **MCP as the universal tool protocol.** Both Mastra and Hermes subagents consume the same MCP tool servers (filesystem, git, search). No duplicated integrations.
- **Privacy by default.** No code, file content, or project context leaves the local machine during hybrid-core processing.

### 1.2 High-level call flow

```
Cursor (cloud Claude)
  │  provides task via MCP call
  ▼
hybrid-mcp            ← MCP server bridge (@modelcontextprotocol/sdk)
  │  delegates to
  ▼
Mastra workflow       ← TypeScript orchestrator (@mastra/core)
  │
  ├─ complexity ≤ 0.65 ──► Fast pipeline
  │                         classify → selectModel → execute → validate
  │                         (Ollama local models + MCP tools)
  │
  └─ complexity > 0.65 ──► Hermes team leader (Docker :8080)
                            ├─ Coder subagent    (Ollama 32B)
                            ├─ Reviewer subagent (Ollama 32B + memory)
                            └─ Test writer       (Ollama 7B + MCP tools)
  │
  ▼
Result returned through Mastra → hybrid-mcp → Cursor
Cursor validates, refines if needed, applies to codebase
```

---

## 2. Component Specifications

### 2.1 hybrid-mcp (MCP bridge server)

| Property | Value |
|----------|-------|
| Language | TypeScript / Node.js |
| Package | `@modelcontextprotocol/sdk` |
| Transport | StdioServerTransport (Cursor connects via `.cursor/mcp.json`) |
| Role | Translates Cursor MCP tool calls into Mastra workflow runs |

**Registered tools:**

| Tool name | Description | Required args |
|-----------|-------------|---------------|
| `run_task` | Execute a coding task through local pipeline | `task: string`, `files?: string[]`, `context?: string` |
| `classify_task` | Classify type + complexity without executing | `task: string` |

**Tool result format (returned to Cursor):**
```typescript
{
  content: [{
    type: "text",
    text: `## Result\n${result}\n\n## Confidence: ${confidence}\n## Via: ${via}\n## Model: ${model}`
  }]
}
```

**Configuration (`.cursor/mcp.json`):**
```json
{
  "mcpServers": {
    "hybrid-mcp": {
      "command": "node",
      "args": ["./hybrid-mcp/dist/index.js"],
      "env": {
        "OLLAMA_HOST": "http://localhost:11434",
        "HERMES_HOST": "http://localhost:8080",
        "MASTRA_PORT": "4111"
      }
    }
  }
}
```

---

### 2.2 hybrid-core / Mastra workflow engine

| Property | Value |
|----------|-------|
| Language | TypeScript / Node.js |
| Framework | `@mastra/core` (YC W25, 22k+ stars) |
| Model SDK | Vercel AI SDK (`ai`, `@ai-sdk/ollama`) |
| Schema validation | `zod` |
| Studio UI | `http://localhost:4111` (trace replay, debugging) |
| Memory backend | libSQL (local) |

#### 2.2.1 Classify step

```typescript
// Input: raw task string
// Output: ClassifyResult (zod-typed)

const ClassifySchema = z.object({
  type: z.enum([
    'autocomplete',   // inline completion, small scope
    'refactor',       // restructure existing code
    'explain',        // code explanation / docs
    'test',           // generate tests
    'debug',          // find and fix bugs
    'architecture',   // system/module design
  ]),
  complexity: z.number().min(0).max(1),
  isComplex: z.boolean(),     // true → Hermes delegation
  needsTools: z.boolean(),    // true → attach MCP tools
  estimatedTokens: z.number(),
})

// Model: ollama/qwen2.5-coder:7b
// Timeout: 8 seconds
// isComplex = complexity > 0.65 OR type === 'architecture'
```

#### 2.2.2 Model selection table (fast pipeline)

| Complexity | Task types | Model | Max tokens |
|------------|-----------|-------|-----------|
| 0.0 – 0.35 | autocomplete, explain | `qwen2.5-coder:7b` | 1 024 |
| 0.35 – 0.65 | refactor, test, debug | `qwen2.5-coder:32b` | 4 096 |
| > 0.65 | any | → Hermes delegation | — |

#### 2.2.3 Execute step (fast pipeline)

- Creates `MastraMCPClient` connected to local MCP tool servers
- Calls `generateText()` with selected Ollama model + tools
- Attaches `files` context from task args as system prompt additions
- Hard timeout: 120 seconds

#### 2.2.4 Validate step (fast pipeline)

- Runs `generateObject()` with a quality scorer schema
- Returns `{ score: number, issues: string[], passed: boolean }`
- If `score < 0.6` → retry once with next-tier model
- Adds confidence metadata to result

#### 2.2.5 Hermes delegation step

- HTTP POST to `http://localhost:8080/api/message`
- Waits up to 300 seconds (async multi-agent work)
- Maps Hermes response to standard `{ result, confidence, via }` shape

#### 2.2.6 Workflow branch logic

```
classify
  │
  ├─ isComplex === false ─► localStep (select → execute → validate)
  └─ isComplex === true  ─► hermesStep (HTTP → Docker)
         │
         └─ both paths merge at result collector
```

---

### 2.3 Hermes team leader

| Property | Value |
|----------|-------|
| Project | Nous Research / hermes-agent (MIT) |
| Language | Python |
| Deployment | Docker container |
| Port | 8080 (HTTP REST API) |
| Model backend | Ollama (`http://ollama:11434`) |
| Memory | SQLite, persistent across sessions |
| Skills | Auto-created from solved tasks, stored locally |

#### 2.3.1 Subagent team structure

| Subagent | Model | Responsibility |
|----------|-------|---------------|
| Coder | `qwen2.5-coder:32b` | Implementation, refactoring |
| Reviewer | `qwen2.5-coder:32b` + memory | Code quality, standards, project patterns |
| Test writer | `qwen2.5-coder:7b` | Test generation, edge cases |

All three run in parallel. Hermes aggregates their outputs.

#### 2.3.2 Hermes configuration (`hermes.config.yaml`)

```yaml
provider: ollama
model: qwen2.5-coder:32b
ollama_base_url: http://ollama:11434

memory:
  enabled: true
  backend: sqlite
  path: /app/data/memory.db
  user_modeling: true          # learns project patterns over time

skills:
  auto_create: true            # saves successful patterns as reusable skills
  hub: false                   # keep all skills local

mcp_servers:
  - name: filesystem
    command: npx
    args: ["@modelcontextprotocol/server-filesystem", "/workspace"]
  - name: git
    command: npx
    args: ["@modelcontextprotocol/server-git", "--repository", "/workspace"]

subagents:
  max_parallel: 3
  isolation: process           # or docker for stronger isolation

server:
  enabled: true
  port: 8080
```

#### 2.3.3 Mastra → Hermes interface contract

**Request:**
```typescript
POST http://localhost:8080/api/message
Content-Type: application/json

{
  "message": "<task string>",
  "context": {
    "taskType": "refactor" | "test" | "debug" | "architecture",
    "files": ["src/auth.ts", "src/middleware.ts"],
    "projectContext": "<optional extra context string>"
  }
}
```

**Response:**
```typescript
{
  "response": "<aggregated result string>",
  "confidence": 0.85,           // 0–1, Hermes self-assessed
  "subagents_used": ["coder", "reviewer", "test_writer"],
  "skills_applied": ["jwt-auth-pattern"],
  "duration_ms": 42000
}
```

---

### 2.4 Local infrastructure

#### 2.4.1 Ollama (local model server)

| Setting | Value |
|---------|-------|
| Port | 11434 |
| API | OpenAI-compatible REST |
| Required models | See table below |

**Model pull commands:**
```bash
ollama pull qwen2.5-coder:7b     # classify + fast tasks (~4.7 GB)
ollama pull qwen2.5-coder:32b    # complex tasks (~19 GB, needs ~24 GB VRAM)
ollama pull deepseek-coder-v2    # alternative for balanced tier
```

**GPU requirements:**

| Configuration | VRAM | Models available |
|---------------|------|-----------------|
| Consumer (RTX 3080/4070) | 10–12 GB | 7B models only |
| Mid-range (RTX 4090) | 24 GB | 7B + 14B |
| Workstation (A6000 / 3090×2) | 48 GB | 7B + 32B |
| CPU fallback | RAM | 7B quantized (slow) |

#### 2.4.2 MCP tool servers

| Server | Package | Port / Transport | Used by |
|--------|---------|-----------------|---------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | STDIO | Mastra + Hermes |
| Git | `@modelcontextprotocol/server-git` | STDIO | Mastra + Hermes |
| Brave Search | `@modelcontextprotocol/server-brave-search` | STDIO | Mastra (optional) |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | STDIO | Mastra (optional) |

All MCP servers are scoped to `/workspace` (the project root). No access outside.

---

## 3. Repository Structure

```
hybrid-system/
│
├── hybrid-mcp/                    # MCP bridge server
│   ├── src/
│   │   └── index.ts               # Server + tool handlers
│   ├── package.json
│   └── tsconfig.json
│
├── hybrid-core/                   # Mastra orchestrator
│   ├── src/
│   │   ├── mastra.ts              # Mastra instance registration
│   │   ├── workflow.ts            # Main workflow definition
│   │   ├── steps/
│   │   │   ├── classify.ts        # Qwen 7B + zod ClassifySchema
│   │   │   ├── local-execute.ts   # Ollama + MastraMCPClient
│   │   │   ├── validate.ts        # Quality scorer
│   │   │   └── hermes-delegate.ts # HTTP bridge to Hermes
│   │   └── tools/
│   │       └── mcp-client.ts      # MastraMCPClient factory
│   ├── package.json
│   └── tsconfig.json
│
├── hermes/                        # Hermes team leader
│   ├── hermes.config.yaml
│   ├── skills/                    # auto-created + curated skills
│   │   └── .gitkeep
│   ├── data/                      # persistent memory (gitignored)
│   └── Dockerfile
│
├── .cursor/
│   ├── mcp.json                   # hybrid-mcp registration
│   └── rules                      # agent routing guidance
│
├── docker-compose.yml             # full local stack
├── package.json                   # workspace root
└── README.md
```

---

## 4. Infrastructure — docker-compose.yml

```yaml
version: "3.9"

services:

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 10s
      timeout: 5s
      retries: 5

  hermes:
    image: nousresearch/hermes-agent:latest
    ports:
      - "8080:8080"
    volumes:
      - ./hermes/hermes.config.yaml:/app/hermes.config.yaml
      - ./hermes/skills:/app/skills
      - hermes_data:/app/data
    depends_on:
      ollama:
        condition: service_healthy
    environment:
      OLLAMA_BASE_URL: http://ollama:11434
    restart: unless-stopped

  mcp-filesystem:
    image: node:20-alpine
    working_dir: /app
    command: >
      npx --yes @modelcontextprotocol/server-filesystem /workspace
    volumes:
      - ./workspace:/workspace:ro
    ports:
      - "3100:3100"

  mcp-git:
    image: node:20-alpine
    working_dir: /app
    command: >
      npx --yes @modelcontextprotocol/server-git
      --repository /workspace
    volumes:
      - ./workspace:/workspace:ro
    ports:
      - "3101:3101"

volumes:
  ollama_data:
  hermes_data:
```

---

## 5. TypeScript Package Dependencies

### hybrid-mcp

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x"
  }
}
```

### hybrid-core

```json
{
  "dependencies": {
    "@mastra/core": "latest",
    "@mastra/mcp": "latest",
    "@ai-sdk/ollama": "latest",
    "ai": "latest",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x"
  }
}
```

---

## 6. Interface Contracts

### 6.1 TaskInput (hybrid-mcp → Mastra)

```typescript
interface TaskInput {
  task: string                // human-readable task description
  files?: string[]            // file paths to include as context
  context?: string            // extra free-form context
}
```

### 6.2 ClassifyResult (Mastra internal)

```typescript
interface ClassifyResult {
  type: 'autocomplete' | 'refactor' | 'explain' | 'test' | 'debug' | 'architecture'
  complexity: number          // 0.0 – 1.0
  isComplex: boolean          // true → Hermes delegation
  needsTools: boolean         // true → attach MCP tools in execute step
  estimatedTokens: number
}
```

### 6.3 ExecuteResult (Mastra internal)

```typescript
interface ExecuteResult {
  result: string              // the actual output (code, explanation, etc.)
  confidence: number          // 0.0 – 1.0
  via: 'local' | 'hermes'
  model: string               // e.g. "qwen2.5-coder:32b"
  durationMs: number
  toolsUsed?: string[]        // MCP tools called during execution
}
```

### 6.4 Cursor tool result (final MCP response)

```typescript
// Returned as MCP content[].text — Cursor reads this directly
`## Result
${result}

---
Confidence: ${confidence}  |  Via: ${via}  |  Model: ${model}  |  ${durationMs}ms`
```

---

## 7. Cursor Integration

### `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "hybrid-mcp": {
      "command": "node",
      "args": ["./hybrid-mcp/dist/index.js"],
      "env": {
        "OLLAMA_HOST": "http://localhost:11434",
        "HERMES_HOST": "http://localhost:8080"
      }
    }
  }
}
```

### `.cursor/rules`

```
# Hybrid-MCP routing guidance

Prefer the `hybrid-mcp` run_task tool for:
- Code refactoring (any scope)
- Test generation
- Bug investigation and fixing
- Code explanation and documentation
- Architecture analysis

Use your own reasoning directly when:
- The result confidence returned is < 0.65
- The task requires understanding the full repository structure
  and context that was not provided in the tool result
- The user explicitly asks for your direct analysis

Always validate the returned result before applying it to the codebase.
Report the confidence score and model used to the user.
```

---

## 8. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Core language | TypeScript | Mastra is TS-native; avoids language boundary in the main pipeline |
| Hermes language | Python (external) | Hermes is Python-only; isolated via Docker avoids contamination |
| Mastra vs plain pipeline | Mastra | Typed workflows, Studio debugger, MastraMCPClient, observational memory, built-in retries |
| Hermes integration | HTTP API | Loose coupling — Mastra doesn't import Python; clean contract |
| LiteLLM | Skipped (optional) | Ollama direct via `@ai-sdk/ollama` is sufficient; add LiteLLM only if cross-model fallback chains become needed |
| Cloud in hybrid-core | Forbidden | Privacy + cost enforcement; Cursor (cloud Claude) stays at boundary only |
| MCP tool servers | Shared | Both Mastra and Hermes subagents use the same servers — no duplication |
| Complexity threshold | 0.65 | Empirical starting point; tunable via env var `COMPLEXITY_THRESHOLD` |
| Memory backend | Hermes SQLite | Project pattern memory lives in Hermes; Mastra uses libSQL for workflow state only |

---

## 9. Environment Variables

```bash
# hybrid-mcp + hybrid-core
OLLAMA_HOST=http://localhost:11434
HERMES_HOST=http://localhost:8080
MASTRA_PORT=4111
COMPLEXITY_THRESHOLD=0.65        # tune routing sensitivity
MCP_FILESYSTEM_URL=http://localhost:3100/sse
MCP_GIT_URL=http://localhost:3101/sse

# Hermes (set in docker-compose.yml)
OLLAMA_BASE_URL=http://ollama:11434
```

---

## 10. Implementation Phases

### Phase 1 — Fast pipeline (no Hermes)
1. `hybrid-mcp` MCP server with `run_task` tool
2. Mastra workflow: classify → selectModel → execute → validate
3. Ollama running `qwen2.5-coder:7b` and `:32b`
4. MCP filesystem + git servers connected via `MastraMCPClient`
5. Cursor `.cursor/mcp.json` configured and tested

**Exit criteria:** Cursor successfully routes simple refactor and test tasks through hybrid-mcp, results have confidence ≥ 0.7.

### Phase 2 — Hermes integration
1. Hermes Docker container running with Ollama backend
2. `hermes-delegate.ts` step wired into Mastra workflow branch
3. Complexity threshold calibrated from Phase 1 task logs
4. Hermes subagent team (coder, reviewer, test writer) configured
5. Memory and skills persistence verified across container restarts

**Exit criteria:** Complex refactor tasks (multi-file, architectural) route to Hermes and return coherent aggregated results.

### Phase 3 — Hardening
1. Retry logic: failed local → escalate to next model tier
2. Timeout handling: Hermes 300s hard limit with graceful fallback
3. Mastra Studio traces reviewed and observational memory tuned
4. Hermes skills library reviewed and pruned
5. GPU resource limits configured in docker-compose

---

## 11. Open Questions

- [ ] **Hermes server API** — confirm the exact REST API shape from the current Hermes release before implementing `hermes-delegate.ts`. The `/api/message` endpoint may differ.
- [ ] **VRAM constraints** — if GPU VRAM < 24 GB, the 32B model is unavailable. Need a fallback path: 32B → 14B → 7B with complexity threshold adjustment.
- [ ] **Mastra `.branch()` API** — verify current `@mastra/core` workflow branching syntax against latest docs before finalising `workflow.ts`.
- [ ] **Hermes subagent config format** — the subagent team (coder/reviewer/test-writer) config syntax needs confirmation against the Hermes docs.
- [ ] **MCP server HTTP transport** — confirm whether `MastraMCPClient` requires SSE transport or can use STDIO for local servers.
- [ ] **`ralphex` top-level layer** — decision deferred: evaluate after Phase 2 if autonomous long-horizon plan execution becomes a need.
