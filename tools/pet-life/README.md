# 16億分之1 毛孩人生

寵物版的人生模擬器。按下「出生」，你會隨機投胎成世界上的一隻狗或貓，在像素場景裡過完牠的一生。結尾可以收到一封 AI 依照這一生寫成的「最後的信」，每個人只有一次。

- 預覽版（Claude Artifact，沒有 AI 信）：https://claude.ai/artifact/FhGVeR1vU2i9WPSh7y5aAz
- 正式版（Cloudflare Workers，有 AI 信）：部署後的網址是 `https://pet-life.<你的子網域>.workers.dev`

## 內容

- 26 個國家與地區，出生地依各國狗貓數量比例抽出，流浪比例也依國家而不同（皆為粗估）
- 122 種事件、15 個會暫停時間的抉擇、16 種互動。事件會依季節、節日和文化而不同，例如颱風、過年鞭炮、中秋烤肉、排燈節、聖誕節、伊斯坦堡街貓、日本地域貓、台灣校犬
- 同一輩子裡，同一段文字要等所有寫法都出現過才會重複；例行事件（健康檢查、煙火、打雷）有次數上限
- 結尾有重要時刻的像素回顧、告別場景、名字卡

## 檔案

| 路徑 | 說明 |
| --- | --- |
| `src/page.html` | 整個網頁（唯一的原始檔）。直接發布就是 Claude 預覽版 |
| `scripts/build.mjs` | 把 `src/page.html` 包成 `public/index.html`，並打開 AI 信的開關（`<meta name="pet-ai">`） |
| `public/index.html` | 產生出來的正式版網頁（有提交進 git，部署時不需要再 build） |
| `src/worker.js` | Cloudflare Worker：提供網頁、`/api/letter`，以及負責所有限制的 Durable Object `Limiter` |
| `src/letter.js` | 驗證輸入、提示詞、清理輸出、簡轉繁保險。沒有 Cloudflare 依賴，Node 可以直接測 |
| `wrangler.jsonc` | 正式設定 |
| `wrangler.local.jsonc` | 本機測試設定：不用登入 Cloudflare，信用範本代替 AI |
| `test/e2e.mjs` | 端到端測試：瀏覽器走完一生收信，以及 API 的所有限制 |
| `test/letter-gemma.mjs` | 用 Gemini API 上的 Gemma 4（和 Workers AI 同一個開源模型）試寫三封信 |

## 本機開發

```bash
cd tools/pet-life
npm install
npm run dev            # http://localhost:8787 ，信由範本產生（MOCK_AI=1），不花 neurons
PLAYWRIGHT=$(npm root -g)/playwright CHROMIUM=/path/to/chrome npm run test:e2e
GOOGLE_API_KEY=... npm run test:letter
```

改完 `src/page.html` 之後要跑 `npm run build`，再把 `public/index.html` 一起提交。

## 部署到 Cloudflare

兩種方法擇一。兩種都會自動建立 Durable Object，不需要先手動建立資料庫。

### 方法一：Workers Builds（連接 GitHub，之後每次 push 都會自動部署）

1. 打開 https://dash.cloudflare.com ，選要放的帳號
2. 進入 **Workers & Pages** → **Create application** → **Import a repository**
3. 授權 GitHub，選 `hoyoboy0726123/Agent-Teams`
4. 設定：
   - Project name：`pet-life`（必須和 `wrangler.jsonc` 的 `name` 一樣）
   - Production branch：`claude/teamily-ai-opensource-39mk0e`（或之後合併進去的分支）
   - Root directory：`tools/pet-life`
   - Build command：留空
   - Deploy command：`npx wrangler deploy`
5. 按 **Save and Deploy**

### 方法二：用 wrangler 直接部署

```bash
export CLOUDFLARE_API_TOKEN=...      # 權限見下方
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

API Token 建立方式：https://dash.cloudflare.com/profile/api-tokens → Create Token → 使用範本「Edit Cloudflare Workers」，再加上 Account → **Workers AI** → **Edit**（測試模型用）。Account Resources 只勾要部署的那個帳號。部署完可以把 Token 刪掉。

如果帳號從來沒用過 Workers，第一次部署前要先到 Workers & Pages 設定一個 `workers.dev` 子網域。

## 額度與費用

- 寫信的模型：`@cf/google/gemma-4-26b-a4b-it`；如果它忙碌或回覆不合格，改用 `@cf/qwen/qwen3-30b-a3b-fp8`
- 一封信大約 15–25 neurons（輸入約 950 tokens，輸出約 300 tokens，關閉模型的「思考」）
- Workers AI 免費額度是每天 10,000 neurons，在 00:00 UTC（台灣早上 8 點）重置
- `NEURON_BUDGET` 預設 8,000：每天用到這裡就停止寫信，頁面會顯示「今天的信紙用完了」。大約是每天 300–500 封
- Workers Free 方案超過免費額度只會報錯、不會收費；Workers Paid 方案超過才會計費。有 `NEURON_BUDGET` 擋著，兩種方案都不會超過免費額度
- Durable Object（SQLite）在免費方案每天有 100,000 次寫入額度，寫一封信只用到幾次

## 一人一封的規則

- 每個裝置只能收一封信。裝置以 cookie 辨識，瀏覽器的 localStorage 再存一份 ID 當備援。收過之後再按，只會顯示原本那封
- 同一個網路（IP）每天最多 `IP_DAILY` 封（預設 5），避免有人清掉瀏覽器資料一直重寫。手機網路常常很多人共用同一個 IP，所以不設成 1
- AI 忙碌導致寫信失敗時不算次數，可以再試
- 沒有登入系統，所以「一人」是以裝置為單位：換一支手機，或清除網站資料，就能再收一封，但仍然受每日 IP 與總量限制
- 隱私：伺服器只存信的內容、署名和隨機產生的裝置 ID。IP 只以加鹽雜湊的形式存當天的次數，隔天就刪除

## 可以調整的設定（`wrangler.jsonc` 的 `vars`）

| 名稱 | 預設 | 說明 |
| --- | --- | --- |
| `MODEL` | `@cf/google/gemma-4-26b-a4b-it` | 寫信的模型 |
| `FALLBACK_MODEL` | `@cf/qwen/qwen3-30b-a3b-fp8` | 備用模型 |
| `NEURON_BUDGET` | `8000` | 每天最多用多少 neurons |
| `NEURONS_PER_LETTER` | `25` | 預留額度時，估計一封信的用量 |
| `IP_DAILY` | `5` | 同一個網路每天最多幾封 |
