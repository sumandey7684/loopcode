# AGENTS — State machine, EventBus & safety

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [VERIFICATION.md](VERIFICATION.md) · [CLI.md](CLI.md)

The core execution of LoopCode is managed by an event-driven state machine (`Orchestrator`) emitting typed events (`phase`, `plan`, `task-state`, `verification`, `cost`, `approval-request`, `escalation`, `notice`) over an `EventBus`.

```
[PLANNING] ── plan generated ──► [EXECUTING] ── retry < MAX_RETRIES ──► [EXECUTING]
   ▲                                 │                                    ▲
   │                                 ▼                                    │
re-plan (retries exhausted) ◄── [VERIFYING] ────────── failed ────────────┘
                                     │
                                   passed
                                     │
                                     ▼
                                  [DONE]
```

## State transitions & EventBus

- **`updateState(taskId, state)`**: Emits `phase` event with phase detail and updates SQLite task record.
- **`handlePlanning`**: Emits `plan` event containing DAG task batches and replan flags.
- **`handleExecuting`**: Emits `task-state` (`running`, `passed`, `failed`) and `cost` events per task.
- **`handleVerifying`**: Emits `verification` events for evaluated layers (see [VERIFICATION.md](VERIFICATION.md)).

## Escalation & safety policies

### Loop oscillation

- `LoopDetector` hashes (`phase`, `taskIndex`, `filesChanged`, `retryAttempt`).
- On oscillation, `Orchestrator` emits `escalation` with options (`continue`, `replan`, `abort`) and awaits `resolveEscalation`.
- Headless (`--headless`): oscillation auto-aborts.

### Cost & budget

- Spend checked against `maxMonthlyCostUsd`, `maxGoalCostUsd`, and `maxTaskCostUsd` (config: [CONFIG.md](CONFIG.md)).
- Breaches throw `BudgetExceededError` (exit `77`, message prefix `BUDGET_TERMINATION:`).
- `rollbackWorkspace` honors `allowDestructiveRollback` (default `false`).

### Approvals & permission modes

Handled in `Orchestrator.requestApproval` / CLI state:

| Mode | Behavior |
| --- | --- |
| `auto` | Auto-approve non-destructive; destructive need approval |
| `acceptEdits` | Auto-approve file edits; shell needs approval |
| `plan` | Approve edits and shell explicitly |
| `--headless` | Auto-approve non-destructive; decline destructive |

Directory trust gate: [CLI.md](CLI.md#3-directory-trust-gate).
