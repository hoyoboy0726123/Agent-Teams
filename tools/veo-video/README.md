# Veo 影片產線：技術交接文件

給接手的 Claude 對話：這份文件記錄了「啟思創客」宣傳影片從零做到定稿的完整做法、已經設定好的帳號與額度、可以直接沿用的程式，以及踩過的每一個坑。照著做就能馬上開工。**聲音複製由你那邊負責**（使用者已有本機 Qwen3-TTS 流程），本文件只說明影片端怎麼接你的音檔。

`reference/` 裡是上一支影片（60 秒課程宣傳片，已定稿）實際跑過的程式，可以直接改來用。

---

## 1. 已經設定好的東西（不用再做）

| 項目 | 狀態 |
|---|---|
| Google API Key | 已設在雲端環境變數 `GOOGLE_API_KEY`。程式一律用 `os.environ["GOOGLE_API_KEY"]`，**不要把金鑰寫進檔案或貼進對話** |
| 帳單 | Google Cloud「我的帳單帳戶 2」，Key 所在專案是 AI Studio 自動建立的 `gen-lang-client-0966320938` |
| 額度 | Google AI Pro 的開發者權益，每月 US$10（帳單頁顯示 NT$318）。已領 5 筆共約 NT$1,590，上一支影片用掉約 NT$750，**剩約 NT$840**（2026-10-05）。每月會再撥一筆 |
| 方案等級 | 已是付費方案（Paid tier），Veo 可以用。專案**沒有 Imagen 權限**，生圖改用 Gemini 圖片模型 |
| 網路 | 雲端環境可連 `generativelanguage.googleapis.com`、`texttospeech.googleapis.com`、PyPI、npm、GitHub（git clone）。**連不到**：Hugging Face、Pixabay、fal.ai、OpenAI、GitHub 的 release 下載 |
| 工具 | Python 3.10+ 和 `google-genai`（2.28，在 `.openmontage/.venv`，可用 `bash scripts/openmontage-setup.sh` 重建）、ffmpeg 6、Node 22、Playwright Chromium |

**花錢之前一定要先給使用者估價，等他說 OK 才生成。** 這是跟使用者的約定。

---

## 2. 模型與價格（2026-10 實測可用）

| 用途 | 模型 ID | 價格 | 備註 |
|---|---|---|---|
| 影片（標準版） | `veo-3.1-generate-preview` | US$0.40／秒（720p 與 1080p 同價），8 秒約 NT$100 | **使用者要求一律用標準版**，Fast 版的嘴型和細節他不滿意 |
| 影片（Fast） | `veo-3.1-fast-generate-preview` | US$0.10／秒 | 只適合測試 |
| 影片（Lite） | `veo-3.1-lite-generate-preview` | US$0.05／秒 | 沒用過 |
| 生圖／延伸畫面 | `gemini-2.5-flash-image` | 約 US$0.039／張 | 用來把方形照片延伸成 9:16、做起始畫面 |
| 聽寫／檢查 | `gemini-3-flash-preview` | 很便宜 | `gemini-2.5-flash` **新用戶已不能用**，會回 404 |
| 台灣腔配音（備用） | `gemini-2.5-flash-preview-tts` | 幾乎免費 | **每分鐘上限 10 次**。你有聲音複製就不用它 |
| 配樂 | `lyria-3-pro-preview` | US$0.08／首 | 使用者最後改用自己從 Pixabay 下載的配樂 |

用 `client.models.list()` 可以確認目前帳號能用哪些模型（免費）。

---

## 3. 產線總覽

```
原始照片（1:1）
  → ① Gemini 延伸成 9:16 起始畫面            gen.py: outpaint()
  → ② Veo 3.1 圖生影片，8 秒、9:16、720p      gen.py: veo()
  → ③ 量出每段影片「嘴巴開合」的秒數          env.py（音量包絡線）
  → ④ 把台詞音檔對準嘴型                      align.py
  → ⑤ 卡片、字幕、配樂、合成                  build.py（加 cards.html）
  → ⑥ 抽格檢查加上 Gemini 聽整支              見第 7 節
```

### ① 起始畫面：Gemini 延伸成 9:16
Veo 沒有「方形補成直式」的功能，直接丟方形圖效果不好。先用 Gemini 圖片模型延伸：

```python
r = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[types.Part.from_bytes(data=src, mime_type="image/jpeg"),
              "Extend this square photo into a tall 9:16 portrait image. Keep every person, face, pose and "
              "object exactly as they are, centered. Naturally continue the scene above and below. "
              "Same lighting and style. Do not add any text."],
    config=types.GenerateContentConfig(response_modalities=["IMAGE"],
                                       image_config=types.ImageConfig(aspect_ratio="9:16")))
```

### ② Veo 圖生影片
```python
op = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    prompt=prompt,
    image=types.Image(image_bytes=start_png, mime_type="image/png"),
    config=types.GenerateVideosConfig(aspect_ratio="9:16", duration_seconds=8, resolution="720p",
                                      negative_prompt="subtitles, captions, on-screen text, watermark, music"))
while not op.done:
    time.sleep(10); op = client.operations.get(op)
vid = op.response.generated_videos[0]          # 被安全審查擋下時這裡會是 None，見坑 #2
client.files.download(file=vid.video); vid.video.save("clip.mp4")
```
一段約 50～75 秒生成完。輸出是 720×1280、24fps，**自帶聲音**（關不掉）。

**提示詞寫法（實測有效）：**
- 用英文描述動作和運鏡，中文台詞用「」括起來，例如 `says once, in Mandarin Chinese with a Taiwanese accent: 「先寫驗收卡，AI 才准動工！」`
- 每句都寫 **`once`／`exactly once`／`Each line is spoken only one time, no repetition`**，不然會重複講
- 寫清楚 **誰講話**：`Only the girl speaks.`，不然背景人物會亂插話
- 一定要加 `No music.`，配樂後製再加
- 道具要保持不變就明講，例如 `the sticky notes keep their handwritten text exactly as it is the whole time; nobody picks them up, no note turns blank`（Fast 版曾把寫好的便利貼變成空白）
- 想要新台詞但嘴型要自然，**還是讓 Veo 講那句台詞**（就算之後換掉聲音），這樣嘴型才會跟著動

### ③ 量嘴型時間：用音量包絡線，不要用模型猜
Veo 說話的秒數，**不要問 Gemini**，同一段問兩次可能差 0.7 秒。要用 Veo 自帶音軌的音量來找：

```bash
python env.py clip.mp4      # 每 0.1 秒印一格，# 越多越大聲
ffmpeg -i clip.mp4 -vn -af "highpass=f=200,lowpass=f=4000,silencedetect=noise=-32dB:d=0.18" -f null -
```
看出每句的開始和結束，以及句子中間換氣停頓的位置，手動填進 `align.py` 的 `CLIPS`。可以搭配 Gemini 聽寫確認「哪一句是誰說的」，但**秒數以音量為準**。

### ④ 對嘴（你接手時最需要的部分）
做法：**Veo 原聲全部靜音**，把新台詞音檔放到 Veo 嘴巴在動的那段時間。

- 一句台詞在 Veo 裡如果有換氣停頓，就**在停頓處切成兩段**（`align.py` 用「｜」標記，例如 `"先寫驗收卡，｜AI 才准動工！"`），每段各自對準一個嘴型區間
- 每段音檔先去掉頭尾靜音，再用 `atempo` 拉伸或壓縮到剛好填滿區間，**倍率限制在 0.75～1.35**，超過會很不自然
- 只有笑聲、擊掌、歡呼這種**沒有字的聲音保留 Veo 原音**（`build.py` 的 `keep` 時間窗）
- 產出：每段影片一條 8 秒長、跟影片時間軸對齊的 `*.dub.wav`

**你的聲音複製要交出的東西**：每一句台詞一個**乾淨的 wav**（不含音樂、頭尾留一點靜音即可），檔名對應腳本編號。把 `align.py` 裡的 `tts()` 換成「讀你的檔案」就可以，其他流程不變。

### ⑤ 合成（build.py）
- 每段先輸出成同規格的片段（720×1280、30fps、H.264、AAC 48k 立體聲），再用 concat 接起來
- **字幕**：ASS 格式燒進畫面，字型用 Noto Sans TC Black。字型檔從 `fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;900` 抓（請求時 User-Agent 設成 `Mozilla/4.0` 才會拿到 TTF），用 ffmpeg 的 `subtitles=...:fontsdir=...` 指定字型目錄
- **字幕位置**：`MarginV 300`，避開 IG／FB 下方介面。畫面上已經寫出內容的卡片就不要再上字幕，會互相重疊
- **標題卡和能力標籤**：`cards.html` 做版型，用 Playwright 截圖（標籤用 `omitBackground` 輸出透明 PNG）。顏色沿用使用者簡報的「繪本扁平」主題：紙色 `#FBF7EE`、描邊 `#3B2A1D`、珊瑚 `#E9724C`、天藍 `#4A97DD`、蜂蜜 `#F5B81C`、LINE 綠 `#06A33A`
- **配樂閃避**：配樂音量約 0.30，對人聲音軌做 `sidechaincompress=threshold=0.02:ratio=6:attack=40:release=450`，有人說話時配樂自動降低
- **音量**：整體約 -16 LUFS，最後加 `alimiter=limit=0.95`
- **1080p 版**：`W, H = 1080, 1920`；卡片用 `deviceScaleFactor: 1.5` 重畫（`cards-hd.cjs`），影片用 `scale=...:flags=lanczos,unsharp=5:5:0.6` 放大
- **傳檔上限 30MB**：1080p 60 秒用 two-pass、`-b:v 3400k` 約 26MB

---

## 4. 踩過的坑（全部實際發生過）

| # | 狀況 | 解法 |
|---|---|---|
| 1 | Veo 同時送多個請求，回 `429 RESOURCE_EXHAUSTED` | **一次一段**，每段之間停 20 秒 |
| 2 | 回傳 `generated_videos=None`，原因寫 `issue with the audio for your prompt`（**不會收費**） | Veo 的聲音安全審查。觸發條件：多人同時講話、群眾歡呼、某些照片。依序試：① 改成只有一個人講話 ② 改成 `No speech, no dialogue` ③ 重新延伸起始畫面 ④ 改用標準版（Fast 連續失敗的那張，標準版一次就過） |
| 3 | 帳號的「花費速率」上限，回 `spend-based rate limit` | 新帳號每分鐘能花的錢有限。等幾分鐘；檢查已經做好的檔案就**沿用快取**，不要重算 |
| 4 | Gemini TTS 回傳內容是空的 | 台詞太短（例如「這裡！」）。改成跟上一句合在一起念，再從停頓處切開 |
| 5 | Gemini TTS 每分鐘只能 10 次 | 每次呼叫之間停 6.5 秒 |
| 6 | 驗證時「它／他／她」一直判定不符而重試 | 同音字，比對前先統一成「它」 |
| 7 | Veo 原生的中文口音偏大陸腔，偶爾唸錯字（例如「驗收卡」唸成「接收卡」） | 不用 Veo 的聲音，一律換成台灣腔配音或複製聲音 |
| 8 | 對嘴的秒數，Gemini 兩次回答不一樣 | 改用音量包絡線（第 3 節 ③） |
| 9 | 字幕跟卡片上的字或按鈕重疊 | 卡片本身有字就不加字幕 |
| 10 | 片長變長 | 對白需要時間講完，60 秒很正常。IG Reels 上限遠超過 60 秒（3 分鐘內都會推給新觀眾） |
| 11 | 使用者說「下載資料夾」 | 那是他手機或電腦的資料夾，你看不到。請他把檔案**附加到對話**裡 |
| 12 | 雲端 Remotion 渲染失敗（如果走 OpenMontage） | 跑 `scripts/openmontage-setup.sh`：改用內建的 headless shell，Google Fonts 改成本機檔案 |

---

## 5. 使用者的偏好（重要）

- 全程繁體中文回覆，語氣親切、多鼓勵
- **所有人聲都要台灣腔**，要有在地感；小朋友的聲音要像台灣國小生
- **嘴型要對上**；邏輯錯誤會被抓出來（例如寫好的便條紙變空白）
- 一律用 **Veo 標準版**
- 會一格一格檢查，修改要逐點回報
- 只在他指定的資料夾工作（雲端環境就是 `/home/user/Agent-Teams`，暫存檔放 scratchpad）

---

## 6. 品質檢查（交件前一定要做）

1. **抽格拼圖**：每段中間各抽一格，用 ffmpeg 的 `tile` 拼成一張，看字幕、標籤、畫面邏輯
2. **Gemini 聽整支**：輸出 16k mp3 給 `gemini-3-flash-preview`，請它逐句轉錄（附秒數、說話者），並評估「是否台灣腔、有沒有重複或重疊、配樂會不會蓋過人聲、有沒有爆音」
3. **費用**：每次生成都寫進 `spend.jsonl`（`gen.py` 的 `log()`），交件時一併回報

---

## 7. 新任務：「藏鏡人邊走邊說」第一人稱訪談

### 原版（使用者用本機模型做的）
- 720×1280、24fps、42.6 秒。咖啡廳，男老師坐著不動，前景是提問者的手和咖啡杯
- 0–14 秒：鏡頭外提問者（家長）：「我覺得我女兒很厲害耶，什麼都問 AI，一下子就做好了，那她到底會不會用 AI，還是說她用 AI 只是要答案，接著就不會去思考了。」
- 14–35 秒：男老師：「很會用，不代表很會判斷。最危險的不是孩子不會用 AI，而是用得太順，順到 AI 做錯了都看不出來。在我們的課，孩子要先寫驗收卡，AI 才准動工，交件後，再自己把錯誤一個一個抓出來。如果 AI 給出的答案是錯的，你家孩子看得出來嗎？」
- 35–42 秒：結尾卡（吉祥物、2026 首期班、11/28 開課、LINE `@601uejgq`）加旁白。**沿用原版，不用重做**
- 字幕重點字用黃色（例如「用得太順」「看不出來」「驗收卡」）

### 目標
快節奏、**邊走邊說**、更動態；**人物外型維持不變**。

### 人物描述（每段提示詞都要放）
> A Taiwanese man around 30, short black hair with a side-swept fringe, thin round metal-frame glasses, light gray mandarin-collar (band-collar) button-up shirt with fine stripes, green-dial wristwatch on his left wrist, friendly confident expression.

### 腳本（約 36 秒，加上原版結尾卡 7 秒）
| # | 秒數 | 場景／鏡頭 | 對白 |
|---|---|---|---|
| 1 | 0–4 | 校門外人行道。提問者往後退著走、手持跟拍，畫面下方有她拿麥克風的手 | 家長：「老師！我女兒什麼都問 AI，一下子就做好了耶！」 |
| 2 | 4–7 | 同場景，突然拉近；老師邊走邊轉頭看鏡頭 | 老師：「很會用，不代表很會判斷。」 |
| 3 | 7–9 | 鏡頭小跑步跟上 | 家長：「蛤？那哪裡危險？」 |
| 4 | 9–13 | 走進校園走廊，邊走邊比手勢 | 老師：「最危險的不是不會用，是用得太順——」 |
| 5 | 13–16 | 臉部特寫，靠近鏡頭 | 老師：「順到 AI 做錯了，都看不出來。」 |
| 6 | 16–20 | 老師推開教室門，鏡頭跟進；教室裡小朋友在用筆電 | 老師：「所以在我們的課——」 |
| 7 | 20–25 | 走過課桌，拿起桌上的黃色便利貼給鏡頭看 | 老師：「孩子要先寫驗收卡，AI 才准動工！」 |
| 8 | 25–30 | 彎腰看小朋友的筆電，螢幕有紅色錯誤訊息 | 老師：「交件後，自己把錯誤一個一個抓出來。」 |
| 9 | 30–36 | 轉身停步、直視鏡頭，慢慢推近，表情轉為認真 | 老師：「如果 AI 給的答案是錯的……你家孩子，看得出來嗎？」 |
| 10 | 36–43 | 原版結尾卡 | 原版旁白 |

**生成時合併成 4～5 段 8 秒的 Veo 影片**（例如 1+2、3+4+5、6+7、8+9），剪輯時再切成快節奏：每 2～4 秒跳剪一次、突然拉近（數位放大 1.15～1.25 倍）、加「咻」轉場音效、關鍵字大字跳出。

### 保持人物一致的做法
1. 從原片截一張老師的**正面清楚畫面**當參考（例如第 1 秒那格）
2. 用 `gemini-2.5-flash-image` 帶參考圖，生成每一段的**起始畫面**：「同一個人、同一套衣服」在人行道、走廊、教室；9:16；POV 構圖，畫面下方有一隻手拿麥克風。**先給使用者看，像了再拍**
3. 用 Veo 標準版從起始畫面生成。`GenerateVideosConfig` 有 `reference_images` 欄位（Veo 3.1 最多 3 張參考圖），可以再加強臉部一致，但**直式影片能不能用這個欄位還沒實測**，先試一段
4. 長鏡頭可以用前一段的最後一格當下一段的起始畫面，讓銜接自然

### 提示詞範本（第 1 段，含 1+2）
> POV street interview, handheld camera walking backward on a sunny sidewalk outside a school gate. In the lower part of the frame, the interviewer's hand holds a small black handheld microphone toward the man. [人物描述] walks briskly toward the camera. The off-screen female interviewer asks once, excited, in Mandarin Chinese with a Taiwanese accent: 「老師！我女兒什麼都問 AI，一下子就做好了耶！」 The man raises an eyebrow, smiles, keeps walking, turns his head to the lens and answers once: 「很會用，不代表很會判斷。」 Each line is spoken only one time. Dynamic handheld motion, natural street ambience. Only these two people speak. No music.

### 預算
起始畫面約 NT$10；Veo 標準版 5 段約 NT$510；預留重拍約 NT$100。**合計約 NT$520～620，額度剩約 NT$840，夠用。**建議**先拍第 1 段（約 NT$100）**給使用者確認人物和節奏，OK 再拍其他段。

---

## 8. 檔案

| 檔案 | 用途 |
|---|---|
| `reference/gen.py` | 延伸起始畫面、Veo 生成、記錄花費；鏡頭清單讀 `shots.json` |
| `reference/shots.json` | 上一支片 6 段的 Veo 提示詞（可當寫法範例） |
| `reference/env.py` | 印出音量包絡線，用來找嘴型秒數 |
| `reference/align.py` | 台詞對嘴（含 TTS 備用、停頓切割、拉伸、快取） |
| `reference/build.py` | 片段合成、字幕、標籤、配樂閃避、輸出；`keep` 保留笑聲和歡呼原音 |
| `reference/cards.html`、`cards.cjs`、`cards-hd.cjs` | 標題卡和能力標籤的版型與截圖（`cards*.cjs` 裡的 Playwright 路徑 `/opt/node22/...` 是雲端環境專用，本機請改成自己的） |
| `../../scripts/openmontage-setup.sh` | 雲端環境一鍵安裝 OpenMontage（含 Remotion 修正） |

`reference/` 的程式預期旁邊有 `photos/`（原始照片）、`out/`（產出）、`fonts/`（Noto Sans TC）三個資料夾，這些素材檔沒有放進 git。在 Windows 上跑 `build.py` 時，ffmpeg 的 `subtitles=` 路徑如果有磁碟代號（`C:`），冒號要跳脫成 `C\:`。
