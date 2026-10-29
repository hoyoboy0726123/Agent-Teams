# English glossary

For everyone writing English for 命盤人生 (`src/i18n/en/*.json`, see README「英文版（翻譯層）」). The readers are
English speakers in Singapore, Malaysia, the Philippines and the Chinese diaspora: many know Chinese festivals and
family words, few know Taiwan's institutions or its recent history.

## Voice

- Warm, plain and concrete, like the Chinese: "you" for the protagonist, short sentences, the small detail over the
  adjective.
- British spelling (neighbour, colour, programme, learnt), as in Singapore and Malaysia.
- Explain a Taiwanese thing in a few words the first time a sentence needs it, inside the sentence: "the 921
  earthquake, the great quake of 21 September 1999"; "the Legislative Yuan, Taiwan's parliament". No footnotes, no
  lectures, and no opinions on politics (the Chinese has none either).
- No Chinese characters in story lines. Names are romanised (below). Chinese in brackets is for the BaZi terms of the
  readings, the first time each appears: "your Day Master (日主)".
- Money is NT$ (NT$22,000). Ages are years since birth, as the story counts them.
- Dates: 21 September 1999, 3 April.

## Names

Wade–Giles as Taiwanese passports write it, without apostrophes or umlauts; surname first, given name hyphenated with
the second syllable in lower case: 李天賜 Lee Tien-tzu, 陳怡君 Chen Yi-chun, 張簡宏明 Chang-Chien Hung-ming. People
are called by the given name, as in the Chinese: 志明 Chih-ming. Nicknames: 阿明 Ah-ming, 小美 Hsiao-mei.
`src/sim/lang.js` `romanise` does this from `src/i18n/en/names.json` (`node scripts/romanise.mjs`). Places keep their
usual English names: Taipei, Kaohsiung, Taichung, Hsinchu, Hualien, Taroko Gorge, Sun Moon Lake, Xinyi (the district).

## Recurring words

| Chinese | English | Note |
| --- | --- | --- |
| 紅包 | red packet | "ang pow" is fine in dialogue for SG/MY readers |
| 壓歲錢 | New Year red-packet money | |
| 過年 | Lunar New Year | |
| 除夕、年夜飯 | Lunar New Year's Eve, the reunion dinner | |
| 中秋節 | Mid-Autumn Festival | mooncakes, barbecues in Taiwan |
| 清明 | Qingming, the tomb-sweeping festival | |
| 拜拜 | praying at the temple; offerings | |
| 媽祖 | Mazu, the sea goddess | |
| 算命 | fortune-telling | |
| 阿嬤、阿公 | Grandma, Grandpa | Ah-ma, Ah-kong only in dialogue |
| 外婆、外公 | Grandma, Grandpa (your mother's side) | add "on your mother's side" only when it matters |
| 婆婆 | your mother-in-law (your husband's mother) | |
| 岳母、岳父 | your mother-in-law, father-in-law (your wife's parents) | |
| 哥哥、姊姊、弟弟、妹妹 | older brother, older sister, younger brother, younger sister | "big brother" in a child's voice |
| 另一半 | your partner | |
| 坐月子 | the month of confinement after giving birth | SG/MY readers know "confinement" |
| 相親 | a matchmaking date | 長輩安排的相親: a meeting arranged by the family |
| 國小、國中、高中、高職 | primary school, junior high, senior high, vocational high school | |
| 五專、科大 | five-year junior college, university of science and technology | |
| 補習班 | cram school | |
| 班長 | class monitor | |
| 福利社 | the school tuck shop | |
| 聯考 | the entrance exam | 高中聯考 the senior-high entrance exam; 大學聯考 the university entrance exam |
| 基測、會考 | the junior-high exam (Basic Competence Test, from 2014 the Comprehensive Assessment) | |
| 學測 | the university entrance exam (GSAT) | 指考、分科測驗: the subject exams |
| 統測 | the vocational college entrance exam | |
| 當兵 | military service | SG readers: like NS |
| 健保、健保卡 | National Health Insurance, the health card | explain once: cover for everyone, from 1995 |
| 勞保 | Labour Insurance | |
| 公務員、高普考 | civil servant, the civil-service exam | |
| 無薪假 | unpaid leave | |
| 22K | "22K", the NT$22,000 starting pay | |
| 房貸、頭期款 | mortgage, down payment | |
| 便當 | lunch box | |
| 早餐店 | breakfast shop | |
| 夜市 | night market | |
| 手搖飲 | bubble tea (shop) | |
| 機車 | scooter | never "motorcycle" for the everyday one |
| 捷運 | the MRT | |
| 騎樓 | the shopfront arcades | covered walkways |
| 里長 | the neighbourhood chief | |
| 民宿 | guesthouse | |
| 環島 | a trip round the island | |
| 伴手禮 | souvenirs (gifts brought back) | |
| 老家 | your hometown, the old family home | |
| 颱風假 | a typhoon day off | |
| 跨年 | the New Year's Eve countdown | |
| 九二一 | the 921 earthquake (21 September 1999) | |
| 三級警戒 | the Level 3 COVID alert (May–July 2021) | |
| 大家樂 | "Everybody's Happy", the illegal numbers game | |
| 明牌 | lucky numbers; a hot tip (stocks) | |
| 號子 | the brokerage | |
| 戒嚴、解嚴 | martial law, the lifting of martial law (1987) | |
| 立法院 | the Legislative Yuan, Taiwan's parliament | |
| 戶政事務所 | the registry office | |
| 身分證 | ID card | |
| 國語、台語、客家話 | Mandarin, Taiwanese (Hokkien), Hakka | |
| 原住民 | Indigenous Taiwanese | |

## BaZi terms (for the readings, later)

Plain names first, the Chinese in brackets the first time, the traditional English name where a reader may know it.
The page's own words (`src/i18n.js`, `GOD`) use the traditional names for the Ten Profiles today; when the readings
are translated, both should use the same names.

| Chinese | English | Traditional English |
| --- | --- | --- |
| 八字、命盤 | BaZi, your chart (birth chart) | Four Pillars of Destiny |
| 年柱、月柱、日柱、時柱 | Year, Month, Day and Hour Pillar | |
| 天干、地支 | Heavenly Stems, Earthly Branches | |
| 藏干 | Hidden Stems | |
| 日主、日元 | Day Master (you, in the chart) | |
| 五行 | the Five Elements: Wood, Fire, Earth, Metal, Water | |
| 身強、身弱、中和 | a strong, weak or balanced Day Master | |
| 十神 | the Ten Profiles | Ten Gods |
| 比肩 | Peer | Friend, Companion |
| 劫財 | Rival | Rob Wealth |
| 食神 | Creator | Eating God |
| 傷官 | Rebel | Hurting Officer |
| 正財 | Steady Wealth | Direct Wealth |
| 偏財 | Windfall Wealth | Indirect Wealth |
| 正官 | Authority | Direct Officer |
| 七殺 | Challenger | Seven Killings |
| 正印 | Nurturer | Direct Resource |
| 偏印 | Maverick | Indirect Resource |
| 大運 | Luck Pillars (ten-year luck cycles) | |
| 流年 | the year's luck (Annual Pillar) | |
| 用神 | Useful Element | |
| 喜神、忌神 | favourable element, unfavourable element | |
| 格局 | chart structure | |
| 調候 | seasonal balance | climate adjustment |
| 神煞 | symbolic stars | |
| 刑、沖、合、害 | punishment, clash, combination, harm | |
| 納音 | Nayin (sound element) | |
| 太歲 | Tai Sui, the year's ruling star | |
| 生肖 | zodiac animal | |
| 真太陽時 | true solar time | |
| 時辰 | the two-hour period of birth (Zi hour, Chou hour…) | |
| 合婚 | marriage compatibility (Match) | |
| 命卦 | Life Gua | |
| 姓名學、五格、三才 | name analysis, the Five Grids, the Three Talents | |
