# Codex Engine

The Codex engine invokes the OpenAI `codex` CLI (`@openai/codex`), which uses OpenAI models to autonomously complete tasks.

## Prerequisites

- Install Codex: `npm install -g @openai/codex`
- Authenticate (choose one):
  - **ChatGPT OAuth** — `codex login` (for ChatGPT Plus/Pro/Team/Enterprise subscribers)
  - **API key** — set `OPENAI_API_KEY` environment variable

## Configuration

```yaml
# golem.yaml
name: my-bot
engine: codex
# model: o4-mini   # optional; omit when using ChatGPT OAuth
```

## Authentication

Codex supports two authentication modes:

### ChatGPT OAuth (browser login)

For ChatGPT Plus / Pro / Team / Enterprise subscribers:

```bash
codex login    # opens browser; credentials stored in ~/.codex/auth.json
```

GolemBot automatically uses the stored credentials — no extra configuration needed.

> **Model compatibility:** `codex-mini-latest` is only available in API key mode. When using ChatGPT OAuth, leave `model` unset in `golem.yaml` so Codex selects the appropriate model for your subscription automatically.

### API Key

For CI/CD, scripts, or programmatic access:

```bash
export CODEX_API_KEY=sk-...          # primary env var for Codex CLI (per official CI docs)
# OPENAI_API_KEY is also accepted for compatibility with older versions

# Or pre-login with the key (stored in ~/.codex/auth.json):
printenv CODEX_API_KEY | codex login --with-api-key
```

Pass via `createAssistant()` or `golem.yaml`:

```typescript
const bot = createAssistant({ dir: './my-bot', apiKey: process.env.CODEX_API_KEY })
```

## Choosing a Model

**List available models:**

```bash
codex models
```

**Common models (API key mode):**

| Model | Description |
|-------|-------------|
| `5.3-codex` | Latest full-size Codex model (visible to API users since Feb 2026) |
| `codex-mini-latest` | Fast, cost-efficient coding model (o4-mini-based) |
| `codex-1` | Original o3-based release model |

**Override at runtime** — pass `model` to `createAssistant()`:

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'o4-mini' })
```

## How It Works

### CLI Invocation

GolemBot calls the Codex CLI in headless mode:

```bash
# New session
codex exec --json --full-auto --skip-git-repo-check "<prompt>"

# Resume session
codex exec resume --json --full-auto --skip-git-repo-check <thread_id> "<prompt>"
```

Flags used:

| Flag | Purpose |
|------|---------|
| `--json` | NDJSON output, required for stream parsing |
| `--full-auto` | Disables interactive permission prompts — required for headless operation |
| `--skip-git-repo-check` | Allows running outside a Git repository (temp dirs, CI workspaces) |
| `--model <name>` | Override model (API key mode only) |

### Skill Injection

GolemBot injects skills into Codex via two mechanisms:

1. **`.agents/skills/` symlinks** — each skill directory is symlinked to `.agents/skills/<name>`, matching Codex's native skill discovery (progressive disclosure)
2. **`AGENTS.md`** — auto-generated at the workspace root with skill descriptions and project instructions

```
my-bot/
├── AGENTS.md          # auto-generated, lists all skill descriptions
├── .agents/
│   └── skills/
│       ├── general → ../../skills/general     # symlink
│       └── im-adapter → ../../skills/im-adapter
└── skills/
    ├── general/
    └── im-adapter/
```

### Output Parsing

Codex emits NDJSON (`--json`). The parser handles:

| Event | Action |
|-------|--------|
| `thread.started` | Captures `thread_id` for session resume (not forwarded to consumer) |
| `item.completed` (`agent_message`) | Emits `text` event |
| `item.completed` (`command_execution`) | Emits `tool_call` + `tool_result` events |
| `turn.completed` | Emits `done` event with `sessionId = thread_id` |
| `turn.failed` | Emits `error` event |
| Top-level `error` | WebSocket reconnection notices are suppressed; other errors emit a `warning` event |

### Session Resume

The `thread_id` from `thread.started` is saved as `sessionId`. On the next turn GolemBot calls:

```bash
codex exec resume --json --full-auto --skip-git-repo-check <thread_id> "<prompt>"
```

The `resume` subcommand inherits all flags and continues the existing session context.

## Notes

- Codex Cloud (Codex Cloud tasks) is only available with ChatGPT OAuth, not with an API key
- Unlike other engines, Codex does not provide cost/token tracking in the `done` event
- Skills are injected via `.agents/skills/` symlinks (native Codex discovery) and `AGENTS.md` at the workspace root
