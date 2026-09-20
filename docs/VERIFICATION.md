# VERIFICATION

Related: [AGENTS.md](AGENTS.md) · [TASKS.md](TASKS.md) · [DECISIONS.md](DECISIONS.md)

Layer execution only. Approvals and budgets: [AGENTS.md](AGENTS.md). Package-manager argv resolution: `src/platform/package-manager.ts` (used here for build/test commands).

## Primary path: `VerifierAgent`

File: `src/agents/verifier.ts` · Called first from `Orchestrator.handleVerifying`. Critical failures return early with `retryHint`.

| # | Layer | Status | Behavior |
| --- | --- | --- | --- |
| 1 | Compilation | ✓ | `resolveProjectCommands` build or typecheck argv; skipped evidence if none |
| 2 | Unit Tests | ✓ | Test argv; skipped in `isTestEnv()` or if no test script |
| 3 | Integration Tests | ~ | Always skipped: `No integration test suite found.` |
| 4 | Security Scan | ✓/~ | `semgrep scan --config auto --json`; else regex on modified files. **X** no `trivy` |
| 5 | LLM Code Review | ✓ | `ReviewerAgent.reviewTask` on execution IR |

## Fallback path: `Verifier`

File: `src/verifier.ts` · Used when `VerifierAgent` throws (including test-env forced fallback). Runs each `task.verification` step with types `compile` | `test` | `lint` only.
