# 嵌入到你的产品

GolemBot 既是 CLI 工具，也是 TypeScript 库。将它导入到你的应用中，你就拥有了一个由你已有的 Coding Agent 驱动的流式 AI 助手 — 无需任何 AI 框架。

## 何时选择库模式

| 方式 | 适用场景 |
|------|----------|
| `golembot gateway` | 需要 IM 通道（飞书、钉钉、企业微信）或独立 HTTP 服务 |
| **库引用** | 自己构建后端、机器人或产品，需要完全控制请求/响应生命周期 |

## 安装

作为普通依赖安装（非全局）：

```bash
npm install golembot
# 或
pnpm add golembot
```

## 核心 API

```typescript
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });
```

`dir` 指向助手目录 — 包含 `golem.yaml`、`skills/` 和 `AGENTS.md` 的文件夹。用 `golembot init` 或 `golembot onboard` 创建。

### 流式接收响应

`chat()` 返回 `AsyncIterable<StreamEvent>`，迭代它即可实时获取事件：

```typescript
for await (const event of assistant.chat('总结第三季度报告')) {
  if (event.type === 'text') process.stdout.write(event.content);
  if (event.type === 'done') console.log(`\n完成，耗时 ${event.durationMs}ms`);
}
```

### 多用户会话

传入 `sessionKey` 来隔离每个用户的会话。不同 sessionKey 并发运行，相同 sessionKey 串行执行：

```typescript
// 两个用户可以同时对话
const task1 = assistant.chat('任务 A', { sessionKey: 'user-alice' });
const task2 = assistant.chat('任务 B', { sessionKey: 'user-bob' });
```

### 重置会话

清除某个 sessionKey 的对话历史：

```typescript
await assistant.resetSession('user-alice');   // 清除指定会话
await assistant.resetSession();               // 清除默认会话
```

## 集成示例

### Express.js — SSE 端点

通过 Server-Sent Events 将 Agent 响应流式传输给浏览器或客户端：

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

### 后台任务 / 队列 Worker

异步处理长时间任务，完成后保存结果：

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

### 自定义 Slack 机器人（Bolt）

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

## 运行时覆盖引擎

无需修改 `golem.yaml` 即可在运行时切换引擎或模型：

```typescript
const assistant = createAssistant({
  dir: './my-bot',
  engine: 'opencode',
  model: 'anthropic/claude-sonnet-4-5',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## 处理所有事件类型

完整事件列表见 [StreamEvent](/zh/api/stream-events)。完整处理器示例：

```typescript
for await (const event of assistant.chat(message)) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content);
      break;
    case 'tool_call':
      console.log(`[工具] ${event.name}(${JSON.stringify(event.input)})`);
      break;
    case 'tool_result':
      console.log(`[结果] ${event.content?.slice(0, 80)}`);
      break;
    case 'warning':
      console.warn(`[警告] ${event.message}`);
      break;
    case 'error':
      console.error(`[错误] ${event.message}`);
      break;
    case 'done':
      console.log(`\n完成 — ${event.durationMs}ms，$${event.costUsd ?? 'n/a'}`);
      break;
  }
}
```

## TypeScript 类型

所有类型均从 `golembot` 包导出：

```typescript
import type { StreamEvent, GolemConfig, SkillInfo } from 'golembot';
```

完整类型列表见 [API 参考](/zh/api/create-assistant)。
