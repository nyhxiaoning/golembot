# Embed in Your Product

GolemBot is both a CLI tool and a TypeScript library. When you import it into your own application, you get a streaming AI assistant powered by the Coding Agent you already have — with no AI framework required.

## When to Use the Library

| Approach | Use when... |
|----------|-------------|
| `golembot gateway` | You want IM channels (Feishu, DingTalk, WeCom) or a standalone HTTP service |
| **Library** | You're building your own backend, bot, or product and want full control over the request/response lifecycle |

## Install

Install as a regular dependency (not global):

```bash
npm install golembot
# or
pnpm add golembot
```

## Core API

```typescript
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });
```

`dir` points to an assistant directory — a folder with `golem.yaml`, `skills/`, and `AGENTS.md`. Create one with `golembot init` or `golembot onboard`.

### Stream a Response

`chat()` returns an `AsyncIterable<StreamEvent>`. Iterate it to receive events as they stream:

```typescript
for await (const event of assistant.chat('Summarize the Q3 report')) {
  if (event.type === 'text') process.stdout.write(event.content);
  if (event.type === 'done') console.log(`\nDone in ${event.durationMs}ms`);
}
```

### Multi-User Sessions

Pass a `sessionKey` to isolate sessions per user. Different session keys run concurrently; same session keys are serialized:

```typescript
// Two users can chat simultaneously
const task1 = assistant.chat('Task A', { sessionKey: 'user-alice' });
const task2 = assistant.chat('Task B', { sessionKey: 'user-bob' });
```

### Reset a Session

Clear conversation history for a session key:

```typescript
await assistant.resetSession('user-alice');   // clear specific session
await assistant.resetSession();               // clear default session
```

## Integration Examples

### Express.js — SSE Endpoint

Stream the agent response to a browser or client via Server-Sent Events:

```typescript
import express from 'express';
import { createAssistant } from 'golembot';

const app = express();
const assistant = createAssistant({ dir: './my-bot' });

app.get('/chat', async (req, res) => {
  const { message, userId } = req.query as Record<string, string>;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const event of assistant.chat(message, { sessionKey: userId })) {
    if (event.type === 'text') {
      res.write(`data: ${JSON.stringify({ text: event.content })}\n\n`);
    }
    if (event.type === 'done') {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  }
});

app.listen(3000);
```

### Next.js — App Router API Route

```typescript
// app/api/chat/route.ts
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });

export async function POST(req: Request) {
  const { message, userId } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of assistant.chat(message, { sessionKey: userId })) {
        if (event.type === 'text') {
          controller.enqueue(encoder.encode(event.content));
        }
        if (event.type === 'done') {
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
```

### Background Job / Queue Worker

Process long-running tasks asynchronously, saving results when done:

```typescript
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });

async function processJob(jobId: string, prompt: string) {
  const chunks: string[] = [];

  for await (const event of assistant.chat(prompt, { sessionKey: jobId })) {
    if (event.type === 'text') chunks.push(event.content);
    if (event.type === 'done') {
      await db.jobs.update(jobId, {
        result: chunks.join(''),
        costUsd: event.costUsd,
        completedAt: new Date(),
      });
    }
  }
}
```

### Custom Slack Bot (via Bolt)

```typescript
import { App } from '@slack/bolt';
import { createAssistant } from 'golembot';

const app = new App({ token: process.env.SLACK_BOT_TOKEN, signingSecret: process.env.SLACK_SIGNING_SECRET });
const assistant = createAssistant({ dir: './my-bot' });

app.message(async ({ message, say }) => {
  const userId = message.user;
  let reply = '';

  for await (const event of assistant.chat(message.text ?? '', { sessionKey: userId })) {
    if (event.type === 'text') reply += event.content;
  }

  await say(reply);
});
```

## Override Engine at Runtime

You can override the engine or model without editing `golem.yaml`:

```typescript
const assistant = createAssistant({
  dir: './my-bot',
  engine: 'opencode',
  model: 'anthropic/claude-sonnet-4-5',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## Handling All Event Types

See [StreamEvent](/api/stream-events) for the full list. A complete handler:

```typescript
for await (const event of assistant.chat(message)) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content);
      break;
    case 'tool_call':
      console.log(`[tool] ${event.name}(${JSON.stringify(event.input)})`);
      break;
    case 'tool_result':
      console.log(`[result] ${event.content?.slice(0, 80)}`);
      break;
    case 'warning':
      console.warn(`[warn] ${event.message}`);
      break;
    case 'error':
      console.error(`[error] ${event.message}`);
      break;
    case 'done':
      console.log(`\nDone — ${event.durationMs}ms, $${event.costUsd ?? 'n/a'}`);
      break;
  }
}
```

## TypeScript Types

All types are exported from the `golembot` package:

```typescript
import type { StreamEvent, GolemConfig, SkillInfo } from 'golembot';
```

See the [API Reference](/api/create-assistant) for the full type list.
