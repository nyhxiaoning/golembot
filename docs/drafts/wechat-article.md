# 「不做 Agent，做 Agent 套娃」

---

去年年中我花了三个月，从零搭了一个完整的法律 Agent 应用。

RAG 检索、工具调用、上下文管理、会话记忆……该有的都有了。上线之后效果还行。

直到去年年末，当我 90% 的代码都是 Cursor 完成的时候，我意识到一件事：**市面上大多数的 Agent 帮用户完成的事情，本质上都能通过 Coding Agent 完成。**

那一刻我就在想：**用户为什么不直接用 Coding Agent？**

问题只有一个——它被困在命令行/IDE里了。

你打开终端，输入命令，和它对话，关掉终端，它就消失了。这么强的一个东西，只能一个人在终端里用，不能接进飞书、不能嵌进产品、不能在群里协作。

我想把它放出来。

---

## 把 Coding Agent 从命令行/IDE 中解救出来

GolemBot 做的事：**Free Your Coding Agent**

目前支持四个主流引擎：**Cursor、Claude Code、OpenCode、Codex**。基本涵盖了市面上最强的几个 Coding Agent。未来有新的出来，接一个 engine adapter 就行——GolemBot 的设计就是为了不绑死任何一个引擎。

装完之后三步跑起来：

```bash
npm install -g golembot        # 1. 安装
mkdir my-bot && cd my-bot
golembot onboard               # 2. 7步引导向导：选引擎、起名字、配渠道
golembot gateway               # 3. 启动，HTTP API + IM 渠道同时上线
```

不需要公网 IP。飞书、钉钉、Slack、Discord、Telegram 五个渠道都走 WebSocket 或长轮询，在 NAT 后面、在家里的电脑上就能跑。企业微信需要 Webhook 回调，是唯一需要公网的。

跑起来之后，你在 Slack 里 @bot 发消息，背后跑的是完整的 Coding Agent——能执行命令、能改代码的 Agent。

---

## 把 Coding Agent 接进你的 IM

这是最直接的用法——你团队在哪个 IM 里协作，Coding Agent 就跑在那个 IM 里。

GolemBot 内置了六个 IM 渠道的 adapter：**飞书、钉钉、企业微信、Slack、Discord、Telegram**。`golem.yaml` 里填上 token，启动 gateway，bot 就上线了。

举个例子：你在飞书群里 @bot 说「帮我看一下登录逻辑有没有安全问题」，它真的会去读你的代码文件、分析逻辑、给出具体的修改建议——因为背后跑的就是一个完整的 Coding Agent，和你在终端里用的是同一个东西。

除了被动响应 @mention，GolemBot 还支持三种群聊策略：

- **mention-only**：被 @到才说话，最省成本
- **smart**：bot 一直在看群里的对话、更新记忆，但只在觉得有价值时才插嘴
- **always**：每条消息都回，适合专用小群

smart 模式比较有意思——bot 不是被动等你叫它，它一直在旁听。它看到有人讨论了一个关键决策，会默默记下来；下次有人问相关问题时，它已经有上下文了。

---

## 把 Coding Agent 嵌进你自己的产品

这是我觉得 GolemBot 最有想象力的用法——**直接把 Coding Agent 当成你产品的 AI 引擎**。

你不需要自己接大模型 API、管 prompt、搭工具链。GolemBot 把这些全部封装成了一个 `chat()` 方法：

```typescript
import { createAssistant } from 'golembot';
const bot = createAssistant({ dir: './my-bot' });

// 不同用户用不同的 sessionKey 隔离会话
const stream = bot.chat('帮我分析一下最近的合同风险', {
  sessionKey: `user-${userId}`,
});

for await (const event of stream) {
  if (event.type === 'text') sendToClient(event.content);
}
```

几个做产品时会关心的细节：

**多用户隔离**：不同用户传不同的 `sessionKey`，GolemBot 自动隔离会话。同一个用户的请求串行执行保证上下文一致，不同用户并行，互不干扰。

**会话持久化**：所有会话状态自动存在助手目录的 `.golem/sessions.json` 里。服务重启了，用户下次来，GolemBot 自动读取上次的 session 恢复对话。用户感知上就是连续的——「上次我们讨论到哪了？」它记得。

**会话历史**：每轮对话（用户消息 + Agent 回复）都追加到 `.golem/history.jsonl`，包含时间戳、耗时、token 成本。你可以拿这个做用量统计、审计日志，或者喂给你自己的分析系统。

**引擎随时换**：产品上线后发现 Codex 性价比更高？golem.yaml 里 `engine: claude-code` 改成 `engine: codex`，重启就生效。上层代码一行不用改。

说白了，GolemBot 帮你把「怎么跟 Coding Agent 对话、怎么管会话、怎么服务多用户」这些脏活全干了。你只需要关心你的产品逻辑。

---

## 为什么不自己造 Agent

因为你造不过它们。

Cursor、Claude Code、Codex，每一个背后都是几百人的团队，拿着几十亿的融资，用最顶级的模型，专门在卷一件事：怎么让 Agent 更好地理解指令、调用工具、完成任务。

你自己从零搭一个 Agent，要做上下文管理、工具调度、prompt 工程、模型适配……就算做出来了，效果大概率不如直接用 Cursor。

不必重复造轮子。**直接把这些现成的最强 Agent 拿来用，把精力花在你自己的产品逻辑上。** GolemBot 做的就是这个——不碰智能层，只做连接层。引擎变强，你自动变强。

---

## Skill：直接复用 Coding Agent 的原生能力

一个有意思的现象：现在主流 Coding Agent 的 Skill 系统已经趋同了。

Claude Code 有 `.claude/skills/`，Cursor 有 `.cursor/skills/`，Codex 有 `.agents/skills/`，OpenCode 有 `.opencode/skills/`。格式都差不多——一个目录，里面放一个 `SKILL.md`（Markdown 指令），可以附带脚本、模板、参考文档。

GolemBot 没有另搞一套。你写的 `SKILL.md`，GolemBot 自动桥接到当前引擎的约定位置。用 Claude Code 就 symlink 到 `.claude/skills/`，用 Cursor 就到 `.cursor/skills/`。**写 GolemBot Skill 和你直接给 Coding Agent 写 Skill 是同一件事。**

区别在于跨引擎：同一份 Skill，你在 Claude Code 上调试好，切到 Cursor、切到 Codex 都能直接用，不用改。

---

## 多 bot 群聊：让 Agent 替你干活

最后说一个我觉得最有意思的场景。

假设你运营一个公众号，有一个内容团队的飞书群，里面跑着三个 GolemBot：

- **@选题**—— 负责追热点、分析竞品、挖选题
- **@写手**—— 负责写稿、改稿、调整风格
- **@数据**—— 负责分析阅读数据、总结什么内容涨粉

周一早上，主编在群里说：「@选题 看看这周科技圈有什么热点，给我三个选题方向」

选题 bot 扫了一圈资讯，回复：「1. OpenAI 发了新模型，适合写 AI 科普；2. 苹果 WWDC 预热，适合做产品分析；3. 某大厂裁员，适合写职场向。」

主编挑了第一个：「就写 AI 科普。@写手 按我们公众号的风格出一篇初稿，3000 字左右。」

写手 bot 读了 skills 目录里的「公众号风格指南」，加上之前历史稿件的记忆，开始输出初稿。

这时候数据 bot 一直在 smart 模式下潜水。它看到选了 AI 科普方向，主动插了一嘴：「提醒一下，上个月发的两篇 AI 科普阅读都过万了，但完读率偏低。建议这次多用类比少用术语，开头 200 字内给一个强钩子。」

没人 @它，但它觉得这个信息有价值，就说了。

主编说：「@写手 注意一下数据那边的建议。」

全程在群里完成：选题、写稿、数据复盘，三个 bot 各司其职。主编只需要做决策，执行全交给 Agent。

这里面几个关键点：

- 三个 bot 可以用**不同的引擎**（比如写手用 Claude Code 文笔更好，数据用 Codex 跑分析更快）
- 它们**共享群聊上下文**——数据 bot 能看到选题 bot 的回复
- smart 模式下，bot **觉得有价值才说话**，不是每条消息都回
- 每个 bot 都在持续积累记忆——写手记住了你的风格偏好，数据记住了历史表现规律

---

GitHub: github.com/0xranx/golembot

npm install -g golembot && golembot onboard，十分钟跑起来。
