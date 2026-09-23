# 🤝 Agent Teams

**開源的「人類 + 多 AI Agent」團隊工作空間。** 把多個不同專長的 AI Agent 放進即時聊天頻道，和你的同事一起討論、分工、記憶，並把對話直接變成文件、研究報告、簡報、Dashboard、網站與自動化工作流程。

**Open-source, self-hosted team workspace where humans and many AI agents collaborate in real-time channels**, with shared, fully governable memory — and deliverables (docs, research, slides, dashboards, websites, workflows) produced straight from the conversation.

> 用你**已經付費的訂閱**（Claude Pro/Max、ChatGPT Plus/Pro、Google 帳號）就能驅動 Agent，也支援 10+ 家 API Key 與 **Ollama 本機模型**。資料全部存在你自己的機器上。

---

## ✨ 功能一覽

| | |
|---|---|
| 💬 **即時團隊頻道** | 頻道、私人頻道、與 Agent 1 對 1 私訊；串流回覆、正在輸入、線上狀態、未讀、全文搜尋 (Ctrl+K)；檔案上傳／拖放／貼上（PDF、Word、Excel、PowerPoint、CSV、程式碼會自動轉成文字給 Agent 讀） |
| 🤖 **智能體庫** | **47 個預設角色 × 10 類**（工程、產品設計、行銷內容、業務客服、數據研究、營運財務、人資法務、學習、生活…），含開場建議；自建 Agent、匯出／匯入分享 |
| 👥 **智能體團隊** | **8 組一鍵團隊**（產品上市、創業、內容工作室、專家研究小組、工程、客服、招募、生活管家），自動建頻道 |
| 🧭 **多 Agent 協作** | `@提及`、**自動派工**、**圓桌討論**、`@all`；Agent 互相 `@委派` 後由委派者**統整最終答案**；沒事可做的 Agent 自動略過不洗版 |
| ⚡ **自動化** | **16 個工作／生活範本**（每日工作簡報、會議準備、競品監控「有變動才通知」、專家小組研究、每週回顧、每日新聞、健身計畫、每週菜單…）；每天／每週／每月／間隔／cron 排程（依時區）、**Webhook 觸發**、視覺化多步驟流程 |
| 🔌 **外部整合 (MCP)** | GitHub、Slack、Notion、Gmail、Google 日曆、Linear、Sentry、Jira／Confluence、Asana、Canva、Stripe、PostgreSQL、SQLite、本機資料夾、瀏覽器、Brave 搜尋…及任何 MCP server；**OAuth 一鍵登入**（彈窗授權、自動註冊、PKCE、Token 自動更新）；每個 Agent 各自授權；**寫入類動作需人工核准** |
| 🎨 **對話 → 成果** | 網頁／互動工具、簡報、Dashboard、文件、研究報告；**Agent 邊寫、聊天裡邊即時預覽**；可編輯 **PPTX** 匯出（Dashboard 為原生圖表） |
| 🖼️ **Studio** | 全螢幕工作室：桌機／平板／手機預覽、原始碼編輯、版本歷史、**批次留言 →「請 AI 修改」一次處理**、公開分享連結（可撤銷） |
| ✅ **任務看板** | Agent 在對話中直接建立並指派任務；看板拖拉；**交給 Agent 執行**後自動完成；待核准動作集中處理 |
| 🧠 **可治理的持續記憶** | 工作空間／頻道／Agent 私人／只有我 四種範圍；自動萃取、長對話滾動摘要；來源可追溯、編輯、釘選、TTL、一鍵清除；👍👎 回饋會變成 Agent 的記憶讓它**越用越好** |
| 📦 **成果與收藏** | 成果畫廊（即時縮圖）、收藏訊息與產出物 |
| 🔐 **權限與安全** | 角色權限、私人頻道、API Key／MCP 密鑰加密、產出物 CSP sandbox、CSRF 防護、稽核紀錄、用量統計、完整匯出與「忘記我」 |
| 🌏 **介面** | 繁體中文 / English、亮色 / 暗色、手機版 RWD；訊息一鍵翻譯、查看 Agent 執行過程、語音輸入 |

## 🔌 支援的模型

| 類型 | 供應商 |
|---|---|
| **訂閱帳號（免 API Key）** | **Claude Pro/Max**（透過官方 Claude Code CLI）、**ChatGPT Plus/Pro**（透過官方 OpenAI Codex CLI）、**Google 帳號**（Gemini CLI） |
| **API Key** | Anthropic Claude、OpenAI、Google Gemini、OpenRouter（300+ 模型）、DeepSeek、Groq、Mistral、xAI Grok、Together、Qwen (DashScope)、Moonshot Kimi |
| **本機模型** | **Ollama**、LM Studio、任何 OpenAI 相容端點（vLLM、LiteLLM…） |
| **離線示範** | Demo 供應商——不需任何設定就能體驗全部功能 |

每個 Agent 可以用**不同的供應商與模型**：例如研究員用 Claude、分析師用 GPT、審稿人用本機 Llama——同一個頻道裡混合協作。

> 訂閱帳號模式是呼叫你電腦上**官方 CLI**（`claude` / `codex` / `gemini`），登入憑證只留在官方 CLI 裡，本程式不會讀取或保存。請遵守各家服務條款。

## 🚀 快速開始

需求：**Node.js 22.9+**（使用內建 `node:sqlite`，不需編譯任何原生套件）。

```bash
git clone https://github.com/hoyoboy0726123/agent-teams.git
cd agent-teams
npm install
npm start
# 開啟 http://127.0.0.1:3789
```

第一次開啟會請你建立擁有者帳號。系統會**自動偵測**：

- 已安裝並登入的 `claude`（Claude 訂閱）、`codex`（ChatGPT 訂閱）、`gemini` CLI
- 環境變數中的 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`GEMINI_API_KEY`、`OPENROUTER_API_KEY`、`DEEPSEEK_API_KEY`、`GROQ_API_KEY`、`MISTRAL_API_KEY`、`XAI_API_KEY`
- 本機執行中的 Ollama (`localhost:11434`)

並自動建立一支 6 人的 AI 團隊（專案統籌、研究員、撰稿人、設計師、資料分析師、審稿人）和 `#general`、`#research-lab` 兩個頻道。

### 使用訂閱帳號

```bash
# Claude Pro / Max
npm i -g @anthropic-ai/claude-code && claude      # 登入一次

# ChatGPT Plus / Pro
npm i -g @openai/codex && codex login

# Google 帳號
npm i -g @google/gemini-cli && gemini              # 登入一次
```

然後到 **設定 → 模型供應商** 新增（或重新啟動讓它自動偵測）。

### 使用 Ollama

```bash
ollama pull qwen2.5      # 或 llama3.1、gemma3…
```

設定 → 模型供應商 → Ollama，預設模型填 `qwen2.5`。

### Docker

```bash
docker compose up -d
```

> 容器內無法使用你主機上的 CLI 訂閱登入；Docker 版請使用 API Key 或 Ollama（`http://host.docker.internal:11434`）。

## 💡 使用範例

```
@lead 幫我規劃下個月的新產品發表會
```
→ 專案統籌拆解任務並 `@researcher`、`@analyst`、`@designer` 分工 → 隊友各自回覆 → 專案統籌統整最終計畫。

```
@analyst 做一個 KPI Dashboard：MAU 12k (+8%)、流失率 3.1%、NPS 46，近 6 週註冊數 120,150,170,160,210,260
@designer 根據上面的討論做 8 頁簡報
@researcher 讀一下 https://example.com/report 並整理重點
@all 這個方案有什麼風險？
請記住：我們的目標客群是 25–35 歲的上班族
```

## ⚙️ 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | `3789` | HTTP 埠 |
| `HOST` | `127.0.0.1` | 綁定位址（要讓區網同事連線請設 `0.0.0.0`，並建議放在 HTTPS 反向代理後面） |
| `AGENT_TEAMS_DATA` | `./data` | 資料夾（SQLite 資料庫與加密金鑰） |
| `AGENT_TEAMS_SECRET` | — | 自訂加密主金鑰（否則自動產生 `data/secret.key`） |
| `CONTEXT_MESSAGES` | `30` | 每次給 Agent 的最近訊息數（更早的會被摘要） |
| `MAX_HANDOFF_DEPTH` | `4` | Agent 互相委派的最大深度 |
| `ALLOW_PRIVATE_FETCH` | — | 設 `1` 允許 `web_fetch` 讀取內網位址（預設封鎖） |

## 🧪 開發

```bash
npm run dev   # 檔案變更自動重啟
npm test      # 40+ 個整合 + 單元測試（離線 demo、腳本化供應商與真實 MCP server，不需任何 API Key）
```

實際用 Claude 訂閱跑一場上市策略會議並產出 PPT／Dashboard 的完整紀錄見 [examples/launch-strategy](examples/launch-strategy/)。

另有 **7 種不同類型專案**（上市、專家圓桌、資料分析、工程、自動化、生活、Studio）的實跑紀錄、產出物與觀察，見 [examples/showcase](examples/showcase/)。

專案結構與設計見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；與 Teamily AI 的比較見 [docs/COMPARISON.md](docs/COMPARISON.md)。

## 🗺️ Roadmap

- [x] MCP 外部整合（GitHub、Slack、Notion、Gmail、日曆…）與人工核准
- [x] 自動化排程、Webhook 與範本
- [x] Studio、即時預覽、批次留言修訂、分享連結
- [x] 檔案上傳（PDF / Office / 文字）
- [x] MCP OAuth 一鍵登入
- [ ] 向量嵌入記憶（與現有 BM25 混合檢索）
- [ ] 圖片理解（多模態）、語音輸入
- [ ] 討論串（threads）與表情回應
- [ ] Slack / Discord / Telegram 橋接、PWA 推播通知
- [ ] SSO (OIDC)

## License

MIT
