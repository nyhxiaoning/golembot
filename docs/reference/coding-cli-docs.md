# Coding Agent CLI — Field Notes

In-depth technical reference for each Coding Agent CLI supported by GolemBot. Contains verified invocation methods, output format specifications, session management details, authentication options, and pitfall notes — based on real-world GolemBot integration work.

## Per-Engine Reference

- **[Cursor Agent CLI](./coding-cli-cursor)** — `agent` binary, stream-json, `--stream-partial-output` dedup
- **[Claude Code CLI](./coding-cli-claude-code)** — `claude` binary, stream-json, mixed assistant/user events
- **[OpenCode CLI](./coding-cli-opencode)** — `opencode` binary, NDJSON parts, HTTP Server API option
- **[Codex CLI](./coding-cli-codex)** — `codex` binary, NDJSON, ChatGPT OAuth, `--skip-git-repo-check`

## Cross-Engine Reference

- **[Four-Engine Comparison Matrix](./coding-cli-comparison)** — Side-by-side comparison of invocation, session, auth, skills, tools, and GolemBot integration for all four engines
