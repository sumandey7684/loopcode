# ARCHITECTURE — LoopCode

Tags: ✓ ~ ? X  
Related: [PROJECT.md](PROJECT.md) · [AGENTS.md](AGENTS.md) · [DECISIONS.md](DECISIONS.md)

LoopCode is a local-first autonomous software engineering orchestrator on top of OpenCode: planning, state orchestration, knowledge, and verification.

## 3-layer design

```
┌──────────────────────────────────────────────┐
│  LAYER 3: LOOPCODE (TypeScript TUI & Engine) │
│  Controller · EventBus · Verify · SQLite     │
│  Dynamic Router · Cost · Context · Worktree  │
│  Loop Detector · Ink transcript TUI          │
└──────────────────────────────────────────────┘
                      │ @opencode-ai/sdk
                      ▼
┌─────────────────────────────────────────────┐
│  LAYER 2: OPENCODE RUNTIME                  │
│  Session · Tool registry · Provider router  │
└─────────────────────────────────────────────┘
                      │ local processes
                      ▼
┌─────────────────────────────────────────────┐
│  LAYER 1: USER ENVIRONMENT                  │
│  Filesystem · Git · LLM APIs (± proxy)      │
└─────────────────────────────────────────────┘
```

## Entry points

| Path | Role |
| --- | --- |
| `src/index.ts` | Commander CLI; `process.exit` via `EXIT` |
| `src/cli/runner.tsx` | Loads `configStore`, `createController`, Ink or headless |
| `dist/index.js` | Published `bin.loopcode` (`package.json`) |

## Module map

| Module | Path | Responsibility |
| --- | --- | --- |
| Session controller | `src/app/session-controller-impl.ts` | Facade: auth, proxy, orchestrator, snapshot, slash cmds |
| Event bus / logger / redact | `src/app/{events,logger,redact}.ts` | Pub/sub, `~/.loopcode/logs/loopcode.log`, secret scrub |
| Orchestrator | `src/orchestrator.ts` | State machine `runGoal` / `resumeTask` |
| OpenCode bridge | `src/opencode.ts` | SDK client lifecycle, `executeTask` |
| Agents | `src/agents/{planner,engineer,reviewer,verifier,researcher}.ts` | Role sessions; researcher unwired |
| Memory | `src/memory.ts`, `src/memory/engine.ts`, `semantic.ts` | Task CRUD + shared agent memory + vectors |
| Schema | `src/db/schema.ts` | Embedded `SCHEMA_SQL` |
| IR | `src/ir/*` | Zod contracts + `IRValidator` |
| Router | `src/router.ts`, `router/dynamic.ts`, `router/portfolio.ts` | Legacy + dynamic; portfolio unused |
| Cost / safety | `src/cost/engine.ts`, `src/safety/loop.ts` | Spend log, exit 77, oscillation |
| Scheduler | `src/scheduler/worktree.ts` | Worktrees + topo batches |
| Knowledge | `src/knowledge/{indexer,treesitter,lsp}.ts` | Index + LSP |
| Context | `src/context/engine.ts` | Compression / LSP-backed context |
| Config / auth / proxy | `src/config/*`, `src/auth/*`, `src/proxy/*` | TOML, providers, Antigravity |
| Platform | `src/platform/*` | Paths, env, package-manager argv |
| CLI | `src/cli/**` | Ink UI, approvals, trust, theme |
| Classifier | `src/classifier.ts` | `single_agent` vs `full_loop` |

## Data flow

```
User goal (CLI/TUI)
  → SessionControllerImpl.runGoal
    → Orchestrator.runGoal
      → CodeIndexer.indexDirectory
      → classify → plan (PlannerAgent) → validate
      → execute batches (GitWorktreeScheduler + EngineerAgent / OpenCode)
      → verify (VerifierAgent → fallback Verifier)
      → emit AppEvents → controller snapshot → Ink Transcript
  ↔ SQLite (tasks, agent IRs, cost_log, sessions)
  ↔ ~/.loopcode (config.toml, logs, trusted_dirs)
```

## Dependency graph

- **CLI** → SessionController → Orchestrator, AuthService, AntigravityProxy, CostEngine, Memory*
- **Orchestrator** → OpencodeOrchestrator, agents, DynamicRouter/Router, CostEngine, LoopDetector, ContextEngine, GitWorktreeScheduler, MemoryEngine, CodeIndexer, EventBus
- **Agents** → OpencodeClient, MemoryEngine (engineer/verifier/reviewer)
- **VerifierAgent** → ReviewerAgent, `resolveProjectCommands`, optional `semgrep`
- **Knowledge/Context** → tree-sitter, LSP client, MemoryEngine
- **External:** OpenCode runtime, git, Bun SQLite, optional semgrep / native vec+embed
