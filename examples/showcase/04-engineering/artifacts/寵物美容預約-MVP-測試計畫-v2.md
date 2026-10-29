# 寵物美容店線上預約 MVP — 測試計畫 v0.2

> 更新依據：@backend 錯誤回應格式定案、@frontend「顧客端預約流程」網站上線、@security 針對前端的 XSS/PII 存放 review
> 狀態：可依此版本開始撰寫自動化腳本；待 #4 店家端頁面出來後補 3.4 的 E2E 案例

## 1. 測試範圍（不變）
同 v0.1，見前版。

## 2. 測試策略（不變）
同 v0.1，見前版。

## 3. 核心功能測試案例（依錯誤格式定案更新）

### 3.1 建立預約 `POST /api/appointments`（更新回傳格式對照）

| # | 案例 | 預期結果 |
|---|---|---|
| TC-01 | 正常填寫送出 | 201，回傳資源本體，`status=pending` |
| TC-02 | 已達容量上限時段 | 409，`error.code=SLOT_CONFLICT` |
| TC-03 | 缺必填欄位 | 400，`error.code=VALIDATION_ERROR`，`fields[]` 含對應 dot path（如 `customer.name`） |
| TC-04 | 電話格式錯誤 | 400，`fields: [{field:"customer.phone", message:...}]` |
| TC-05 | service_id 不存在/已下架 | 400 或 404（需與 @backend 確認實際回哪個 code） |
| TC-06/07 | 過去日期／超出可預約範圍 | 400 VALIDATION_ERROR |
| TC-08 | pet.notes 200字上限/HTML/script | 後端長度限制 + escape；**前端渲染需驗證用 textContent 非 innerHTML**（見 3.6 新增 XSS 案例） |
| TC-09 | 時段邊界（結束=下一筆開始） | 視為不重疊，可預約 |
| TC-10 | 超出營業時間 | 拒絕，400 |
| TC-新增 | 短時間內對同一 IP/表單重複送出多筆 | 429，`error.code=RATE_LIMITED`，`retryAfterSeconds` 存在且前端顯示對應等待提示 |

### 3.3 查詢/取消（更新為 404，不是 401）

| # | 案例 | 預期結果 |
|---|---|---|
| TC-13 | 正確 ID+電話 | 200 |
| TC-14 | 正確 ID+錯誤電話 | **404 `NOT_FOUND`**，訊息「查無此預約，請確認電話與預約編號」 |
| TC-15 | 錯誤/不存在 ID | 同上，訊息與 TC-14 完全一致（逐字比對，防列舉） |
| TC-16 | 短時間多次嘗試 | 429 RATE_LIMITED，`retryAfterSeconds` |
| TC-17/18 | 取消已完成/重複取消 | 明確錯誤 code，不可產生異常狀態 |
| TC-新增 | `lookupId` 輸入非 UUID 格式（如純文字、SQL payload） | 前端可提前擋格式（非阻塞項）；後端仍應安全回 404，不可 500 或洩漏堆疊 |

### 3.6 前端安全案例（新增，依 @security review）

| # | 案例 | 預期結果 |
|---|---|---|
| TC-28 | `petNotes`/`petName`/`customerName` 填入 `<img src=x onerror=alert(1)>` 等 payload，走完整流程到「確認頁」「成功頁」「查詢結果頁」 | 畫面顯示為純文字（escape 後的字元），**不執行 script**；需確認 `confirmSummary`/`successSummary`/`lookupResultSummary` 是用 DOM API/`textContent` 而非 `innerHTML` 字串拼接 — **待 @frontend 確認渲染方式後才能關閉此案例** |
| TC-29 | DEMO_MODE 下完成一筆預約，關閉分頁重開/檢查 DevTools Application 面板 | 客人 PII（姓名/電話/寵物資料）**不應殘留在 localStorage**；若目前是 localStorage，需改 sessionStorage 或記憶體變數，並在「再預約一筆」/離開頁面時主動清空 |
| TC-30 | DEMO_MODE 下同裝置换人操作（共用裝置情境） | 前一位客人的預約資料不可被下一位看到（呼應 TC-29） |

> TC-28、TC-29 目前狀態：**Blocked，待 @frontend 回覆確認**（@security 已詢問，尚未收到明確答覆）。若確認為安全做法則轉為「已驗證」，否則列為 Must-fix bug 並卡 Go/No-Go。

## 4. 非功能測試（不變，見 v0.1）

## 5. Go / No-Go 上線標準（更新）

- [ ] P0 案例（TC-01, 02, 11, 12, 13-16, 26, **28**）100% 通過
- [ ] **TC-28（XSS 渲染方式）與 TC-29（PII 存放）明確驗證通過**，未確認前視為 Blocker
- [ ] 無 Critical/High 安全問題未修復（對照 @security #6 完整 checklist）
- [ ] 併發測試無超賣
- [ ] 錯誤回應 `error.code` 全數符合 @backend 定案格式（400/404/409/429/500）
- [ ] Rollback 演練成功
- [ ] 客人端手機瀏覽器主流程可用性驗證通過

## 6. 待確認/依賴（更新）

1. **@frontend**：TC-28 渲染方式（textContent vs innerHTML）與 TC-29 storage 方案，回覆後我更新測項狀態並開始執行
2. @backend：TC-05 的實際 status code（400 或 404）、狀態機允許轉換路徑（TC-21）、營業時間規則（TC-07/10）
3. @security：#6 完整 checklist 出來後補對照表
4. 是否有簡訊 OTP 計畫？影響 TC-16 後續驗證流程