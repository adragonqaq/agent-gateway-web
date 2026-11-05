# Agent Gateway Web

多租户 ReAct Agent 网关的**对话台**前端：空态居中大输入（Perplexity 式）→ 首条消息后切会话流（ChatGPT/DeepSeek 式）。

设计说明见 sibling：[`../agent-gateway/docs/specs/2026-11-05-chat-console-design.md`](../agent-gateway/docs/specs/2026-11-05-chat-console-design.md)

## 本地启动

```bash
# 终端 1：gateway（echo / h2 即可冒烟）
cd ../agent-gateway
mvn -DskipTests install
mvn -pl bootstrap spring-boot:run -Dspring-boot.run.profiles=h2

# 终端 2：前端
cd ../agent-gateway-web
npm install
npm run dev
# 打开 http://localhost:5173
```

左侧粘贴 RUNTIME API Key（用 ADMIN Key 在 gateway 签发）。  
默认经 Vite 代理访问 `127.0.0.1:8080`；也可填 Base URL 直连（gateway 已开 CORS）。

## 能力

- SSE：`meta` / `thinking` / `tool` / `confirm` / `answer` / `error`
- 确认卡：批准 / 拒绝 → `/v1/confirms/{id}/approve|deny`
- 停止：`/v1/runs/{taskId}/cancel`
- 会话列表与 Key 存 `localStorage`

## 技术

React 18 + TypeScript + Vite。视觉：纸白底 + 青石强调 `#0F766E`，字体 Sora / Source Sans 3 / IBM Plex Mono。
