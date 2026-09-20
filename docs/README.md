# Documentation index

LoopCode docs live in this folder. Each fact should appear in **one** place; link with relative paths instead of copying.

## Index

| Doc | Purpose |
| --- | --- |
| [PROJECT.md](PROJECT.md) | Product problem, users, features, requirements, data models |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, modules, data flow, dependency graph |
| [AGENTS.md](AGENTS.md) | Orchestrator state machine, EventBus, escalation & safety |
| [VERIFICATION.md](VERIFICATION.md) | `VerifierAgent` / fallback `Verifier` layer flow |
| [CONFIG.md](CONFIG.md) | `config.toml`, auth onboarding, Antigravity proxy |
| [CLI.md](CLI.md) | TUI keybindings, slash commands, directory trust |
| [TASKS.md](TASKS.md) | Status board + classification / planning / routing work |
| [DECISIONS.md](DECISIONS.md) | Architectural decisions and trade-offs |
| [README.md](README.md) | This index |

## Reading order

1. [PROJECT.md](PROJECT.md)  
2. [ARCHITECTURE.md](ARCHITECTURE.md)  
3. [AGENTS.md](AGENTS.md)  
4. [VERIFICATION.md](VERIFICATION.md)  
5. [CONFIG.md](CONFIG.md)  
6. [CLI.md](CLI.md)  
7. [TASKS.md](TASKS.md)  
8. [DECISIONS.md](DECISIONS.md)

## Deduplication rule

- Product scope & APIs → `PROJECT.md`
- Module map & layers → `ARCHITECTURE.md`
- Runtime phases & safety events → `AGENTS.md`
- Verify layers only → `VERIFICATION.md`
- TOML / auth / proxy → `CONFIG.md`
- Keybindings & slash commands → `CLI.md`
- Backlog & routing behavior → `TASKS.md`
- Why choices were made → `DECISIONS.md`

Status tags used elsewhere: ✓ implemented · ~ partial · ? unknown · X deprecated
