# 故事事件怎麼寫

每個檔案匯出一個事件陣列，`index.js` 依「時代 → 骨架 → 工作 → 童年 → 青少年 → 大學與出社會 → 成家立業 → 後半生 → 健康與金錢」的順序每年檢查一次。

| 檔案 | 內容 |
| --- | --- |
| `core.js` | 人生骨架：上學、工作、結婚、生子、買房、生病、離世。機率來自台灣統計，**別的檔案不要改它** |
| `work.js` | 創業、考公職、在職進修的多年故事線 |
| `era.js` | 1950 年以後的台灣時代事件 |
| `child.js`、`teen.js`、`young.js`、`adult.js`、`later.js`、`health.js` | 各階段的故事 |

## 一個事件

```js
{
  id: "bullied",                      // 全部檔案裡唯一
  domain: "family", channel: "bad",   // 流年傾斜哪一個領域、哪一個管道（可省略：固定會發生的事）
  tags: ["siblings"], about: "siblings", // 選填：和誰有關（命盤原因、家人合盤用）
  ages: [7, 12], cooldown: 3, max: 2, once: false,
  when: (s, ctx) => s.studying,       // 什麼情況下可能發生
  p: (s, ctx) => 0.04,                // 這一年發生的基礎機率
  apply: (s, ctx) => ({ text, mood, big }),   // 或者 choice，二選一
}
```

- `domain`：career、wealth、love、health、study、family、move；`channel`：good、bad、change。
- `mood`：心情變化，大約 −15 到 +12。`big: true` 會用粗體顯示。
- `grave: true`：死亡和重病。名字和家人合盤不會影響它們。故事模組**不要**寫任何人的死亡或重病，那些都在 `core.js`。
- `rare: true`：本來就很少發生的事件（500 次人生裡可能一次都沒有）。

## 抉擇

```js
choice: (s, ctx) => ({
  prompt: "被同學欺負了好幾次。要怎麼辦？",
  options: [
    { id: "bullied.teacher", label: "告訴老師", hint: "請大人處理", act: "seekHelp", style: "social", weight: 0.3,
      apply: (s, ctx) => ({ text: ctx.w("..."), mood: 1 }) },
    { id: "bullied.parents", label: "告訴爸媽", ..., when: s => s.father.alive || s.mother.alive },
    ...
  ],
})
```

- 每個抉擇 **4–6 個選項**，選項彼此真的不一樣（不是同一件事換句話說）。
- `id`：`事件.選項`，全部唯一。玩家自己寫的話若對應到這個 id，就套用這個選項。
- `act`：最接近的一般行動（`src/sim/actions.js` 的 id）。
- `style`：risk（冒險）、safe（保守）、family（家人優先）、self（自己優先）、health（顧身體）、social（找人）、learn（學新東西）。自動模擬會依主角個性偏向某些 style，選完個性也會慢慢改變。
- `weight`：一般人選它的比重，同一個抉擇的選項加起來大約 1。可以是函式 `(s, ctx) => number`。
- `when`：這個選項什麼時候才出現（例如要有兄弟姊妹）。
- `prompt` 和每個結果的 `text` 要說清楚情境，讓只看那一行的人也看得懂。

## ctx 能用的東西

| | |
| --- | --- |
| `ctx.w(模板或模板陣列, 變數)` | 產生句子。陣列會挑這一生還沒用過的那一句 |
| `ctx.rng()`、`.int(n)`、`.pick(list)`、`.chance(p)`、`.between(a, b)`、`.weighted([[值, 權重]])` | 亂數 |
| `ctx.roll(domain, channel, p)` | 依今年流年傾斜後擲骰，回傳 true/false |
| `ctx.odds(domain, channel, p)` | 傾斜後的機率 |
| `ctx.person({ role, sex, birthYear, how })` | 新的人物（role：partner、kid、friend），有 `name`、`call`（故事裡怎麼叫）、`nature` |
| `ctx.arc.start(id, data, 幾年後)`、`.at(id, stage)`、`.go(id, stage, 幾年後)`、`.end(id, 結果)`、`.get(id)` | 跨好幾年的故事線 |
| `ctx.remember(kind, text, extra)` | 記下一件事，之後的事件可以回頭提（`s.memory`） |
| `ctx.nudge(trait, delta)` | 改變個性 |
| `ctx.luckAt(age)` | 那一年的流年（`.reasons` 是命盤原因的句子） |
| `ctx.R` | `rates.js` 的統計 |

## 句子模板

- `{甲|乙|丙}` 隨機選一個，可以巢狀、可以空白（`{|很}`）。
- `{name}` 帶入變數。常用的變數不用傳：`{city}`（現在住的縣市）、`{job}`、`{partner}`（另一半的名字）、`{ta}`（他／她）、`{kid}`（最小的孩子）、`{kids}`、`{friend}`（隨機一位朋友）、`{grand}`（阿公／阿嬤）、`{chat}`（那個年代的聊天方式）、`{trip}`（旅行地點）、`{age}`、`{year}`。
- 只有用 `ctx.w()` 的句子才會展開模板。一般字串裡不要放 `{`、`}`。
- 每個事件至少 3 個模板，或一個模板至少 8 種組合。用年代（`s.year`）、地點、職業、家人狀態讓句子不一樣。

## 主角的狀態 `s`

| 欄位 | |
| --- | --- |
| `age`、`year`、`birthYear`、`sex`（male/female）、`county`、`birthCounty`、`abroad` | |
| `edu`（none/國小/國中/高中/高職/五專/科大/大學/碩士/博士）、`studying`、`track` | 學歷 |
| `employed`、`job`（`{title, factor, field, since}`）、`career`（0–5）、`income`（相對全國中位數）、`savings`、`debt`、`retired`、`unemployedFor` | 工作與金錢（單位是一年的中位數薪水） |
| `rel`（single/dating/married/divorced/widowed）、`partner`（人物，有 `age`）、`exes`、`marriages`、`divorces`、`guard`、`crisis` | 感情 |
| `kids`（人物陣列，有 `age`、`call`、`sex`）、`friends`（人物陣列）、`siblings.list`、`father`、`mother`（`{alive, age, name}`） | 家人朋友 |
| `health`（`chronic`、`serious`、`hr`、`fitness`、`smoke`、`drink`、`stress`） | 健康 |
| `traits`（drive、caution、warmth、health、curiosity，0–1） | 個性 |
| `home`（parents/rent/own）、`flags`、`arcs`、`memory`、`done`（發生過的事件 id）、`last`（事件 id → 最後一次的年齡） | 其他 |

`src/sim/world.js` 有工作清單、`startJob`、`moveTo`、`bornSiblings`、`chatTool`、`exam15Name` 等；`src/sim/words.js` 有 `siblingCall`（「哥哥志明」）；`src/sim/act.js` 有 `marry`、`endRelationship`、`ownHome`。

## 不能動到統計

`test/calibration.test.js` 檢查模擬人口仍符合台灣統計（生育、初婚年齡、離婚、退休、買房、升學、壽命）。故事模組：

- 不直接結婚、離婚、生小孩、買房、退休、讓人死亡或得重病；這些交給 `core.js`。
- 會改變工作（辭職、換工作）或健康（`hr`）的選項，影響要小（`hr` 每次最多乘 0.97 或 1.03），而且有好有壞。
- 故事事件的機率沒有官方統計，寫在旁邊的註解說明是假設的。

## 語氣

- 繁體中文、台灣用語，用「你」稱呼主角。
- 具體的小細節勝過形容詞：「把一起拍的照片收進盒子裡」勝過「很難過」。
- 不寫暴力、性、自傷的細節；不寫政治立場；時代事件只寫主角身邊看得到的事。
- 生病、離別、失敗都要有尊嚴，不嘲笑任何人。

## 檢查

```bash
node --test test/story.test.js     # 句子沒有破洞、每個抉擇夠多選項、每個事件都會發生
npm test                           # 全部，包括統計校準
```
