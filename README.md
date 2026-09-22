# 🤝 Agent Teams

**開源的「人類 + 多 AI Agent」團隊工作空間。** 把多個不同專長的 AI Agent 放進即時聊天頻道，和你的同事一起討論、分工、記憶，並把對話直接變成文件、研究報告、簡報、Dashboard、網站與自動化工作流程。

**Open-source, self-hosted team workspace where humans and many AI agents collaborate in real-time channels**, with shared, fully governable memory — and deliverables (docs, research, slides, dashboards, websites, workflows) produced straight from the conversation.

> 用你**已經付費的訂閱**（Claude Pro/Max、ChatGPT Plus/Pro、Google 帳號）就能驅動 Agent，也支援 10+ 家 API Key 與 **Ollama 本機模型**。資料全部存在你自己的機器上。

---

## ✨ 功能一覽

| | |
|---|---|
| 💬 **即時團隊頻道** | 頻道、私人頻道、與 Agent 1 對 1 私訊；WebSocket 串流、正在輸入提示、線上狀態、未讀標記、全文搜尋 (Ctrl+K) |
| 🤖 **多 Agent 協作** | `@提及` 指定、**自動派工**（LLM 路由或關鍵字比對 + 對話黏著）、**圓桌討論**（所有 Agent 依序發言）、`@all` |
| 🧭 **Agent 互相委派** | Agent 回覆中 `@隊友` 會自動觸發隊友接手；委派者最後**統整成最終答案**；有深度與回合上限防止無限迴圈 |
| 🧠 **可治理的持續記憶** | 四種範圍（工作空間 / 頻道 / Agent 私人筆記 / 只有我）、釘選、編輯、刪除、保留天數 (TTL)、一鍵清除範圍、**來源可追溯**（哪個 Agent/人、哪則訊息）、稽核紀錄 |
| ♾️ **無限上下文** | 最近 N 則訊息原文 + 較早對話自動**滾動摘要** + 相關記憶以 BM25 檢索（支援中文雙字切分）注入 |
| 📄 **對話 → 產出物** | 文件、研究報告、簡報（鍵盤翻頁、講者備註、匯出 PDF）、Dashboard（KPI + 長條/折線/圓餅圖 + 表格）、網站（單檔 HTML）；**版本控制**、人工編輯、下載 |
| ⚡ **多 Agent 工作流程** | 視覺化步驟編輯、平行步驟、`{{input}}` `{{prev}}` `{{stepN}}` 變數、**排程**自動執行、執行紀錄；內建 4 個範本（深度研究、簡報、KPI 儀表板、產品網站） |
| 🔧 **Agent 工具** | 讀取網頁（含 SSRF 防護）、搜尋記憶、讀取產出物、精確計算；**與模型無關的協定**，連 Ollama 小模型、CLI 訂閱都能用 |
| 🔐 **權限與安全** | 擁有者/管理員/成員/訪客角色、私人頻道、API Key **AES-256-GCM 加密**且永不回傳前端、產出物在 **CSP sandbox** 中渲染、CSRF 防護、稽核紀錄、用量統計 |
| 📦 **資料主權** | SQLite 單檔、完整 JSON 匯出、「忘記我」刪除個人記憶與訊息；自架、可離線 |
| 🌏 **介面** | 繁體中文 / English、亮色 / 暗色、手機版 RWD |

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
npm test      # 23 個整合 + 單元測試（使用離線 demo 與腳本化供應商，不需任何 API Key）
```

專案結構與設計見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；與 Teamily AI 的比較見 [docs/COMPARISON.md](docs/COMPARISON.md)。

## 🗺️ Roadmap

- [ ] MCP 伺服器支援（讓 Agent 使用 Gmail、GitHub、Slack、Notion 等外部工具）
- [ ] 向量嵌入記憶（可選，搭配現有 BM25 混合檢索）
- [ ] 檔案上傳（PDF / 圖片）與多模態
- [ ] 討論串（threads）與表情回應
- [ ] Slack / Discord / Telegram 橋接
- [ ] SSO (OIDC)

## License

MIT
