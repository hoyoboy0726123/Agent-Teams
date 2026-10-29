# 實測紀錄 v0.2：用 Claude 訂閱測試新功能

全部由 Agent Teams **實際執行**（Claude 訂閱帳號，透過 Claude Code CLI），未經人工修改。

## 1. 像 Teamily 一樣：在對話中建立網頁並即時預覽

私訊「🩺 健康助理」（從智能體庫一鍵加入）：

> 建立一個 HTML 網頁：產後 4 週新手健身計畫（在家、每次 20 分鐘、無器材），要漂亮、適合手機，並包含產後安全提醒。

| 畫面 | 說明 |
|---|---|
| [01](01-health-dm-starters.png) | 空白對話顯示 Agent 的開場建議 |
| [02](02-live-drafting.png) | **LIVE**：Agent 還在寫，卡片就開始即時渲染 |
| [03](03-deliverable.png) | 完成的網頁卡片＋可點選的後續建議＋產生時間 1m58s |
| [04](04-studio.png) / [05](05-studio-mobile.png) | Studio：桌機／手機預覽、請 AI 修改、留言 |
| [08](08-outputs-gallery.png) | 成果畫廊 |

> 實測中發現：Agent 產生的網頁會用 localStorage 記錄勾選進度，但預覽的 sandbox 會封鎖它 → 已加入安全的記憶體替代方案，修正後課表正常顯示（05 為修正後畫面）。

## 2. MCP 外部整合＋人工核准

以「Files (local folder)」預設連接 `team-docs` 資料夾（官方 `@modelcontextprotocol/server-filesystem`），授權給 🧭 專案統籌：

> @lead 請讀取 team_docs 資料夾裡的會議紀錄和使用者回饋，整理出本週重點與待辦，然後把整理結果寫成 summary.md 存回同一個資料夾。

1. Agent 自行呼叫 `list_allowed_directories` → `list_directory` → `read_multiple_files`（唯讀，直接執行）
2. 要呼叫 `write_file` 時**暫停**，訊息中出現 🔐 核准卡片（[06](06-approval-request.png)）
3. 按「核准」後才寫入，並回報結果（[07](07-after-approval.png)）→ 產出的檔案：[summary.md](summary.md)
