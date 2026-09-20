# CLI — TUI keybindings & commands

Related: [CONFIG.md](CONFIG.md) · [AGENTS.md](AGENTS.md) · [PROJECT.md](PROJECT.md)

Transcript-first Ink TUI: live status, slash palette, modal overlays, cursor editing without hijacking scrollback.

## 1. Keybindings

|         Key         | Action              | Scope / Context     | Description                                                      |
| :-----------------: | :------------------ | :------------------ | :--------------------------------------------------------------- |
|       `Enter`       | Submit / Select     | Idle / Composer     | Submits composer input or selects active menu/overlay item       |
|    `Shift+Enter`    | Newline             | Composer            | Inserts a line break into the composer multiline buffer          |
|     `Shift+Tab`     | Toggle Mode         | Global              | Cycles permission modes (`auto` ➔ `acceptEdits` ➔ `plan`)        |
|      `Ctrl+T`       | Toggle Tasks        | Global              | Opens / closes the Task DAG overlay                              |
|      `Ctrl+V`       | Toggle Verify       | Global              | Opens / closes the Verification reports overlay                  |
|      `Ctrl+B`       | Toggle Budget       | Global              | Opens / closes the Budget & Quota telemetry overlay              |
|      `Ctrl+S`       | Toggle Sessions     | Global              | Opens / closes the Session picker overlay                        |
|      `Ctrl+O`       | Toggle Tool Details | Global              | Expands / collapses truncated tool execution logs in transcript  |
|      `Ctrl+P`       | Toggle Proxy        | Global              | Opens / closes the Antigravity Proxy management overlay          |
|      `Ctrl+W`       | Delete Word         | Composer            | Deletes the word preceding the cursor                            |
| `Ctrl+U` / `Ctrl+K` | Cut Line            | Composer            | Cuts text from cursor to start / end of line                     |
|    `Up` / `Down`    | History / Navigate  | Composer / Overlays | Navigates prompt history or moves selection in active overlay    |
|        `Esc`        | Interrupt / Close   | Global / Overlay    | Cancels current execution, or closes active overlay / picker     |
|      `Ctrl+C`       | Interrupt / Exit    | Global              | Press once to interrupt execution; press twice within 2s to exit |

## 2. Slash commands

| Command              | Category      | Description                                                               |
| :------------------- | :------------ | :------------------------------------------------------------------------ |
| `/help`              | General       | Display help overlay and command reference                                |
| `/login [provider]`  | Auth          | Start provider authentication wizard                                      |
| `/logout <provider>` | Auth          | Remove credentials for specified provider                                 |
| `/auth status`       | Auth          | Display connected providers and active model route                        |
| `/auth web`          | Auth          | Start token-gated loopback web onboarding page                            |
| `/model [role]`      | Configuration | Open interactive model picker for specific or default role                |
| `/proxy [cmd]`       | Proxy         | Manage Antigravity proxy (`enable`, `disable`, `status`, `start`, `stop`) |
| `/mode [x]`          | Safety        | Set or cycle permission mode (`auto`, `acceptEdits`, `plan`)              |
| `/run <goal>`        | Execution     | Start orchestration loop for natural language goal                        |
| `/stop`              | Execution     | Interrupt active execution loop                                           |
| `/resume [id]`       | Execution     | Resume session or task ID                                                 |
| `/rename <name>`     | Session       | Rename current session                                                    |
| `/pause`             | Session       | Mark session paused and exit cleanly                                      |
| `/sessions`          | Session       | Open interactive session picker overlay                                   |
| `/tasks`             | Telemetry     | Open Task DAG overlay                                                     |
| `/verify`            | Telemetry     | Open 5-layer verification log overlay                                     |
| `/cost`              | Telemetry     | Open budget & quota telemetry overlay                                     |
| `/diff`              | Git           | Show colorized git diff of modified workspace files                       |
| `/undo`              | Git           | Revert last commit created by LoopCode                                    |
| `/config`            | System        | View loaded config and source file path                                   |
| `/doctor`            | System        | Run system & environment diagnostic suite                                 |
| `/terminal-setup`    | System        | Launch interactive terminal capability setup                              |
| `/clear`             | System        | Clear visual transcript history                                           |
| `/exit`              | System        | Shut down controller and exit                                             |

## 3. Directory trust gate

- On first launch in a new project directory, LoopCode prompts for directory trust.
- **Trust options:**
  - `Trust for this session`
  - `Trust permanently` (saved to `~/.loopcode/trusted_dirs.json`)
  - `Exit`
- **Warning locations:** `~/Desktop`, `~/Documents`, `~/Downloads`.
- **Refused locations:** `/`, `/usr`, `/System`, and user home root (`~/`).
