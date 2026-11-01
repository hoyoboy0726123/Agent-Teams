# 實戰範例：用 Claude 訂閱開一場 AI 團隊會議

這個資料夾是 Agent Teams **實際執行**的成果，不是示意圖：6 位 Agent 全部透過 **Claude 訂閱帳號（Claude Code CLI，無 API Key）** 回覆，內容未經人工修改。

**議題：**「Agent Teams 開源版」的上市策略

## 流程

1. 👤 Hoyo：`@lead` 主持上市策略討論，請 `@researcher` 分析目標用戶與競品、`@critic` 挑風險
2. 🧭 Lead 拆解任務並委派 → 🔎 Researcher 發布研究報告 → 🧐 Critic 排出風險 → ✍️ Writer 提出文件方案 → 🧭 Lead **統整成上市計畫 v0.1**
3. 第二輪：Critic 指出「驗證路徑卡住但沒人改派」→ Lead 拍板 v0.2
4. 👤 Hoyo：`@analyst` 做 Dashboard → 📊 Analyst 用 `calc` 工具核對數字後發布 Dashboard
5. 👤 Hoyo：`@designer` 做 10 頁簡報 → 🎨 Designer 發布簡報（含講者備註）

完整對話：[討論逐字稿.md](討論逐字稿.md)

## 成品

| 檔案 | 說明 |
|---|---|
| [上市策略簡報.pptx](上市策略簡報.pptx) | 10 頁 PowerPoint，含講者備註，可直接編輯 |
| [上市規劃Dashboard.pptx](上市規劃Dashboard.pptx) | KPI + **原生 PowerPoint 圖表**（可點開改數字）+ 里程碑表 |
| [artifacts/](artifacts/) | Agent 產出的原始內容（研究報告、上市計畫、簡報 Markdown、Dashboard JSON） |
| [pptx-preview/](pptx-preview/) | 以 LibreOffice 轉出的 PPT 每頁預覽圖 |
| [screenshots/](screenshots/) | App 內的討論、產出物預覽、記憶面板截圖 |

> ⚠️ Dashboard 與簡報內的數字皆為 Agent 標註的**規劃假設**；研究員因執行環境網路限制無法上網查證，已在內容中註明「未驗證」。
