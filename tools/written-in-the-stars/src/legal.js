// The static /privacy and /terms pages (docs/COMPLIANCE.md "Privacy policy contents"), built into public/ by
// scripts/build.mjs. Plain documents with the site's colors, in light and dark.
// TODO(owner): replace CONTACT with the real address before launch.
export const CONTACT = "hello@example.com";
export const UPDATED = "October 28, 2026";
export const SITE_NAME = "Written in the Stars";

const STYLE = `
:root { --bg: #f7f5fc; --surface: #fff; --ink: #161a3a; --muted: #4f5476; --rule: #dcd6ee; --lav: #5446a8; --gold: #85600c; --night: #0b1026; --night-ink: #eceaf8; --night-gold: #f0cd84; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b1026; --surface: #141a3d; --ink: #eceaf8; --muted: #b0b3d3; --rule: #2c3468; --lav: #c3bbf6; --gold: #f0cd84; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; overflow-x: hidden; }
header { background: var(--night); color: var(--night-ink); }
header .wrap { display: flex; align-items: center; min-height: 52px; }
header a { color: var(--night-ink); text-decoration: none; font-family: "Fraunces", Georgia, serif; font-size: 18px; display: inline-flex; gap: 8px; align-items: center; }
header svg { width: 20px; height: 20px; color: var(--night-gold); }
.wrap { max-width: 760px; margin: 0 auto; padding: 0 16px; }
main { padding: 32px 0 48px; }
h1, h2 { font-family: "Fraunces", Georgia, "Times New Roman", serif; font-weight: 500; line-height: 1.2; }
h1 { font-size: clamp(32px, 7vw, 44px); margin: 0 0 6px; }
h2 { font-size: 22px; margin: 32px 0 8px; }
p, li { overflow-wrap: break-word; }
a { color: var(--lav); }
.updated { color: var(--muted); margin: 0 0 20px; }
.box { background: var(--surface); border: 1px solid var(--rule); border-radius: 14px; padding: 14px 18px; }
.todo { border-left: 3px solid var(--gold); padding-left: 10px; }
code { font-size: 14px; }
footer { border-top: 1px solid var(--rule); padding: 20px 0 32px; color: var(--muted); font-size: 14px; }
footer .wrap { display: flex; flex-wrap: wrap; gap: 8px 18px; }
:focus-visible { outline: 3px solid var(--lav); outline-offset: 2px; }
`;

const shell = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${SITE_NAME}</title>
<meta name="description" content="${title} for ${SITE_NAME}, a free life-simulation game.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&display=swap">
<style>${STYLE}</style>
</head>
<body>
<header><div class="wrap"><a href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2 6.5L20.5 11 14 13.5 12 20l-2-6.5L3.5 11 10 8.5z" fill="currentColor"/></svg>${SITE_NAME}</a></div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap"><a href="/">Play</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span>A game for entertainment only.</span></div></footer>
</body>
</html>
`;

const contact = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;

export const PRIVACY_HTML = shell("Privacy Policy", `
<h1>Privacy Policy</h1>
<p class="updated">Last updated: ${UPDATED}</p>
<p class="box">Short version: your birth data stays on your device. We count anonymous events (like "a life was finished") to see how the site is used. No accounts, no cookies, no IDs, no ads, and we never sell or share data.</p>

<h2>What stays on your device</h2>
<p>Everything you type in: your name, birth date, birth time, birthplace and sex, and every choice you make in the game. Your chart and your lives are calculated in your browser. None of it is sent to us or stored by us.</p>
<p>Your browser keeps a few small settings for you in its local storage: light or dark mode, whether to "only ask the big decisions", and the date of your last visit (so a visit is counted once a day). These hold no identifier and never leave your device except as described below. You can clear them at any time by clearing this site's data in your browser.</p>

<h2>What we collect</h2>
<p>Anonymous counts only. When you use the site, your browser sends us the names of events from a fixed list (for example "page viewed", "life started", "life finished", "share card downloaded") and the number of seconds the page was on screen. We add them to daily totals.</p>
<p>When a life is finished we also receive a coarse, anonymous summary of that game life, used for the "lives just lived" list on the welcome page: the decade of birth (for example "the ’90s"), the Sun sign, the age the character reached, and whether the character married, owned a home and how many kids they had. Nothing in it points back to you: no exact date, time, place, name or text you wrote.</p>
<p>We do not use cookies, advertising IDs, device fingerprinting or tracking pixels, and our code does not log your IP address. Like any website, our hosting provider handles your IP address to deliver the page and to stop abuse (see below).</p>

<h2>AI features</h2>
<p>This version of the site has no AI features. The "write your own decision" box is read by code running in your browser; what you write is not sent anywhere. If we add an AI feature later, we will label its output as AI-generated, name the provider here, and say exactly what is sent before you send it.</p>

<h2>Service providers</h2>
<ul>
<li><b>Cloudflare, Inc.</b> hosts the site and stores the anonymous daily totals. Cloudflare processes technical data such as IP addresses to deliver pages and protect the site from abuse, under its own <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">privacy policy</a>.</li>
<li><b>Google Fonts</b> serves the site's typeface; your browser requests the font files directly from Google.</li>
<li>There is no payment provider and no AI provider at this time.</li>
</ul>

<h2>No sale or sharing</h2>
<p>We do not sell, rent or share personal information, and we do not use it for targeted advertising. We have nothing to sell: we do not collect personal information about you.</p>

<h2>Children</h2>
<p>The site is meant for people 13 and older. We do not knowingly collect personal information from children under 13, and the site does not ask for any. If you believe a child has sent us personal information, contact us and we will delete it.</p>

<h2>Your rights</h2>
<p>Because the site keeps no personal information about you, there is usually nothing for us to access, correct or delete; the data you entered lives only in your browser and you can delete it there. Residents of California and other states with privacy laws may still ask us what we hold, and we will answer. We do not respond differently to "Do Not Track" signals because we do not track you across sites in the first place.</p>

<h2>Changes</h2>
<p>If this policy changes, we will update the date at the top. Material changes will be noted on the site.</p>

<h2>Contact</h2>
<p class="todo">Questions or requests: ${contact} <!-- TODO(owner): set the real contact address in src/legal.js --></p>
`);

export const TERMS_HTML = shell("Terms of Use", `
<h1>Terms of Use</h1>
<p class="updated">Last updated: ${UPDATED}</p>

<h2>A game, for entertainment</h2>
<p class="box">Written in the Stars is a game for entertainment and self-reflection only. Astrology has no proven scientific validity. Nothing here predicts your future or is medical, legal, financial or psychological advice.</p>
<p>The lives you play are fiction. Events such as illness, loss, money trouble or death are simulated from public statistics and chance; they are not predictions about you or anyone you know. Do not make real decisions based on the game. If something in it is hard to read, step away; if you are struggling, call or text <a href="tel:988">988</a> (the Suicide &amp; Crisis Lifeline) any time, or chat at <a href="https://988lifeline.org" rel="noopener">988lifeline.org</a>.</p>

<h2>Using the site</h2>
<ul>
<li>The site is free. You need to be at least 13 to use it.</li>
<li>Don't try to break, overload or reverse-engineer the service, or use it to harm others.</li>
<li>The share cards you create are yours to share. Please don't present them as real predictions.</li>
</ul>

<h2>How the game works</h2>
<p>Your Western birth chart (tropical zodiac, whole sign houses) is calculated in your browser. Each year of a life, the chances of events start from public US statistics, such as Social Security Administration life tables, CDC/NCHS vital statistics and causes of death, Census Bureau data on marriage, education and home ownership, and NBER recession dates. Your chart's yearly timing (annual profections and Saturn and Jupiter transits) tilts those chances by at most a factor of two either way. US government statistics are in the public domain.</p>

<h2>No warranty</h2>
<p>The site is provided "as is", without warranties of any kind. We do our best to keep it working and accurate as a game, but we do not promise that it will be available, error-free, or accurate as astrology or as statistics. To the fullest extent the law allows, we are not liable for any damages arising from your use of the site.</p>

<h2>Credits and licenses</h2>
<p>Planet positions are computed with <a href="https://github.com/cosinekitty/astronomy" rel="noopener">astronomy-engine</a> by Don Cross, used under the MIT License:</p>
<p class="box"><small>MIT License. Copyright (c) 2019-2023 Don Cross. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</small></p>
<p>The typeface is Fraunces, under the SIL Open Font License.</p>

<h2>Privacy</h2>
<p>See the <a href="/privacy">Privacy Policy</a>. In short: your birth data stays on your device.</p>

<h2>Changes</h2>
<p>We may update these terms; the date at the top says when. Continuing to use the site means you accept the current terms.</p>

<h2>Contact</h2>
<p class="todo">${contact} <!-- TODO(owner): set the real contact address in src/legal.js --></p>
`);
