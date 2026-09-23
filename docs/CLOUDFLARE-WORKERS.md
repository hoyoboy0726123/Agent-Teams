# 評估：把 Agent Teams 部署到 Cloudflare Workers（BYOK 版）

> 這份文件只做評估，還沒有動工。它的依據是 2026 年 9 月這個 repo 的程式碼，以及撰寫當時對 Cloudflare 平台的理解。平台的限制和價格常常變動，動工前請再核對 Cloudflare 官方文件。

## 結論

**可以做，而且很適合做成「多人雲端版」。** 做法是**每個工作空間對應一個 Durable Object**，不要把整個後端改寫成 D1 + 無狀態 Worker。原因有兩個：

- 我們的後端是「單一行程 + 同步 SQLite + 行程內事件匯流排 + WebSocket」。Durable Object 剛好提供同樣的東西：單執行緒、同步 SQLite API（`ctx.storage.sql`）、內建 WebSocket（Hibernation）和 Alarm 排程。
- 所以大部分業務邏輯（Agent 編排、記憶、產出物、合併、Yjs 協作、自動化）可以原樣保留，只需要換掉「平台層」。

拿掉 Claude/Codex 訂閱登入後，這個版本會變成純 **BYOK**：Anthropic、OpenAI、Gemini、OpenRouter、DeepSeek、Groq、Mistral、xAI 等 API Key。另外可以加入 **Workers AI**，讓使用者不用任何 Key 也能試用。這樣的安排在服務條款上也比共用消費版訂閱乾淨。

主要代價：

1. 本機類的功能要拿掉或改路線：CLI 訂閱、stdio MCP、本機 Ollama／LM Studio。
2. **MP4 匯出**需要 ffmpeg 和 Chromium，Workers 本身跑不了，要另外接 Cloudflare Containers。
3. 需要一層「平台抽象」重構，避免分支和主線分叉太多。

## 逐項對照

| 元件 | 現在（Node 自架） | Workers 版 | 難度 |
|---|---|---|---|
| HTTP 伺服器 | `node:http` + 自製 router | Worker `fetch` 轉送到工作空間的 DO；router 可沿用 | 低 |
| 前端 `web/` | Node 靜態檔 + gzip | **Workers Static Assets**（CDN、自動壓縮） | 低 |
| 資料庫 | `node:sqlite`（同步 API） | **Durable Object SQLite**（同步的 `sql.exec`），把 `db.js` 的 `all/get/run/tx` 換成 adapter 即可；單一 DO 容量上限約 10 GB | 中 |
| 即時推播 | `ws` + 行程內 `EventEmitter` | DO **WebSocket Hibernation**；事件匯流排留在 DO 內不用改 | 中 |
| 即時共同編輯（Yjs） | `server/collab.js` | 原樣放進 DO；`yjs` 是純 JS | 低 |
| 排程／自動化 | `setInterval` 掃描 | DO **Alarm**（每次算出下一個觸發時間），或 Cron Triggers | 中 |
| 核准逾時（15 分鐘） | `setTimeout` | Alarm，或讀取時再判斷是否逾時 | 低 |
| 檔案上傳、媒體、影片 | `data/` 資料夾 | **R2**（`/media/<token>` 改由 R2 提供，支援 Range） | 中 |
| 金鑰加密 | `data/secret.key` + AES-256-GCM | Workers Secret（`ENCRYPTION_KEY`）+ WebCrypto AES-GCM | 低 |
| 密碼雜湊 | `crypto.scrypt` | `nodejs_compat` 的 scrypt，或改用 WebCrypto PBKDF2（需做相容遷移） | 低 |
| LLM 供應商（API） | `fetch` + SSE | 不用改；可加 **AI Gateway** 做快取、記錄、限流 | 低 |
| **Claude Code／Codex／Gemini CLI 訂閱** | `child_process.spawn` | ❌ 拿掉（Workers 不能開子行程），BYOK 取代 | — |
| Ollama／LM Studio | `localhost` | ⚠️ 只能連到使用者自己公開的端點（例如用 Cloudflare Tunnel），預設隱藏 | — |
| 新增：Workers AI | — | ✅ 免 Key 的預設模型（Llama、Qwen 等），適合試用 | 低 |
| MCP 遠端（HTTP／SSE＋OAuth） | SDK + `fetch` | ✅ 沿用；OAuth 回呼和 Token 存在 DO | 低 |
| MCP 本機（stdio：檔案、SQLite、Playwright…） | 開子行程 | ❌ 拿掉，改推薦對應的遠端 MCP | — |
| `web_search`／`web_fetch` | `fetch` + DNS SSRF 防護 | `fetch` 可用；Workers 本來就連不到內網，防護可以簡化 | 低 |
| PDF／DOCX／XLSX 擷取 | `unpdf` + `zlib` | `unpdf` 原生支援 Workers；`zlib` 可用 `nodejs_compat` 或 `DecompressionStream` | 低 |
| PPTX 匯出 | `pptxgenjs` | 大致可行（輸出 ArrayBuffer），需要實測記憶體用量 | 中 |
| **影片 MP4 匯出** | Chromium 逐格錄製 + ffmpeg | ❌ Worker 內不能跑。選項：①**Cloudflare Containers** 跑現有匯出程式（最省工）；②Browser Rendering 截圖加上外部轉檔；③先停用匯出，只保留線上播放器 | 高 |
| 旁白 TTS、Sora／Veo | `fetch` | ✅ 沿用；成品存到 R2 | 低 |

## 平台限制與風險

1. **Agent 連鎖會跑很久**（實測工程小組 18 分鐘、20 則回覆）。這段時間大多在等 LLM 串流，屬於 I/O，不太吃 CPU 時間；但要確認 Durable Object 在長時間背景工作下不會被回收。建議把「一輪 Agent 回覆」包成可恢復的步驟，交給 **Workflows** 或 Queue 執行，進度寫回 DO。這是整個移植最需要先做實驗驗證的點。
2. **CPU 時間**：單次事件預設有 CPU 上限，付費方案可以調高。BM25 記憶搜尋、三方合併、Yjs 同步的 CPU 用量都很小；PPTX 生成、大型 PDF 解析需要實測。
3. **記憶體**：每個 isolate 約 128 MB。大型附件和大量 Yjs 房間要控制大小，例如附件擷取文字時設上限。
4. **暴露在公網**：自架版多半在內網，雲端版要多做防護：
   - 登入用 Turnstile 防機器人，並加上速率限制
   - 可選 Cloudflare Access 做 SSO
   - Webhook 和分享連結原本就是高熵 token，不用改
5. **資料所在地與隱私**：資料會放在 Cloudflare。Durable Object 可以指定地區（jurisdiction），但要在 README 說清楚，這和「完全自架」的定位不同。
6. **成本**：Workers 付費方案每月 5 美元起，另外依用量計算 DO 請求與時長、儲存、R2 容量。小團隊的平台費用大約每月 5～15 美元；LLM 費用由使用者自己的 Key 支付。影片匯出若用 Containers，會另外依執行時間計費。

## 建議做法（若要動工）

**第 0 步：先在主線做平台抽象，不直接分叉**

- 把 `db`、檔案儲存、即時推播、排程、子行程這幾個地方抽成介面，提供 Node 和 Workers 兩套實作。
- Node 版的行為和測試完全不變，這樣兩個版本才能長期同步維護。

**第 1 步：Workers MVP（新分支，例如 `cloudflare-workers`）**

- 架構：`wrangler.toml` 設定 Worker、`WorkspaceDO`、R2、Static Assets，並開啟 `nodejs_compat`。
- 功能：聊天、BYOK Agent、記憶、產出物與 Studio、共同編輯、遠端 MCP（含 OAuth）、自動化（Alarm）、上傳檔案（R2）。
- 設定頁隱藏 CLI 訂閱、stdio MCP、本機模型，並加入 Workers AI。
- 用 `wrangler dev` 跑目前的整合測試。前端和 API 不變，大部分測試可以沿用。

**第 2 步：長時間任務與影片**

- Agent 連鎖改由 Workflows 執行。
- MP4 匯出改用 Containers，映像檔沿用現有的 Dockerfile（Chromium + ffmpeg + 字型）。

**第 3 步：多租戶**

- 一個工作空間對應一個 DO，天然適合開放註冊的雲端版。
- 再視需要加上方案、額度和帳單。

**工作量粗估**：

| 階段 | 範圍 | 估計 |
|---|---|---|
| 第 0 步＋第 1 步 | 大約 1,500～2,500 行改動，多數是 adapter 與設定 | 熟悉專案的工程師約 1～2 週 |
| 第 2 步 | Workflows 與 Containers | 約再 1 週 |

## 一句話建議

值得做，最適合當「免安裝、打開網址就能用」的雲端版，和自架版並存。做法上先在主線抽出平台層，再開 `cloudflare-workers` 分支，用「一個工作空間一個 Durable Object」移植；MP4 匯出留到第二階段用 Containers 處理。
