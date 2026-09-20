# LoopCode

LoopCode is an autonomous software engineering orchestrator built on top of **OpenCode**. It plans, executes, verifies, and budgets multi-step software goals locally.

> **Disclaimer:** This project is not affiliated with, sponsored by, or endorsed by the OpenCode/Anomaly team.

See [docs/README.md](docs/README.md) for architecture, configuration, and development.

## Install & run

**Installer**

```bash
curl -fsSL https://raw.githubusercontent.com/arjun-vegeta/loopCode/main/install.sh | bash
```

**Local development**

```bash
bun install
bun run build
bun run package   # optional standalone binary
bun run src/index.ts "Add a new endpoint for user profile retrieval"
```

```bash
bun run typecheck && bun run lint && bun run format:check && bun run test
```

## License

Source `LICENSE` is MIT. Note: `package.json` currently declares `"license": "ISC"` — treat that field as debt until aligned.
