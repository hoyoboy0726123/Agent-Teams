# 寵物美容預約 MVP 測試計畫 v3

## 變更紀錄
- v3：因應 @security 對 `GET .../:id?phone=` 與 `DELETE` body 洩漏風險的建議，新增/標記查詢取消相關案例為 **Pending API 決策**；新增 Rate-limit 鎖定機制濫用（他人代為觸發鎖定）安全測試案例；新增 Admin 授權設計待補測試佔位。

## 狀態總覽

| 分類 | 案例數 | Pass | Blocker | Pending 決策 |
|---|---|---|---|---|
| 客人端預約流程 | 12 | 12 | 0 | 0 |
| 查詢/取消預約 | 6 | 4 | 0 | 2 |
| 錯誤處理與驗證 | 8 | 8 | 0 | 0 |
| 安全/濫用情境 | 6 | 3 | 0 | 3 |
| Admin 端 | 4 | 0 | 0 | 4（等 #6 授權設計）|

---

## 一、客人端預約流程（TC-01 ~ TC-12）—— PASS，v2 頁面已驗證
（沿用 v2，含步驟精靈、表單驗證、409 衝突自動導回選時段、RWD、無障礙）
- 涵蓋：服務選擇、時段可用性顯示、寵物資料表單（species/size/notes 200 字限制）、確認頁摘要正確性、成功頁顯示、鍵盤導覽、螢幕閱讀器 aria-live 錯誤摘要。

## 二、查詢/取消預約（TC-13 ~ TC-18）

| ID | 案例 | 狀態 |
|---|---|---|
| TC-13 | 正確手機號+ID → 查得預約 | ✅ Pass（v2 前端） |
| TC-14 | 手機號正確、ID 錯誤 → 統一錯誤訊息 | ✅ Pass |
| TC-15 | 手機號錯誤、ID 正確 → 同一統一錯誤訊息（不可分辨） | ✅ Pass |
| TC-16 | 正常取消流程 | ✅ Pass（前端模擬） |
| TC-17 | **API 定案後**：驗證改為 `POST /:id/lookup`（若採用），phone 不得出現於 URL/access log | ⏳ Pending（等 @backend 確認採用選項 A/B） |
| TC-18 | **API 定案後**：`DELETE` 改 `POST /:id/cancel`（若採用），驗證各層 proxy 皆正確傳遞 phone body | ⏳ Pending（同上，且需 @devops 確認 hosting proxy 是否保留 DELETE body，若沿用 DELETE） |

## 三、錯誤處理與驗證（TC-19 ~ TC-26）—— PASS
- 400 VALIDATION_ERROR（含 `fields[]` dot path 對應逐欄錯誤）
- 409 SLOT_CONFLICT → 前端自動重新整理時段
- 404 NOT_FOUND 統一訊息
- pet.notes 超過 200 字前端擋下 + 後端 400
- XSS：confirm/success/lookup 結果頁改用 `textContent`/`createElement`，注入 `<img src=x onerror=...>` 等 payload 驗證不執行、原樣顯示為文字 ✅（TC-28 已解除 Blocker）
- Demo 模式資料改用 `sessionStorage`，關閉分頁後驗證資料清除 ✅（TC-29 已解除 Blocker）

## 四、安全/濫用情境（TC-30 ~ TC-35）—— 新增

| ID | 案例 | 狀態 |
|---|---|---|
| TC-30 | `POST /appointments` 短時間灌爆 → 429 + retryAfterSeconds | ⏳ Pending（等 API 上線可測真實 rate limit） |
| TC-31 | 查詢/取消 429 觸發後文案是否誤導 | ⏳ Pending |
| TC-32 | **新增：惡意鎖定他人查詢**——攻擊者取得他人 appointment ID（如分享連結流出），故意連續填錯手機號 5 次，驗證合法客人是否被連坐鎖定 | ⏳ Pending（需確認鎖定 key 是否為 IP+ID 組合，@security 已提醒風險） |
| TC-33 | SQL Injection：`pet.notes`、`customer.name` 塞入 `' OR '1'='1` 等 payload，確認 parameterized query 無異常 | ⏳ Pending API 上線 |
| TC-34 | IDOR：嘗試遍歷連續/相似 UUID 猜測他人預約 | ✅ Pass 設計面（UUID 不可預測），待 API 上線做黑盒驗證 |
| TC-35 | `lookupId` 格式異常（過長字串、特殊字元）是否被前端擋下且不影響後端統一錯誤語意 | ✅ Pass（v2 前端已加基本檢查） |

## 五、Admin 端（TC-36 ~ TC-39）—— 佔位，等 #6 授權設計

等 @security 補齊 session/JWT 儲存方式、密碼雜湊、登入失敗鎖定、多員工帳號等設計後補上：
- TC-36 登入成功/失敗流程
- TC-37 未登入存取 admin API → 401/redirect
- TC-38 session 過期處理
- TC-39 （若多店家/多員工）跨店資料隔離驗證

## Go/No-Go 標準（不變）
- 一、二、三類全部 Pass
- 四類安全案例（尤其 TC-32 鎖定濫用、TC-33 SQLi）Pass，且無 Critical/High 未修復
- 五類 Admin 案例 Pass
- 無 Blocker 等級 bug 未解決