# CONFIG — Configuration, auth & Antigravity proxy

Related: [CLI.md](CLI.md) · [PROJECT.md](PROJECT.md) · [DECISIONS.md](DECISIONS.md)

## Configuration file (`~/.loopcode/config.toml`)

Parsed with `smol-toml`, validated by Zod (`src/config/schema.ts`), persisted atomically by `configStore` (`mode 0600`).

Precedence (highest first): CLI flags → `LOOPCODE_*` env → `~/.loopcode/config.toml` → legacy `./config.toml` (deprecated) → defaults.

```toml
[model]
default      = "anthropic/claude-sonnet-4-6"
planning     = "anthropic/claude-opus-4-6"
execution    = "anthropic/claude-sonnet-4-6"
verification = "anthropic/claude-sonnet-4-6"

[budget]
maxMonthlyCostUsd = 100.0
maxGoalCostUsd    = 10.0
maxTaskCostUsd    = 2.0

[proxy]
enabled        = false
kind           = "antigravity"
port           = 8080
autoStart      = true
providerId     = "antigravity"

[ui]
theme = "auto"
ascii = false

[safety]
permissionMode           = "acceptEdits"
allowDestructiveRollback = false
maxParallelAgents        = 5
```

Packaging: `bun run package` builds a Bun `--compile` binary (see root install scripts). Process flags and exit codes: [PROJECT.md](PROJECT.md#cli--process-interface).

## In-TUI authentication & provider onboarding

1. **API key** — Masked in-TUI entry (`maskKey`); `client.auth.set()` then clear from memory.
2. **OAuth** — `auto`: browser + loopback capture (`startLoopbackListener`); `code`: paste for manual/headless.
3. **Web onboarding** — `startWebOnboarding` at `http://127.0.0.1:<port>/<token>/`; single-use, 10-minute TTL, CSP `default-src 'none'`.

Slash commands for auth: [CLI.md](CLI.md).

## Antigravity proxy

> **RISK NOTICE:** Unofficial; not affiliated with Google or Anthropic. May violate Google ToS; account bans reported. Prefer a secondary account. Explicit consent required (`riskAcceptedAt`).

`antigravity-claude-proxy` exposes an Anthropic Messages API locally and forwards to Google Antigravity via Google OAuth.

Principles enforced in code:

1. Opt-in: `proxy.enabled` defaults `false`.
2. Explicit consent before enable.
3. No global `npm install -g` by LoopCode — user installs missing binary themselves.
4. Quota telemetry for proxy routes (not metered USD).

```toml
[proxy]
enabled = true
kind = "antigravity"
port = 8080
autoStart = true
providerId = "antigravity"
riskAcceptedAt = "2026-07-25T12:00:00.000Z"
```

Management via `/proxy status|enable|disable|start|stop` — [CLI.md](CLI.md).
