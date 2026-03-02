# Cursor Agent CLI

### Official Documentation

- Overview: https://cursor.com/docs/cli/overview
- Installation: https://cursor.com/docs/cli/installation
- Using Agent: https://cursor.com/docs/cli/using
- Shell Mode: https://cursor.com/docs/cli/shell-mode
- MCP: https://cursor.com/docs/cli/mcp
- Headless CLI: https://cursor.com/docs/cli/headless
- GitHub Actions: https://cursor.com/docs/cli/github-actions
- Slash Commands: https://cursor.com/docs/cli/reference/slash-commands
- Parameters: https://cursor.com/docs/cli/reference/parameters
- Authentication: https://cursor.com/docs/cli/reference/authentication
- Permissions: https://cursor.com/docs/cli/reference/permissions
- Configuration: https://cursor.com/docs/cli/reference/configuration
- Output Format: https://cursor.com/docs/cli/reference/output-format
- Terminal Setup: https://cursor.com/docs/cli/reference/terminal-setup

---

### Installation

**Prerequisites**: None — the Cursor CLI (`agent`) is a standalone binary that does **not** require the Cursor IDE to be installed.

**Install via curl** (recommended):

```bash
curl https://cursor.com/install -fsS | bash
```

This installs the `agent` binary to `~/.local/bin/agent` (Linux/macOS) or `~/.cursor/bin/agent` (some CI environments). Ensure the install directory is on your `PATH`:

```bash
echo "$HOME/.local/bin" >> ~/.bashrc   # or ~/.zshrc
# In GitHub Actions:
echo "$HOME/.cursor/bin" >> $GITHUB_PATH
```

**Verify installation:**

```bash
agent --version
```

---

### Actual Invocation Method (Verified in GolemBot)

**Binary name**: `agent` (not `cursor`)
**Binary path**: `~/.local/bin/agent`

```bash
agent \
  -p "user message" \
  --output-format stream-json \
  --stream-partial-output \
  --workspace /path/to/assistant-dir \
  --force --trust --sandbox disabled \
  --approve-mcps \
  [--resume <sessionId>] \
  [--model <model-name>]
```

**PTY is not needed** (as of CLI version 2026.02+). Verified that `child_process.spawn` produces clean NDJSON on stdout with zero ANSI escape sequences. GolemBot has migrated `CursorEngine` from `node-pty` to standard `child_process.spawn`, eliminating the only native C++ dependency. `stripAnsi()` is retained as a safety net but is not expected to be triggered.

---

### stream-json Output Format

One JSON object per line (NDJSON). With `child_process.spawn` (verified in CLI version 2026.02+), stdout produces clean JSON with no ANSI escape sequences. `stripAnsi()` is retained as a safety net.

#### Event Type Overview

| type | subtype | Meaning | Key Fields |
|------|---------|---------|------------|
| `system` | `init` | Initialization | `session_id`, `model`, `cwd`, `apiKeySource` |
| `user` | — | User input (echo) | `message.content[].text` |
| `assistant` | — | Assistant reply | `message.content[].text` — array, filter for `type=text` and concatenate |
| `tool_call` | `started` | Tool call started | `call_id`, `tool_call.<XxxToolCall>.args` |
| `tool_call` | `completed` | Tool call completed | `call_id`, `tool_call.<XxxToolCall>.result` |
| `result` | `success` | Conversation ended normally | `session_id`, `duration_ms`, `result` (full text concatenation) |
| `result` | `error` | Conversation ended with error | `is_error: true`, `result` (error message) |

#### `--stream-partial-output` Behavior

Without this parameter, `assistant` events contain the **complete text** between two tool calls (output all at once).
With this parameter, `assistant` events become **character-level incremental deltas** — multiple `assistant` events must be concatenated to form the complete text.

**Key gotcha**: After all deltas for each segment (text between tool calls), Cursor sends an additional **summary event** whose content = concatenation of all deltas in that segment. If the summary is not skipped, **the user sees every segment repeated twice**. GolemBot detects and skips summaries at the CursorEngine layer through accumulated text comparison.

**GolemBot has this parameter enabled**, achieving true character-by-character streaming.

#### tool_call Structure

**Standard structure (vast majority of tools):**

```json
{
  "type": "tool_call",
  "subtype": "started",
  "call_id": "toolu_vrtx_01NnjaR886UcE8whekg2MGJd",
  "tool_call": {
    "readToolCall": {
      "args": { "path": "sales.csv" }
    }
  }
}
```

**Completed event includes result:**

```json
{
  "type": "tool_call",
  "subtype": "completed",
  "call_id": "toolu_vrtx_01NnjaR886UcE8whekg2MGJd",
  "tool_call": {
    "readToolCall": {
      "args": { "path": "sales.csv" },
      "result": {
        "success": {
          "content": "product,date,quantity...",
          "totalLines": 54,
          "totalChars": 1254
        }
      }
    }
  }
}
```

**Known tool names (the key is not a fixed enum — must be dynamically matched with `*ToolCall`):**
- `readToolCall` — Read file
- `writeToolCall` — Write file
- `ShellToolCall` — Execute command

**Alternative structure (some tools use the `function` format):**

```json
{
  "type": "tool_call",
  "subtype": "started",
  "tool_call": {
    "function": {
      "name": "tool_name",
      "arguments": "{\"query\": \"test\"}"
    }
  }
}
```

**GolemBot's parsing strategy:**
- `subtype: "started"` or no subtype → yield `{ type: 'tool_call', name, args }`
- `subtype: "completed"` → yield `{ type: 'tool_result', content }` (extract result field)
- Handles both `*ToolCall` and `function` structures

---

### Session Resume

- `--resume <sessionId>` parameter lets the Agent continue a conversation in the same context
- `--continue` is an alias for `--resume=-1`, resuming the most recent session
- `agent ls` lists all historical sessions
- session_id is obtained from the `session_id` field of `type: "result"` events
- Resume failure manifests as: Agent process exits with a non-zero exit code, or the result event returns `is_error: true`
- Failure messages typically contain "resume" or "session" keywords

**GolemBot's fallback strategy**: On detecting resume failure → clear the saved session → retry once without `--resume`

---

### Authentication Methods

| Method | Use Case | Setup |
|--------|----------|-------|
| `agent login` | Local development (recommended) | Browser OAuth flow, credentials stored locally |
| `CURSOR_API_KEY` environment variable | CI/CD, scripts, headless environments | Obtain from Cursor Dashboard → Integrations → User API Keys |
| `--api-key <key>` parameter | One-off invocations | Pass directly |

**CI/CD scenarios must use API key** — `agent login` requires browser interaction.

---

### Skill Auto-Discovery Mechanism

When Cursor Agent starts, it reads:
1. All `SKILL.md` files under the `.cursor/skills/` directory
2. `AGENTS.md` and `CLAUDE.md` at the project root (if they exist)
3. Rule files under the `.cursor/rules/` directory

The Agent **autonomously decides** when to use which Skill — no need for the user to specify in the prompt.

GolemBot's approach is to symlink `skills/<name>` to `.cursor/skills/<name>`, refreshing symlinks before each invoke.

---

### Permissions System

Fine-grained permissions can be configured via `~/.cursor/cli-config.json` (global) or `.cursor/cli.json` (project-level):

| Format | Example | Effect |
|--------|---------|--------|
| `Shell(cmd)` | `Shell(git)`, `Shell(npm)` | Controls which commands can be executed |
| `Read(glob)` | `Read(src/**/*.ts)` | Controls which files can be read |
| `Write(glob)` | `Write(docs/**/**)` | Controls which files can be written |
| `WebFetch(domain)` | `WebFetch(*.github.com)` | Controls which domains can be accessed |
| `Mcp(server:tool)` | `Mcp(datadog:*)` | Controls which MCP tools can be used |

Deny rules take precedence over allow rules. Valuable for security-sensitive scenarios (e.g., CI/CD code review bots).

---

### MCP Support

The Agent automatically detects and uses MCP servers configured in `.cursor/mcp.json`.
- `--approve-mcps` parameter skips the MCP approval prompt (required for headless — **GolemBot has this enabled**)
- `agent mcp list` shows configured MCP servers
- `agent mcp list-tools <server>` shows tools provided by a specific MCP server

---

### Cloud Agent

- `-c` / `--cloud` starts a cloud Agent, pushing the conversation to the cloud for continuous execution
- In interactive sessions, prefixing a message with `&` sends the task to a Cloud Agent
- Suitable for long-running tasks — the user doesn't need to wait
- View and continue cloud tasks at cursor.com/agents

---

### Configuration Files

| File | Location | Content |
|------|----------|---------|
| `cli-config.json` | `~/.cursor/cli-config.json` | Global config (permissions, vim mode, network proxy, etc.) |
| `cli.json` | `.cursor/cli.json` (project-level) | Permissions config only |

---

### GitHub Actions Integration

```yaml
- name: Install Cursor CLI
  run: |
    curl https://cursor.com/install -fsS | bash
    echo "$HOME/.cursor/bin" >> $GITHUB_PATH

- name: Run Cursor Agent
  env:
    CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
  run: |
    agent -p "Your prompt here" --model gpt-5.2
```

---

### Known Pitfalls

1. **stdout buffer doesn't split by line** — `data` events may fire at arbitrary byte boundaries; you must manually maintain a buffer and split on `\n`
2. **Buffer may have residual data when process exits** — You must drain remaining content in the `close` callback
3. **ANSI stripping retained as safety net** — With `child_process.spawn` (2026.02+), stdout is clean JSON. `stripAnsi()` is kept for backward compatibility with older CLI versions that may have been invoked via PTY
4. **`--sandbox disabled` is required** — Otherwise the Agent fails on certain operations (like writing files) due to permission issues
5. **`--force --trust` are required** — Skip interactive confirmations; otherwise the Agent waits for user input and hangs
6. **`--approve-mcps` should always be included** — Otherwise, when MCP config exists, it interactively asks whether to approve, causing headless hangs
7. **`--stream-partial-output` causes summary duplication** — After each segment's deltas, an additional summary event is sent (content = all deltas concatenated). The consumer must deduplicate, or text will be doubled. GolemBot detects summaries via accumulated comparison and skips them
8. **tool_call has both started/completed events** — If not differentiated, each tool call gets processed twice
9. **tool_call key names are not fixed** — You can't hardcode `readToolCall`; you must dynamically match the `*ToolCall` suffix, and some tools use the `function` structure
10. **The `result` event's `result` field is a full-text concatenation** — Not just the last segment, but a concatenation of all assistant text
