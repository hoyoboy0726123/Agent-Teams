# 範例命書：林語晴（虛構人物）

「下載命盤」付費命書的試做版。數字、表格和圖表由排盤引擎產生，文字依這張命盤的事實由 Claude 親自撰寫，示範強模型在付費後要寫出的內容與品質。人物與生日都是虛構的，可以當作付款頁的免費範例。

- 命盤：坤造，1990-06-21 12:00，臺北市（庚午 壬午 丁巳 丙午，身強，建祿格，用神水）
- 成品：`林語晴-八字命書-範例.pdf`（A4，20 頁，約 8,600 字）與 `report.html`
- 內容：給你的話、怎麼讀與回顧驗證（2021–2025）、四柱與五行、出生時間的邊界、命格、性格、事業、財運、感情、健康作息、家人人際、大運時間軸、2026–2035 逐年與十年 × 七領域熱圖、時機表、2026 年底到 2027 年逐月、行動清單、名詞小辭典與方法說明

重新產生（在 `tools/bazi-life` 底下執行）：

```bash
node samples/mingshu/facts.mjs $PWD samples/mingshu/facts.json   # 命盤、詳批、大運、流年、流月的引擎事實
node samples/mingshu/more.mjs $PWD samples/mingshu/more.json     # 時柱邊界、2021–2025、十年熱圖、2026 年底的月柱
node samples/mingshu/build-report.mjs                            # 寫出 report.html（文字寫在這個檔案裡）
PLAYWRIGHT=$(npm root -g)/playwright CHROMIUM=/path/to/chrome node samples/mingshu/render.mjs   # 轉成 PDF（字型從 Google Fonts 載入）
node samples/mingshu/selfcheck.mjs $PWD samples/mingshu/report.html   # 用 AI 解讀的校對程式檢查全文
```

`selfcheck.mjs` 用網站自己的校對程式（`contentProblems`）檢查全文：沒有寫錯的干支、年份、喜忌或格局。它標出的幾項都是預期內的：回顧驗證引用了過去的年份與月柱、四柱表列出了 AI 命盤資料沒有收的神煞、名詞辭典裡的「身弱」，以及聲明裡的「不建議購買改運商品」。正式版要把過去年份、流月和完整神煞表都放進命盤資料。
