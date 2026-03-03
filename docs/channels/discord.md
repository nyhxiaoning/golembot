# Discord

GolemBot connects to Discord via the **Gateway WebSocket** — no public URL required. The bot responds to DMs and server channel messages.

## Prerequisites

- A Discord account
- Node.js ≥ 18
- A Discord application with a Bot user

## Install the SDK

```bash
npm install discord.js
```

## Create a Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Under **Bot**, click **Add Bot**. Copy the **Bot Token** — you'll need it for `golem.yaml`.
3. Under **Privileged Gateway Intents**, enable **Message Content Intent** (required for the bot to read message text).
4. Under **OAuth2 → URL Generator**, select the `bot` scope and the following permissions:
   - **Read Messages/View Channels**
   - **Send Messages**
   - **Read Message History**
5. Copy the generated URL, paste it in your browser, and invite the bot to your server.

## Configure golem.yaml

```yaml
name: my-assistant       # must match botName below for @mention detection
engine: claude-code

channels:
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
    botName: my-assistant  # set to the same value as `name` above
```

Set environment variables before running:

```bash
export DISCORD_BOT_TOKEN=your-token-here
golembot gateway
```

### `botName` field

`botName` is **required for @mention detection in server channels**. Discord uses internal user IDs (`<@12345678>`) rather than names in message content. The adapter replaces these tokens with `@botName` so that GolemBot's mention detection works correctly.

Set `botName` to the same value as your `name` field in `golem.yaml`.

Without `botName`, the bot still works in DMs (always responds) and in groups if `groupPolicy: always` is set, but `mention-only` and `smart` policies won't detect @mentions.

## How It Works

| Chat type | Behavior |
|-----------|----------|
| DM | Always responds |
| Server channel @mention (`@YourBot message`) | Detects mention, responds |
| Server channel message without @mention | Depends on `groupPolicy` (default: ignored) |

Each DM conversation and each server channel maintains its own session context.

## Message Limits

Discord messages are split at **2,000 characters** per chunk if the response is longer.

## Group Chat

Discord server channels are treated as **group** chats. Configure the response policy via `groupChat` in `golem.yaml`:

```yaml
groupChat:
  groupPolicy: mention-only  # mention-only (default) | smart | always
  historyLimit: 20
  maxTurns: 10
```

See the [Channel Overview](/channels/overview#group-chat-behaviour) for full details.
