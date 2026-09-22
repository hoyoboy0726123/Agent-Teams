# Agent Teams vs. Teamily AI

Teamily AI 是一個閉源的「Human + AI」即時通訊平台（公開資訊：[官網](https://teamily.ai/)、[Business Wire 發表稿](https://www.businesswire.com/news/home/20260708584390/en/Teamily-AI-Publicly-Launches-HumanAI-Social-Platform-to-Make-Building-and-Growing-a-Company-Easy-for-Every-Team)、[Forbes 報導](https://www.forbes.com/sites/charliefink/2026/03/06/teamily-ai-brings-agent-teams-to-human-teams/)）。它主打：多個 Agent 作為群組成員、共享上下文與全域記憶、把對話變成網頁/簡報/文件/Dashboard，以及外部整合。

Agent Teams 以同樣的核心概念為目標，並針對「導入前必須實測的資料治理與權限風險」做成**看得到、可驗證、可控制**的功能。

> 以下 Teamily AI 欄位僅根據其公開行銷資料整理；未公開的項目標示為「未公開」，並非代表不存在。

| 面向 | Teamily AI（公開資訊） | Agent Teams |
|---|---|---|
| 授權 / 原始碼 | 閉源 SaaS | **MIT 開源**，可稽核每一行 |
| 部署 / 資料位置 | 廠商雲端 | **自架**（本機、公司內網、Docker），SQLite 單檔 |
| 多 Agent 進群組、@提及 | ✅ | ✅ 另有自動派工、圓桌、`@all` |
| Agent 之間互相委派 | 平行執行任務 | ✅ `@隊友` 自動觸發 + **委派者統整**，有深度/回合上限 |
| 模型選擇 | 未公開 | **每個 Agent 各自選**：Claude / GPT / Gemini / DeepSeek / Grok / Qwen / Kimi / Mistral / Groq / OpenRouter / Ollama / LM Studio… |
| 使用既有訂閱 | 未公開 | ✅ **Claude Pro/Max、ChatGPT Plus/Pro、Google 帳號**（官方 CLI） |
| 本機 / 離線模型 | 未公開 | ✅ Ollama、LM Studio、OpenAI 相容端點 |
| 持續記憶 | 全域記憶 | ✅ 四種**範圍**、來源追溯、釘選、TTL 自動過期 |
| 記憶檢視 / 修改 / 刪除 | 未公開 | ✅ 側欄完整 CRUD、一鍵清除範圍、「忘記我」 |
| 長對話上下文 | 共享上下文 | ✅ 滾動摘要 + 記憶檢索 + 最近訊息原文 |
| 對話 → 文件/簡報/Dashboard/網站 | ✅ Studios | ✅ 且有**版本歷史**、人工編輯、下載、CSP 沙盒渲染 |
| 工作流程 | 未公開細節 | ✅ 多步驟、平行步驟、變數、**排程**、執行紀錄 |
| 權限隔離 | 未公開 | ✅ 角色（擁有者/管理員/成員/訪客）、私人頻道、個人記憶僅本人可見、即時事件依權限過濾 |
| 稽核 | 未公開 | ✅ 記憶、工具呼叫、設定、產出物、登入全部入帳 |
| 成本 / 效能可視化 | 未公開 | ✅ 依 Agent / 模型統計呼叫數、tokens、延遲、錯誤 |
| 資料可攜 | 未公開 | ✅ 完整 JSON 匯出（不含 API Key） |
| 外部整合（Gmail、GitHub、Slack） | ✅ | ⏳ Roadmap（MCP）；目前提供 `web_fetch` 工具 |
| 手機 App | ✅ iOS / Android | 響應式網頁（可加到主畫面） |
| 價格 | 未公開 / 訂閱制 | 免費；只付你自己選的模型費用（或用既有訂閱、本機模型 $0） |

## 為什麼治理功能是重點

導入前最常被問的問題，在 Agent Teams 都可以直接在介面上驗證：

1. **Agent 記住了什麼？** → 🧠 記憶面板列出每一條、範圍、是誰在何時從哪則訊息存的。
2. **能刪掉嗎？** → 單筆刪除、整個範圍清除、設定保留天數、「忘記我」；刪除動作寫入稽核紀錄。
3. **誰看得到？** → 私人頻道對非成員完全不可見（API 與即時推播都過濾）；個人記憶只有本人與其觸發的 Agent 回覆會用到。
4. **資料送去哪裡？** → 只送到你為該 Agent 選的模型供應商；選 Ollama 就完全不出你的電腦。
5. **Agent 做了什麼動作？** → 每次工具呼叫（例如讀取哪個網址）都在訊息上顯示並寫入稽核紀錄。
