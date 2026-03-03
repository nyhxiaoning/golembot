# Discord

GolemBot 通过 **Gateway WebSocket** 连接 Discord——无需公网 IP。Bot 可以响应私信（DM）和服务器频道中的消息。

## 前置条件

- Discord 账号
- Node.js ≥ 18
- 一个带 Bot 用户的 Discord 应用

## 安装 SDK

```bash
npm install discord.js
```

## 创建 Bot

1. 打开 [Discord Developer Portal](https://discord.com/developers/applications)，点击 **New Application**。
2. 在 **Bot** 选项卡下，点击 **Add Bot**。复制 **Bot Token**，后面配置时会用到。
3. 在 **Privileged Gateway Intents** 下，启用 **Message Content Intent**（Bot 读取消息文本必须开启）。
4. 在 **OAuth2 → URL Generator** 下，选择 `bot` scope 和以下权限：
   - **Read Messages/View Channels**
   - **Send Messages**
   - **Read Message History**
5. 复制生成的 URL，在浏览器中打开，将 Bot 邀请进你的服务器。

## 配置 golem.yaml

```yaml
name: my-assistant       # 必须和下面的 botName 保持一致，才能正确检测 @mention
engine: claude-code

channels:
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
    botName: my-assistant  # 与上面的 name 字段保持一致
```

运行前设置环境变量：

```bash
export DISCORD_BOT_TOKEN=your-token-here
golembot gateway
```

### `botName` 字段

**服务器频道中的 @mention 检测需要 `botName`**。Discord 的消息内容中用内部用户 ID（`<@12345678>`）而非名字来标记 @mention。适配器会将这些 token 替换为 `@botName`，从而使 GolemBot 的 mention 检测正常工作。

将 `botName` 设置为与 `golem.yaml` 中 `name` 字段相同的值。

不设置 `botName` 时，Bot 在私信中仍然正常工作（始终响应），群组中使用 `groupPolicy: always` 也没有问题，但 `mention-only` 和 `smart` 策略无法识别 @mention。

## 工作方式

| 聊天类型 | 行为 |
|---------|------|
| 私信（DM） | 始终响应 |
| 服务器频道 @mention（`@YourBot 消息`） | 检测到 mention，正常回复 |
| 服务器频道普通消息（未 @mention） | 取决于 `groupPolicy`（默认：忽略） |

每个私信会话和每个服务器频道分别维护独立的会话上下文。

## 消息限制

Discord 单条消息上限为 **2,000 字符**。超出时 GolemBot 自动拆分为多条发送。

## 群聊行为

Discord 服务器频道被视为**群聊**。通过 `golem.yaml` 中的 `groupChat` 字段配置响应策略：

```yaml
groupChat:
  groupPolicy: mention-only  # mention-only（默认）| smart | always
  historyLimit: 20
  maxTurns: 10
```

详见[通道概览](/zh/channels/overview#群聊行为)。
