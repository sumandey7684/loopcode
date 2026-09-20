# PROJECT — LoopCode

**Status tags:** ✓ implemented · ~ partial · ? unknown · X deprecated  
Source of truth: TypeScript under `src/`.

## Problem

Developers need a local orchestrator that plans, executes, verifies, and budgets multi-step coding goals on top of an existing agent runtime (OpenCode), without running a remote control plane.

## Target users

- Software engineers using OpenCode locally (CLI / TUI)
- CI operators running `--headless` goal runs with exit-code contracts

## Core features (from code)

| Feature | Status | Evidence |
| --- | --- | --- |
| Goal CLI + resume + login + headless | ✓ | `src/index.ts`, `src/cli/runner.tsx` |
| Ink transcript TUI + onboarding | ✓ | `src/cli/app.tsx`, `src/cli/components/**` |
| State machine: planning → executing → verifying → done/failed | ✓ | `Orchestrator` in `src/orchestrator.ts` |
| SQLite persistence (tasks, sessions, agent memory) | ✓ | `src/db/schema.ts`, `Memory`, `MemoryEngine` |
| Multi-agent plan/execute/verify via OpenCode SDK | ✓ | `src/agents/*`, `src/opencode.ts` |
| Worktree-batched parallel execution | ✓ | `GitWorktreeScheduler` in `src/scheduler/worktree.ts` |
| Budget caps → exit `77` | ✓ | `CostEngine`, `EXIT.BUDGET_EXCEEDED` |
| Loop/oscillation detection + escalation | ✓ | `src/safety/loop.ts`, `promptUserForEscalation` |
| Auth / provider catalog / Antigravity proxy | ✓ | `src/auth/*`, `src/proxy/*` |
| Semantic cache (`fastembed` + `sqlite-vec`) | ~ | `SemanticMemory`; search wrapped in try/catch |
| Integration-test verification layer | ~ | Always skipped stub in `VerifierAgent` |
| Dedicated lint verification layer (agent path) | X | IR allows `lint`; `VerifierAgent` does not run it |
| Researcher agent in live loop | ~ | `ResearcherAgent` exists; not constructed in `Orchestrator` |

## Scope

- Decompose a natural-language goal, route models, run OpenCode sessions, verify locally, persist state under `loopcode.db` / `~/.loopcode/`.
- Act as Layer 3 above OpenCode (`@opencode-ai/sdk`); does not replace OpenCode’s session/tool runtime.

## Non-goals

- Hosted multi-tenant SaaS control plane
- Guaranteed `trivy` security scanning (code: `semgrep` + regex fallback only)
- Fully wired `ModelPortfolio` (`src/router/portfolio.ts` has no importers)
- Shipping a verified standalone binary from this workspace alone ([?] no `.git`; `install.sh` targets GitHub tag `v2.0.0`)

---

## Functional requirements

### CLI / process interface

| Interface | Status | Location |
| --- | --- | --- |
| `loopcode [goal]` | ✓ | `src/index.ts` → `runCli` |
| `-r, --resume <taskId>` (resolves session→goal) | ✓ | `SessionControllerImpl.resume` |
| `-d, --db <path>` default `cwd/loopcode.db` | ✓ | `defaultDbPath()` |
| `--login` | ✓ | `forceLogin` → onboarding |
| `--headless` | ✓ | sets `LOOPCODE_HEADLESS=1` |
| Exit `0/1/77/130` | ✓ | `EXIT` in `src/index.ts` |

TUI keybindings and slash commands: [CLI.md](CLI.md). Config file shape: [CONFIG.md](CONFIG.md).

### Workflows

1. **Bootstrap** — `createController` loads config, OpenCode client, `Orchestrator`, EventBus (`session-controller-impl.ts`).
2. **Classify** — `Classifier` → `single_agent` | `full_loop` (`src/classifier.ts`). See [TASKS.md](TASKS.md).
3. **Plan** — `PlannerAgent` / legacy `Planner` produce task DAG; validate via `validatePlan` / IR Zod schemas (`src/ir/*`).
4. **Execute** — batches from `GitWorktreeScheduler.topologicalSort`; `EngineerAgent` + OpenCode sessions.
5. **Verify** — prefer `VerifierAgent.verifyTask`; on failure fall back to `Verifier.verifyTask`. See [VERIFICATION.md](VERIFICATION.md).
6. **Persist / resume** — `tasks`, `sessions`, agent tables in SQLite (`SCHEMA_SQL`).

### Data models (SQLite)

Defined in `src/db/schema.ts` (must match `db/schema.sql` — `tests/schema.test.ts`):

- `tasks`, `state_log`, `task_results`, `file_index`
- `model_performance`, `working_memory`, `task_memory`, `project_memory`, `goal_memory`
- `code_graph_nodes/edges`, FTS `code_search`, `cache_entries`, `code_embeddings`
- `task_plans`, `task_executions`, `task_reviews`, `sessions`
- Plus runtime `cost_log` created in `CostEngine` (not in `SCHEMA_SQL`)

### IR contracts (Zod)

`GoalIRSchema`, `TaskIRSchema` / `TaskNodeSchema`, `ExecutionIRSchema`, `VerificationIRSchema`, `CompletionIRSchema` under `src/ir/`.

## Non-functional constraints

| Concern | Constraint | Evidence |
| --- | --- | --- |
| Local-first | State in project DB + `~/.loopcode/` | `platform/paths.ts` |
| Parallelism | `safety.maxParallelAgents` default 5 | `config/schema.ts` |
| Budget hard-stop | Throws `BudgetExceededError` → exit 77 | `cost/engine.ts`, CLI catch |
| Secrets | EventBus scrub / `redact.ts` | `app/events.ts` |
| Destructive git | Opt-in `allowDestructiveRollback` | `orchestrator.rollbackWorkspace` |
| Headless safety | Destructive approvals denied; loop → abort | `requestApproval`, `promptUserForEscalation` |
| Runtime | Bun (`bun:sqlite`, scripts); Node shebang on CLI | `package.json`, `index.ts` |

## System interfaces

- **Events:** `phase`, `plan`, `task-state`, `verification`, `cost`, `approval-request`, `escalation`, `notice`, tool/diff/transcript kinds — `src/app/events.ts` (behavior: [AGENTS.md](AGENTS.md))
- **Config:** `~/.loopcode/config.toml` — [CONFIG.md](CONFIG.md)
- **OpenCode:** `@opencode-ai/sdk` `createOpencode`, session create/prompt — `opencode.ts`
- **Proxy:** Antigravity daemon — [CONFIG.md](CONFIG.md#antigravity-proxy)
