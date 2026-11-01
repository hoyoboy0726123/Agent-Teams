// Ready-made workflows and automations. Steps reference agent-library keys; the needed
// agents are created automatically when a template is used.
// Runtime variables: {{input}} {{prev}} {{stepN}} {{date}} {{digest}} (24 h activity) {{digest_week}}.
// {{field}} placeholders are filled from the template's form when it is installed.

export const WORKFLOW_TEMPLATES = [
  {
    key: 'research-report', name: '深度研究報告 Deep research report', description: 'Research → critique → polished report artifact.',
    steps: [
      { agent: 'researcher', handle: 'researcher', instruction: 'Research this topic thoroughly (search the web and read primary sources) and list key findings with sources: {{input}}' },
      { agent: 'critic', handle: 'critic', instruction: 'Review the research above. Point out gaps, weak sources and missing angles.' },
      { agent: 'writer', handle: 'writer', instruction: 'Write the final research report as an artifact of type "research", incorporating the critique. Topic: {{input}}' },
    ],
  },
  {
    key: 'pitch-deck', name: '簡報產生器 Pitch deck', description: 'Plan → numbers → slide deck.',
    steps: [
      { agent: 'lead', handle: 'lead', instruction: 'Outline the storyline (8–10 slides) for a presentation about: {{input}}. Do not delegate; just produce the outline.' },
      { agent: 'analyst', handle: 'analyst', instruction: 'Add the key numbers, market sizing and metrics the outline needs. Be explicit about assumptions.' },
      { agent: 'designer', handle: 'designer', instruction: 'Build the final deck as a "slides" artifact from the outline and numbers above.' },
    ],
  },
  {
    key: 'kpi-dashboard', name: 'KPI 儀表板 KPI dashboard', description: 'Turn pasted data or a description into a dashboard.',
    steps: [{ agent: 'analyst', handle: 'analyst', instruction: 'Create a dashboard artifact (type "dashboard") for: {{input}}. Include KPIs, 2–4 charts and a short notes section.' }],
  },
  {
    key: 'landing-page', name: '產品網站 Landing page', description: 'Copywriting and design in parallel, then a finished website.',
    steps: [
      { agent: 'copywriter', handle: 'copywriter', instruction: 'Write landing-page copy (hero, benefits, social proof, FAQ, CTA) for: {{input}}', parallel: true },
      { agent: 'critic', handle: 'critic', instruction: 'List the 5 most important things a landing page for this must get right: {{input}}', parallel: true },
      { agent: 'designer', handle: 'designer', instruction: 'Build the landing page as a "website" artifact using the copy and checklist above.' },
    ],
  },
];

const weekdays = [1, 2, 3, 4, 5];

export const AUTOMATION_TEMPLATES = [
  // ------------------------------------------------------------------ work
  {
    key: 'daily-brief', category: 'work', icon: '📰', name: { zh: '每日工作簡報', en: 'Daily work brief' },
    description: { zh: '每天早上彙整各頻道進度、待辦事項與風險', en: 'Every morning: progress, to-dos and risks across channels' },
    trigger: 'schedule', schedule: { kind: 'daily', time: '08:30', days: weekdays },
    steps: [{ agent: 'assistant', instruction: `Write today's ({{date}}) work brief for the team from the activity below. Sections: 1) Highlights & decisions, 2) Progress by channel, 3) Open tasks (overdue first) with owners, 4) Risks / blockers, 5) Today's top 3 priorities. Be concise; skip empty sections.\n\n{{digest}}` }],
  },
  {
    key: 'meeting-prep', category: 'work', icon: '🔔', name: { zh: '會議提醒＋準備', en: 'Meeting reminder + prep' },
    description: { zh: '會議前提醒我，並彙整最新資料（可連接 Google 日曆 MCP）', en: 'Before meetings: reminder and latest context (connect Google Calendar MCP)' },
    trigger: 'schedule', schedule: { kind: 'daily', time: '08:00', days: weekdays },
    fields: [{ key: 'focus', label: { zh: '會議重點 / 固定會議（可留白）', en: 'Meeting focus / recurring meetings (optional)' }, placeholder: '週一 10:00 產品週會、週三 14:00 客戶會議' }],
    steps: [{ agent: 'assistant', instruction: `Prepare me for today's meetings ({{date}}). If calendar tools are connected, list today's meetings with them; otherwise use this list: {{focus}}. For each meeting: time, goal, agenda (3–5 bullets), relevant recent context from team memory and the activity below, and questions to ask. If there are no meetings today reply with exactly [pass].\n\n{{digest}}` }],
  },
  {
    key: 'competitor-watch', category: 'work', icon: '👁️', name: { zh: '競品／產業監控', en: 'Competitor / industry watch' },
    description: { zh: '持續追蹤，有變動才通知我', en: 'Keeps watching; only notifies you when something changes' },
    trigger: 'schedule', schedule: { kind: 'daily', time: '09:00', days: weekdays },
    fields: [{ key: 'targets', label: { zh: '要追蹤的公司／產品／主題', en: 'Companies / products / topics to watch' }, placeholder: 'Teamily AI, Slack AI, Notion AI' }],
    steps: [{ agent: 'trend-watcher', instruction: `Monitor: {{targets}}. Search for news, launches, pricing or product changes from the last few days. Compare against what you remembered on previous runs (team memory). Report only NEW or CHANGED items with links and why they matter to us, then remember the key facts for next time. If nothing meaningful changed, reply with exactly [pass].` }],
  },
  {
    key: 'expert-panel', category: 'work', icon: '🔬', name: { zh: '專家小組研究', en: 'Expert panel research' },
    description: { zh: '組建一支專家代理團隊從多角度調查問題', en: 'A panel of expert agents investigates a question from several angles' },
    trigger: 'manual',
    steps: [
      { agent: 'researcher', instruction: 'Investigate from an evidence/data angle (search the web, cite sources): {{input}}', parallel: true },
      { agent: 'market-research', instruction: 'Investigate from a market & competition angle: {{input}}', parallel: true },
      { agent: 'strategist', instruction: 'Investigate from a strategy & business-impact angle: {{input}}', parallel: true },
      { agent: 'critic', instruction: 'Challenge the three perspectives above: contradictions, weak evidence, blind spots.' },
      { agent: 'writer', instruction: 'Write the panel report as a "research" artifact: executive summary, findings by perspective, disagreements, recommendation, sources. Question: {{input}}' },
    ],
  },
  {
    key: 'deck-report', category: 'work', icon: '📊', name: { zh: '製作簡報／報告', en: 'Build a deck / report' },
    description: { zh: '產出可發布的簡報或報告', en: 'Produce a publishable deck or report' },
    trigger: 'manual',
    steps: [
      { agent: 'researcher', instruction: 'Gather the facts and numbers needed for a presentation about: {{input}}' },
      { agent: 'analyst', instruction: 'Turn the facts into key metrics and a small dashboard artifact if there is quantitative data.' },
      { agent: 'designer', instruction: 'Create a polished 8–12 slide "slides" artifact with speaker notes about: {{input}}' },
    ],
  },
  {
    key: 'web-tool', category: 'work', icon: '🌐', name: { zh: '建立網頁／工具', en: 'Build a web page / tool' },
    description: { zh: '為特定用途打造小型網頁或實用工具', en: 'Build a small page or handy tool for a specific need' },
    trigger: 'manual',
    steps: [
      { agent: 'pm', instruction: 'Write a short spec (users, must-have features, layout, edge cases) for this page/tool: {{input}}' },
      { agent: 'frontend', instruction: 'Build it as one complete, beautiful, working "website" artifact following the spec above.' },
      { agent: 'qa', instruction: 'Review the built page against the spec; list any bugs or gaps briefly. If it is good, say so in one line.' },
    ],
  },
  {
    key: 'breakdown', category: 'work', icon: '🗂️', name: { zh: '拆解並分派任務', en: 'Break down & assign' },
    description: { zh: '將專案拆成子任務並追蹤負責人', en: 'Split a project into tasks with owners' },
    trigger: 'manual',
    steps: [{ agent: 'lead', instruction: 'Break this project into 5–12 concrete tasks. Create one task block per task with the best assignee (a teammate @handle or a human) and a realistic due date. Then summarise the plan in a short table. Project: {{input}}' }],
  },
  {
    key: 'weekly-review', category: 'work', icon: '🗓️', name: { zh: '每週回顧', en: 'Weekly review' },
    description: { zh: '每週五整理本週成果、學習與下週計畫', en: 'Every Friday: wins, learnings and next week' },
    trigger: 'schedule', schedule: { kind: 'weekly', day: 5, time: '17:00' },
    steps: [{ agent: 'writer', instruction: 'Write the weekly review as a "document" artifact titled "Weekly review {{date}}": wins, decisions, metrics, what slipped, lessons, next week priorities.\n\n{{digest_week}}' }],
  },
  {
    key: 'kpi-weekly', category: 'work', icon: '📈', name: { zh: '每週 KPI 報告', en: 'Weekly KPI report' },
    description: { zh: '每週一更新 KPI Dashboard（可用 Webhook 送入數據）', en: 'Every Monday: refresh the KPI dashboard (feed data via webhook)' },
    trigger: 'schedule', schedule: { kind: 'weekly', day: 1, time: '09:00' },
    fields: [{ key: 'metrics', label: { zh: '要追蹤的指標與資料來源', en: 'Metrics to track and where the data is' }, placeholder: 'MAU、營收、流失率（資料在 #data 頻道）' }],
    steps: [{ agent: 'analyst', instruction: 'Update the dashboard artifact titled "Weekly KPIs" (reuse the title to create a new version) tracking: {{metrics}}. Use the latest numbers from {{input}}, team memory and recent messages; mark estimates clearly.' }],
  },
  {
    key: 'my-voice', category: 'work', icon: '🪞', name: { zh: '以我的口吻回覆', en: 'Reply in my voice' },
    description: { zh: '讓我的 AI 分身草擬回覆，有風險的內容由我確認', en: 'Your AI twin drafts replies; you approve anything sensitive' },
    trigger: 'manual',
    steps: [{ agent: 'twin', instruction: 'Draft a reply in my voice to the message below. Offer 2 variants (short / detailed) and flag anything I should double-check before sending.\n\n{{input}}' }],
  },

  // ------------------------------------------------------------------ life
  {
    key: 'morning-news', category: 'life', icon: '☕', name: { zh: '每日新聞摘要', en: 'Morning news digest' },
    description: { zh: '每天早上整理你關心的主題新聞', en: 'Every morning: news on topics you care about' },
    trigger: 'schedule', schedule: { kind: 'daily', time: '07:30' },
    fields: [{ key: 'topics', label: { zh: '關心的主題', en: 'Topics' }, placeholder: 'AI、台股、氣候科技' }],
    steps: [{ agent: 'researcher', instruction: 'Search today\'s ({{date}}) most important news on: {{topics}}. Give 5–8 items: one-line headline, 2-line summary, link. End with one "worth reading in full" pick.' }],
  },
  {
    key: 'workout', category: 'life', icon: '💪', name: { zh: '健身計畫＋每日提醒', en: 'Workout plan + daily nudge' },
    description: { zh: '依你的目標產生今日訓練與鼓勵', en: "Today's workout based on your goals" },
    trigger: 'schedule', schedule: { kind: 'daily', time: '07:00' },
    fields: [{ key: 'goal', label: { zh: '目標與限制', en: 'Goal and constraints' }, placeholder: '產後恢復、每次 20 分鐘、在家無器材' }],
    steps: [{ agent: 'health', instruction: "Plan today's ({{date}}) workout for: {{goal}}. Remember progress from previous days (team memory) and progress gently. Include warm-up, main set, cool-down, safety notes and one line of encouragement." }],
  },
  {
    key: 'meal-plan', category: 'life', icon: '🥗', name: { zh: '每週菜單＋採買清單', en: 'Weekly meal plan + shopping list' },
    description: { zh: '每週日規劃下週菜單與採買清單', en: 'Every Sunday: next week\'s meals and shopping list' },
    trigger: 'schedule', schedule: { kind: 'weekly', day: 0, time: '18:00' },
    fields: [{ key: 'diet', label: { zh: '飲食偏好／人數／預算', en: 'Diet, people, budget' }, placeholder: '2 人、少油、預算 3000 元' }],
    steps: [{ agent: 'chef', instruction: 'Plan next week\'s dinners for: {{diet}}. Deliver a "document" artifact with the 7-day menu, quick recipes and a shopping list grouped by aisle.' }],
  },
  {
    key: 'learning', category: 'life', icon: '📚', name: { zh: '每日學習小測驗', en: 'Daily learning quiz' },
    description: { zh: '每天一個小主題＋ 3 題測驗', en: 'One bite-sized lesson + 3 quiz questions a day' },
    trigger: 'schedule', schedule: { kind: 'daily', time: '21:00' },
    fields: [{ key: 'subject', label: { zh: '想學的主題', en: 'What to learn' }, placeholder: '日文 N3 文法' }],
    steps: [{ agent: 'tutor', instruction: 'Teach one bite-sized lesson on {{subject}} building on what we covered before (team memory), then give 3 quiz questions. Remember what was covered today.' }],
  },
  {
    key: 'trip', category: 'life', icon: '✈️', name: { zh: '旅行規劃', en: 'Trip planner' },
    description: { zh: '產出可分享的行程網頁', en: 'A shareable itinerary web page' },
    trigger: 'manual',
    steps: [{ agent: 'travel', instruction: 'Plan this trip and deliver a beautiful, mobile-friendly "website" artifact with a day-by-day itinerary, map links, budget and packing list: {{input}}' }],
  },
  {
    key: 'money-review', category: 'life', icon: '🐷', name: { zh: '每月理財回顧', en: 'Monthly money review' },
    description: { zh: '每月 1 號回顧支出與存錢目標', en: 'On the 1st: spending and savings review' },
    trigger: 'schedule', schedule: { kind: 'monthly', date: 1, time: '09:00' },
    steps: [{ agent: 'money', instruction: 'Monthly money check-in ({{date}}). Using what you remember about my budget and goals (and any numbers in {{input}}), review last month, update the savings plan and suggest 3 small actions. Build a dashboard artifact if there are numbers.' }],
  },
];
