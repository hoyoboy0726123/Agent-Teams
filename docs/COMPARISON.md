# Agent Teams vs. Teamily AI — 功能差異深度分析

Teamily AI 是閉源的「Human + AI」社交／協作平台（[官網](https://teamily.ai/)、[Forbes 報導](https://www.forbes.com/sites/charliefink/2026/03/06/teamily-ai-brings-agent-teams-to-human-teams/)、[AI Agents Directory](https://aiagentsdirectory.com/agent/teamily-ai)、[App Store](https://apps.apple.com/us/app/teamily-ai-human-ai-team/id6761445638)）。以下根據公開資料與 App 畫面（智能體庫、智能體團隊、自動化範本、網頁產出卡片、Open Studio、回饋與收藏、底部導覽「聊天／智能體／發現／記憶／成果」）逐項比對。

> Teamily 欄位只根據公開資訊整理；標「未公開」不代表對方沒有，只是無法驗證。

## 1. 總覽

| 面向 | Teamily AI | Agent Teams | 結論 |
|---|---|---|---|
| 授權 / 部署 | 閉源 SaaS（Web、iOS、Android、Windows） | **MIT 開源、自架**（Node.js 或 Docker），SQLite 單檔 | 我方：資料主權、可稽核 |
| 價格 | 免費版 + 付費 $7/人/月起 | 免費；只付你選的模型費用，或用既有訂閱／本機模型 | 我方 |
| 模型 | 未公開（平台代管） | 每個 Agent 自選：**Claude / ChatGPT / Gemini 訂閱**、Anthropic、OpenAI、Gemini、OpenRouter、DeepSeek、Groq、Mistral、xAI、Qwen、Kimi、Together、**Ollama**、LM Studio、任何 OpenAI 相容端點 | 我方 |
| 手機 | 原生 App | 響應式網頁（可加到主畫面） | Teamily |

## 2. 智能體（Agents）

| 功能 | Teamily AI | Agent Teams |
|---|---|---|
| 預設角色 | 分類角色庫（Frontend Developer、AI Engineer、Backend Architect、DevOps Automator、Prompt Engineer、Model QA…） | **47 個角色 × 10 類**：核心團隊、工程、產品設計、行銷內容、業務客服、數據研究、營運財務、人資法務、學習、生活；每個含對話開場建議 |
| 智能體團隊 | ✅ | ✅ **8 組一鍵團隊**（產品上市、創業、內容工作室、專家研究小組、工程、客服中心、招募、生活管家），自動建頻道與開場訊息 |
| 自建 / 客製 | ✅（AI 分身、夥伴） | ✅ 名稱、@代號、頭像、顏色、個性提示詞、模型、溫度、能力、長期記憶、MCP 工具、開場建議；內建「我的 AI 分身」 |
| 分享 / 分叉 | 公開動態可 fork 他人 Agent | ✅ Agent **匯出 / 匯入 JSON**（跨工作空間分享、fork） |
| 自我改進 | 「越用越聰明」 | ✅ 👍/👎 回饋附文字 → 寫入該 Agent 私人記憶，下次回覆自動參考；管理員可看每個 Agent 的好評率 |

## 3. 協作

| 功能 | Teamily AI | Agent Teams |
|---|---|---|
| 群組內多 Agent、@提及 | ✅ | ✅ 另有 `@all`、中文連寫（`請@writer幫忙`） |
| 自動派工 | 未公開 | ✅ LLM 路由器或關鍵字比對 + 對話黏著；「僅 @提及」與「圓桌」模式 |
| Agent 之間委派 | 平行任務 | ✅ `@隊友` 自動觸發 → 委派者**統整最終答案**；深度 / 回合上限；沒事可做的 Agent 自動 `[pass]` 不洗版 |
| 任務 | 「拆解並分派任務」自動化 | ✅ **任務看板**（待辦／進行中／完成、拖拉）、Agent 在對話中直接建立任務並指派、**交給 Agent 執行**後自動完成 |
| 人工核准 | 未公開 | ✅ Agent 要做有副作用的動作（寄信、發文、合併 PR…）時暫停，訊息內出現**核准 / 拒絕**卡片 |

## 4. 對話 → 成果（Studios）

| 功能 | Teamily AI | Agent Teams |
|---|---|---|
| 網頁、簡報、文件、Dashboard | ✅ | ✅ 另有研究報告；網頁可做互動工具（計算器、小遊戲…） |
| 翻譯 / 查看過程 | ✅ 翻譯、查看思考過程 | ✅ 一鍵翻譯任何訊息（快取）；「查看過程」顯示模型、耗時、每次工具呼叫的參數與結果、核准紀錄；語音輸入 |
| 聊天中即時預覽 | ✅ 卡片預覽 | ✅ **邊寫邊渲染**：Agent 還在輸出時卡片就即時更新（LIVE） |
| Studio | ✅ 批次留言／標註、與 AI 一起直接編輯 | ✅ **全螢幕 Studio**：桌機／平板／手機預覽、原始碼編輯、版本歷史、**批次留言（可引用片段）→「請 AI 修改」一次處理並自動結案**、公開分享連結（可撤銷） |
| 匯出 | 未公開 | ✅ Markdown、HTML、**可編輯 PPTX**（Dashboard 為原生 PowerPoint 圖表）、簡報列印 PDF |
| 影片 | ✅ | ⏳ 目前提供影片腳本／分鏡（影片生成在 Roadmap） |
| 成果集中頁 | 「成果」分頁 | ✅ **成果畫廊**（即時縮圖、依類型篩選）＋ **收藏**（訊息與產出物） |

## 5. 自動化

| 功能 | Teamily AI | Agent Teams |
|---|---|---|
| 範本 | 會議提醒＋準備、每日工作簡報、競品監控、專家小組研究、製作簡報/報告、建立網頁/工具、拆解並分派任務、以我的口吻回覆…（工作 / 生活） | ✅ **16 個範本**：上述全部＋每週回顧、每週 KPI 報告；生活類：每日新聞、健身計畫、每週菜單、每日學習、旅行規劃、每月理財 |
| 排程 | ✅ | ✅ 每天（可選星期）／每週／每月／固定間隔／cron，**依工作空間時區**，顯示下 3 次執行時間，同一時段只觸發一次 |
| 事件觸發 | 未公開 | ✅ **Webhook**：任何系統 POST 到專屬網址即觸發（內容成為輸入） |
| 有變動才通知 | ✅（競品監控） | ✅ Agent 對照記憶，沒變化就 `[pass]` 靜默 |
| 工作區摘要 | 未公開 | ✅ `{{digest}}` / `{{digest_week}}`：跨頻道活動、逾期任務、新產出物（只含公開頻道，不洩漏私人對話） |
| 手動設定 | ✅ | ✅ 視覺化多步驟編輯器，含平行步驟與 `{{input}}` `{{prev}}` `{{stepN}}` 變數 |

## 6. 記憶

| 功能 | Teamily AI | Agent Teams |
|---|---|---|
| 全域記憶 | ✅「活的記憶」，學習偏好、口味、人際關係 | ✅ 工作空間 / 頻道 / Agent 私人 / 個人四種範圍；自動萃取重要事實；長對話滾動摘要 |
| 可見 / 可控 | 未公開 | ✅ 每條記憶的**來源、建立者、時間**；編輯、釘選、刪除、TTL 自動過期、一鍵清除；全部寫入稽核紀錄 |
| 私密性 | 未公開 | ✅ 「只有我」的記憶只在本人觸發的回覆中使用 |

## 7. 整合與工具

| 功能 | Teamily AI | Agent Teams |
|---|---|---|
| Gmail、GitHub、Slack、Notion | ✅ 寄信、發更新 | ✅ 透過 **MCP** 標準：GitHub（官方）、Slack、Notion、Gmail、Google 日曆、Linear、Sentry、PostgreSQL、SQLite、本機資料夾、瀏覽器（Playwright）、Brave、Fetch、時區；以及**任何** MCP server（stdio / HTTP / SSE）；遠端服務（Notion、Linear、Sentry、Jira／Confluence、Asana、Canva、Stripe）支援 **OAuth 一鍵登入**：彈窗授權、自動註冊用戶端、PKCE、Token 加密保存並自動更新 |
| 權限控管 | 未公開 | ✅ 每個 Agent 各自授權哪些整合；寫入類工具預設需人工核准（依 MCP `readOnlyHint` 判斷）；可設「每次都要核准」或「不需核准」；密鑰加密、介面只顯示遮罩 |
| 網路搜尋 | 未公開 | ✅ 內建 `web_search`（DuckDuckGo 免 Key，或 Tavily / Brave）＋ `web_fetch`（SSRF 防護） |
| 檔案 | 未公開 | ✅ 上傳／拖放／貼上；自動擷取 **PDF、DOCX、XLSX、PPTX**、CSV、程式碼等文字給 Agent 閱讀 |

## 8. 治理、安全、營運

| 功能 | Teamily AI | Agent Teams |
|---|---|---|
| 角色權限 | 未公開 | ✅ 擁有者／管理員／成員／訪客；私人頻道對非成員完全不可見（API 與即時推播皆過濾） |
| 稽核 | 未公開 | ✅ 登入、記憶、工具呼叫、核准、設定、產出物、分享全部入帳 |
| 用量與成本 | 未公開 | ✅ 依 Agent／模型統計呼叫數、tokens、延遲、錯誤 |
| 資料可攜 | 未公開 | ✅ 完整 JSON 匯出（不含密鑰）、「忘記我」 |
| 安全 | 未公開 | ✅ API Key AES-256-GCM 加密、產出物 CSP sandbox、CSRF 防護、Webhook／分享連結為高熵隨機 token |

## 9. 我們仍落後或尚未做的

1. **原生手機 App**：目前是響應式網頁。
2. **影片生成**：只有腳本／分鏡。
3. **公開社群動態**（瀏覽、remix 他人的 Agent）：目前以 Agent JSON 匯出匯入替代。
4. **即時多人協同編輯同一份產出物**：Studio 支援留言與版本，但非 Google Docs 式同時編輯。

## 10. 重要風險提醒

使用 Claude Pro/Max、ChatGPT Plus/Pro 等**消費版訂閱**時，本專案呼叫的是各家**官方 CLI**（不做逆向工程），憑證只留在官方 CLI 中。但各家消費版條款可能限制自動化或多人共用，請在對外使用或商業化前自行確認最新服務條款；團隊或商業場景建議改用 API Key。
