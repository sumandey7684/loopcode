# DECISIONS — LoopCode

Architectural choices observed in code. Tags: ✓ ~ ? X  
Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [TASKS.md](TASKS.md)

## 1. OpenCode as execution substrate

- **Decision:** LoopCode is an orchestrator around `@opencode-ai/sdk`, not a standalone LLM tool runner.
- **Reasoning:** `OpencodeOrchestrator.initialize` calls `createOpencode()`; agents create OpenCode sessions for plan/implement/review.
- **Alternatives:** Direct provider SDKs — not present as primary path.
- **Trade-offs:** Couples lifecycle to OpenCode availability/auth; enables reuse of tools/providers.

## 2. Embedded SQLite as shared memory bus

- **Decision:** Agents exchange structured JSON via SQLite tables (`task_plans`, `task_executions`, `task_reviews`, etc.), not in-process RPC.
- **Reasoning:** `MemoryEngine` + `SCHEMA_SQL`; shared contracts without direct coupling.
- **Alternatives:** In-memory only — abandoned for resume/recovery (`state_log`, `sessions`).
- **Trade-offs:** Local durability and resume; schema drift risk (`cost_log` only in `CostEngine`).

## 3. EventBus + Ink TUI snapshot controller

- **Decision:** `Orchestrator` emits typed `AppEvent`s; `SessionControllerImpl` maintains UI snapshot; Ink renders transcript.
- **Reasoning:** Separates engine from presentation; headless path skips Ink (`runCli`).
- **Alternatives:** Direct callback `listener` on Orchestrator still exists (legacy).
- **Trade-offs:** Dual listener styles; must keep event kinds in sync with CLI components.

## 4. Dual verification paths

- **Decision:** Prefer `VerifierAgent` (5 layers); catch → legacy `Verifier` using per-task `verification` commands.
- **Reasoning:** `handleVerifying` try/`VerifierAgent` then `Verifier.verifyTask`.
- **Alternatives:** Single pipeline — not completed.
- **Trade-offs:** Behavior differs between paths (agent path has no lint layer; integration layer stubbed). Details: [VERIFICATION.md](VERIFICATION.md).

## 5. Worktree-isolated parallel batches

- **Decision:** Topological batches with non-overlapping `writeAllowlist` run in `.loopcode/worktrees`.
- **Reasoning:** `GitWorktreeScheduler`; falls back to mkdir when not in a git repo.
- **Alternatives:** Sequential in-place edits only — still used in test env (`isTestEnv` → cwd).
- **Trade-offs:** Needs git; merge path uses `mergeBranch('main', …)` assumptions.

## 6. Canonical config store with deprecated shim

- **Decision:** `configStore` + Zod `ConfigSchema` at `~/.loopcode/config.toml`; `ConfigManager` marked `@deprecated`.
- **Reasoning:** Precedence list in `config/schema.ts`; deprecation JSDoc on `config.ts`.
- **Trade-offs:** `CostEngine.loadConfig` still reads cwd `./config.toml` `[budgets]` independently — budget *enforcement* uses `ConfigManager`/`configStore`. See [CONFIG.md](CONFIG.md).
