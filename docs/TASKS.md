# TASKS — LoopCode

Status board + classification / planning / routing behavior.  
Tags: ✓ ~ ? X · Related: [PROJECT.md](PROJECT.md) · [DECISIONS.md](DECISIONS.md)

No git history in this workspace (`fatal: not a git repository`). Status inferred from code maturity + `tests/` (27 test files).

## Completed ✓

- CLI entry, exit codes, headless/login flags — `src/index.ts`, `tests/exit-codes.test.ts`
- Config schema/store/migration — `src/config/*`, `tests/config.test.ts`
- EventBus + redaction — `src/app/events.ts`, `tests/events.test.ts`, `tests/redact.test.ts`
- Auth/OAuth listener/web onboard — `src/auth/*`, matching tests
- Antigravity proxy consent/registration — `src/proxy/*`, `tests/proxy.test.ts`
- Orchestrator state machine + V2 engines tests — `tests/orchestrator.test.ts`, `tests/v2_engines.test.ts`
- IR Zod schemas — `src/ir/*`, `tests/ir.test.ts`
- Schema sync `src/db/schema.ts` ↔ `db/schema.sql` — `tests/schema.test.ts`
- Ink TUI components — multiple `tests/*.tsx`
- Package manager argv resolution — `tests/package-manager.test.ts`

## TODO —

- Wire `ResearcherAgent` into planning/execution (`src/agents/researcher.ts` unused by `Orchestrator`)
- Implement Integration Tests layer (currently always skipped) — `VerifierAgent` ~L118–128 · [VERIFICATION.md](VERIFICATION.md)
- Run lint layer in `VerifierAgent` (commands in `resolveProjectCommands`; IR allows `lint`)
- Consume or delete unused `ModelPortfolio` — `src/router/portfolio.ts`
- Align `CostEngine` config loading with `configStore` (stop dual `./config.toml` `[budgets]` path)
- Add `cost_log` to `SCHEMA_SQL` / `db/schema.sql` for single schema source of truth
- Resolve license metadata: `LICENSE` = MIT, `package.json` `"license": "ISC"`

## DEBT —

- `@deprecated` `ConfigManager` still used by `Orchestrator.checkBudgets` / executing path — `src/config.ts`
- Dual verifiers (`VerifierAgent` + `Verifier`) with divergent layer sets
- Hardcoded `$0.05` spend on verify in `handleVerifying` (`recordSpend(..., 0.05)`)
- `Classifier` recommends model ids (e.g. `gemini-3.5-flash`, `claude-4.8-opus`) that may not match catalog routes
- Indexer git porcelain split uses `'\\n'` literal — possible bug in `CodeIndexer.indexDirectory`

## BLOCKED —

- Standalone release/install verification in this checkout — no `.git`; `install.sh` depends on GitHub `v2.0.0` tarball
- Integration-test verification — no discovery/runner implemented (stub only)
- Full semantic indexing guarantees — `SemanticMemory` optional/fail-soft on missing native deps

---

## Classification, planning & routing

### Smart classification (`src/classifier.ts`)

Before planning, the goal is classified:

- **Tier 1:** Rule-based fast regex (typos, comments, renames, dependency bumps → `single_agent`).
- **Tier 2:** Complexity heuristics (file count, keywords like `refactor` / `optimize` / `security`).
- **Paths:**
  - **Single-Agent** — Fast-track through a single engineer session.
  - **Full-Loop** — Multi-agent DAG plan → execute → verify.

### Structured goal planning

For full-loop goals, `PlannerAgent` builds a DAG of task nodes.

- **Batches:** `GitWorktreeScheduler.topologicalSort()` groups non-overlapping `writeAllowlist` tasks; concurrent worktrees under `.loopcode/worktrees/`.
- **Re-plan:** After retries exhausted in verifying, orchestrator returns to planning and injects failure evidence (compile/test/review) into `PlannerAgent`.

### Dynamic model router (`src/router/dynamic.ts`)

`DynamicRouter.route` cascade (when catalog set via `setCatalog`):

1. Task-type / role preference (reasoning models for plan when available).
2. Complexity adjustments.
3. Budget enforcement / cheaper fallback.
4. Cache-awareness cost adjustment.
