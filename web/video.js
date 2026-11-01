// Video artifacts: a JSON storyboard (scenes with layout, text, visuals and narration) rendered
// as an animated, deterministic player. The same page is recorded frame by frame for MP4 export,
// so everything on screen is a pure function of the playhead time.
import { esc } from './md.js';

export const FORMATS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
export const LAYOUTS = ['title', 'bullets', 'stat', 'quote', 'image', 'chart', 'split', 'clip', 'end'];

export function parseVideo(content) {
  const src = String(content).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const v = JSON.parse(src);
  if (!Array.isArray(v.scenes) || !v.scenes.length) throw new Error('A video needs a non-empty "scenes" array');
  return v;
}

// Seconds a scene stays on screen: explicit duration, else long enough to read/hear the narration.
export function sceneDuration(s) {
  if (Number(s.duration) > 0) return Math.min(60, Math.max(1.5, Number(s.duration)));
  const text = String(s.narration || '');
  const cjk = (text.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
  const words = text.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').split(/\s+/).filter(Boolean).length;
  const est = cjk / 4.2 + words / 2.6 + 1.2;
  return Math.round(Math.min(60, Math.max(s.layout === 'clip' ? 6 : 3.5, est)) * 10) / 10;
}

export const timeline = (v) => {
  let t = 0;
  return v.scenes.map((s) => { const d = sceneDuration(s); const r = { start: t, duration: d }; t += d; return r; });
};

const FONTS = {
  sans: 'system-ui,-apple-system,"Segoe UI","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',
  serif: 'Georgia,"Noto Serif TC","Songti TC",serif',
  rounded: 'ui-rounded,"SF Pro Rounded","Nunito","Noto Sans TC",system-ui,sans-serif',
  mono: 'ui-monospace,"SFMono-Regular",Menlo,monospace',
};

// "37%" → { pre: '', num: 37, dec: 0, post: '%' } so stats can count up.
const splitNumber = (s) => {
  const m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/.exec(String(s ?? ''));
  if (!m) return null;
  return { pre: m[1], num: Number(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, comma: m[2].includes(','), post: m[3] };
};

const cssVal = (v, d) => (/^[#\w(),.%\s-]{1,60}$/.test(String(v || '')) ? String(v) : d);
const safeUrl = (u) => (/^(https?:\/\/|\/media\/|data:image\/)/i.test(String(u || '')) ? String(u) : '');

function sceneHtml(s, i, { chartSvg }) {
  const L = LAYOUTS.includes(s.layout) ? s.layout : 'title';
  const el = (tag, cls, html) => (html ? `<${tag} class="el ${cls}">${html}</${tag}>` : '');
  const icon = s.icon ? `<div class="el icon">${esc(s.icon)}</div>` : '';
  const img = safeUrl(s.image);
  const bgImg = img && L !== 'split' ? `<div class="bgimg kb" style="background-image:url('${esc(img)}')"></div><div class="shade"></div>` : '';
  let inner = '';
  switch (L) {
    case 'bullets':
      inner = `<div class="c left">${icon}${el('h2', '', esc(s.title))}<ul>${(s.items || s.bullets || []).slice(0, 7).map((x) => `<li class="el">${esc(x)}</li>`).join('')}</ul></div>`;
      break;
    case 'stat': {
      const n = splitNumber(s.value);
      const val = n ? `<span class="count" data-to="${n.num}" data-dec="${n.dec}" data-comma="${n.comma ? 1 : 0}" data-pre="${esc(n.pre)}" data-post="${esc(n.post)}">${esc(s.value)}</span>` : esc(s.value);
      inner = `<div class="c center">${icon}${el('div', 'big', val)}${el('div', 'label', esc(s.label || s.title))}${el('p', 'sub', esc(s.caption || s.subtitle))}</div>`;
      break;
    }
    case 'quote':
      inner = `<div class="c center"><blockquote class="el">“${esc(s.text || s.title)}”</blockquote>${el('cite', '', s.author ? `— ${esc(s.author)}` : '')}</div>`;
      break;
    case 'image':
      inner = `<div class="c bottom">${el('h2', '', esc(s.title))}${el('p', 'sub', esc(s.caption || s.subtitle))}</div>`;
      break;
    case 'chart':
      inner = `<div class="c left chartwrap">${el('h2', '', esc(s.title || s.chart?.title))}<div class="el chart${(s.chart?.series || []).length <= 1 && s.chart?.type !== 'pie' ? ' single' : ''}">${s.chart ? chartSvg({ ...s.chart, title: s.title || s.chart.title }) : ''}</div>${el('p', 'sub', esc(s.caption))}</div>`;
      break;
    case 'split':
      inner = `<div class="c splitgrid"><div>${icon}${el('h2', '', esc(s.title))}${el('p', 'sub', esc(s.subtitle))}<ul>${(s.items || []).slice(0, 5).map((x) => `<li class="el">${esc(x)}</li>`).join('')}</ul></div>${img ? `<div class="el pic kbwrap"><div class="kb" style="background-image:url('${esc(img)}')"></div></div>` : ''}</div>`;
      break;
    case 'clip': {
      const src = safeUrl(s.clip || s.src);
      inner = `${src ? `<video class="clip" src="${esc(src)}" muted playsinline preload="auto" data-offset="${Number(s.from) || 0}"></video>` : ''}<div class="shade light"></div><div class="c bottom">${el('h2', '', esc(s.title))}${el('p', 'sub', esc(s.caption))}</div>`;
      break;
    }
    case 'end':
      inner = `<div class="c center">${icon}${el('h1', '', esc(s.title))}<div class="el rule"></div>${el('p', 'sub', esc(s.subtitle || s.cta))}</div>`;
      break;
    default:
      inner = `<div class="c center">${icon}${el('div', 'kicker', esc(s.kicker))}${el('h1', '', esc(s.title))}${el('p', 'sub', esc(s.subtitle))}</div>`;
  }
  const bg = s.bg ? ` style="--sbg:${esc(cssVal(s.bg, 'var(--bg)'))}"` : '';
  return `<section class="scene l-${L}" data-i="${i}" data-anim="${esc(s.animation || 'rise')}"${bg}>${bgImg}${inner}</section>`;
}

export function renderVideo(a, { page, chartSvg }) {
  let v;
  try { v = parseVideo(a.content); } catch (e) {
    return page(a.title, `<main style="padding:32px"><h2>${esc(a.title)}</h2><p>Video storyboard could not be parsed: ${esc(e.message)}</p><pre>${esc(a.content)}</pre></main>`);
  }
  const [W, H] = FORMATS[v.format] || FORMATS['16:9'];
  const th = v.theme || {};
  const tl = timeline(v);
  const portrait = H > W;
  const css = `
html,body{height:100%;margin:0;background:#000;overflow:hidden}
.stage{position:absolute;left:50%;top:50%;width:${W}px;height:${H}px;transform-origin:center;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font)}
:root{--bg:${cssVal(th.bg, '#0f172a')};--fg:${cssVal(th.fg, '#f8fafc')};--accent:${cssVal(th.accent, '#f59e0b')};--font:${FONTS[th.font] || FONTS.sans};--card:rgba(255,255,255,.06);--line:rgba(255,255,255,.15)}
.scene{position:absolute;inset:0;opacity:0;background:var(--sbg,var(--bg));display:flex}
.scene::before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 80% 15%,color-mix(in srgb,var(--accent) 28%,transparent),transparent 45%),radial-gradient(circle at 10% 90%,color-mix(in srgb,var(--accent) 16%,transparent),transparent 40%);pointer-events:none}
.c{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;width:100%;padding:${portrait ? '140px 90px' : '110px 150px'}}
.center{align-items:center;text-align:center}.left{align-items:flex-start}.bottom{justify-content:flex-end;padding-bottom:${portrait ? 260 : 150}px}
h1{font-size:${portrait ? 108 : 118}px;line-height:1.08;margin:.1em 0;font-weight:800;letter-spacing:-.02em;max-width:92%}
h2{font-size:${portrait ? 78 : 76}px;line-height:1.12;margin:0 0 .45em;font-weight:750;letter-spacing:-.01em}
.sub{font-size:${portrait ? 46 : 42}px;opacity:.82;margin:.4em 0 0;max-width:85%;line-height:1.35}
.kicker{font-size:30px;letter-spacing:.28em;text-transform:uppercase;color:var(--accent);font-weight:700}
.icon{font-size:${portrait ? 150 : 130}px;line-height:1;margin-bottom:24px}
ul{list-style:none;padding:0;margin:0}li{font-size:${portrait ? 50 : 48}px;margin:.42em 0;padding-left:1.1em;position:relative;line-height:1.3}
li::before{content:"";position:absolute;left:0;top:.5em;width:.42em;height:.42em;border-radius:50%;background:var(--accent)}
.big{font-size:${portrait ? 240 : 250}px;font-weight:850;line-height:1;color:var(--accent);letter-spacing:-.03em}
.label{font-size:${portrait ? 58 : 56}px;font-weight:650;margin-top:22px}
blockquote{font-size:${portrait ? 70 : 72}px;line-height:1.3;font-weight:600;margin:0;max-width:88%;font-family:${FONTS.serif}}
cite{display:block;font-size:40px;margin-top:40px;color:var(--accent);font-style:normal}
.rule{width:180px;height:10px;border-radius:5px;background:var(--accent);margin:30px 0}
.bgimg,.kb{position:absolute;inset:0;background-size:cover;background-position:center}.shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.15) 60%)}.shade.light{background:linear-gradient(to top,rgba(0,0,0,.6),transparent 45%)}
.l-image .c,.l-clip .c{color:#fff}
.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.splitgrid{display:grid;grid-template-columns:${portrait ? '1fr' : '1.1fr .9fr'};gap:70px;align-items:center}
.pic{position:relative;height:${portrait ? 700 : 760}px;border-radius:36px;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.35)}
.chartwrap{justify-content:center}.chart{width:100%;background:var(--card);border:2px solid var(--line);border-radius:30px;padding:40px 50px;font-size:22px}
.chart svg{width:100%;height:auto;max-height:${portrait ? 900 : 620}px;overflow:visible}.chart text{font-size:13px}.chart .legend{display:flex;gap:30px;font-size:30px;margin-top:16px;opacity:.85}.chart .legend i{display:inline-block;width:22px;height:22px;border-radius:6px;margin-right:10px}
.chart rect{transform-box:fill-box;transform-origin:bottom}.chart.single rect,.chart.single circle{fill:var(--accent)}.chart.single polyline{stroke:var(--accent)}
.captions{position:absolute;left:8%;right:8%;bottom:${portrait ? 150 : 60}px;z-index:5;text-align:center;pointer-events:none}
.captions span{display:inline;background:rgba(0,0,0,.66);color:#fff;font-size:${portrait ? 44 : 38}px;line-height:1.6;padding:.12em .45em;border-radius:10px;-webkit-box-decoration-break:clone;box-decoration-break:clone;font-family:${FONTS.sans}}
.progress{position:absolute;left:0;bottom:0;height:8px;background:var(--accent);z-index:6;opacity:.9}
.bar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;padding:10px 14px;background:linear-gradient(to top,rgba(0,0,0,.75),transparent);color:#fff;font:13px system-ui;transition:opacity .3s;z-index:10}
.bar button{background:rgba(255,255,255,.14);border:0;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:14px}.bar button.off{opacity:.45}
.bar input{flex:1;accent-color:var(--accent)}.idle .bar{opacity:0}
.big-play{position:fixed;inset:0;margin:auto;width:92px;height:92px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:38px;cursor:pointer;z-index:9}
`;
  const body = `<div class="stage" id="stage">${v.scenes.map((s, i) => sceneHtml(s, i, { chartSvg })).join('')}<div class="captions" id="cap"></div><div class="progress" id="prog"></div></div>
<button class="big-play" id="bigplay" aria-label="Play">▶</button>
<div class="bar" id="bar"><button id="pp" aria-label="Play">▶</button><span id="tm">0:00</span><input id="seek" type="range" min="0" max="${tl.at(-1).start + tl.at(-1).duration}" step="0.01" value="0" aria-label="Seek"><button id="cc" title="Captions">CC</button><button id="vo" title="Narration (browser voice)">🔈</button><button id="fs" title="Fullscreen">⛶</button></div>`;
  const data = { W, H, scenes: v.scenes.map((s, i) => ({ ...tl[i], narration: String(s.narration || '') })), captions: v.captions !== false };
  return page(v.title || a.title, body, css, `(${player.toString()})(${JSON.stringify(data).replace(/</g, '\\u003c')})`);
}

// Runs inside the rendered page (serialized with toString — keep it self-contained).
function player(D) {
  const stage = document.getElementById('stage');
  const scenes = [...document.querySelectorAll('.scene')];
  const total = D.scenes.at(-1).start + D.scenes.at(-1).duration;
  const exporting = /export/.test(location.hash) || window.__EXPORT === true;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let captions = D.captions, voice = false, playing = false, t = 0, last = 0, spoken = -1;

  function fit() {
    const k = Math.min(innerWidth / D.W, innerHeight / D.H);
    stage.style.transform = `translate(-50%,-50%) scale(${k})`;
  }

  function numberText(el, p) {
    const to = +el.dataset.to, dec = +el.dataset.dec;
    let s = (to * p).toFixed(dec);
    if (el.dataset.comma === '1') s = Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    el.textContent = el.dataset.pre + s + el.dataset.post;
  }

  function draw(time) {
    t = Math.max(0, Math.min(total, time));
    let active = 0;
    scenes.forEach((el, i) => {
      const { start, duration } = D.scenes[i];
      const lt = t - start;
      const last = i === scenes.length - 1;
      const visible = lt >= 0 && (lt <= duration + 0.5 || last);
      if (lt >= 0 && lt < duration) active = i;
      if (last && t >= total) active = i;
      el.style.opacity = visible ? (i === 0 ? 1 : ease(clamp(lt / 0.45))) : 0;
      el.style.zIndex = i;
      if (!visible) return;
      const anim = el.dataset.anim;
      el.querySelectorAll('.el').forEach((e, k) => {
        const p = ease(clamp((lt - 0.15 - k * 0.16) / 0.55));
        e.style.opacity = p;
        e.style.transform = anim === 'zoom' ? `scale(${0.9 + 0.1 * p})` : anim === 'slide' ? `translateX(${(1 - p) * -80}px)` : anim === 'fade' ? 'none' : `translateY(${(1 - p) * 50}px)`;
      });
      el.querySelectorAll('.count').forEach((c) => numberText(c, ease(clamp((lt - 0.35) / 1.3))));
      const pc = ease(clamp((lt - 0.5) / 1.1));
      el.querySelectorAll('.chart rect').forEach((r) => { r.style.transform = `scaleY(${pc})`; });
      el.querySelectorAll('.chart polyline').forEach((l) => { l.setAttribute('pathLength', '1'); l.style.strokeDasharray = '1'; l.style.strokeDashoffset = String(1 - pc); });
      el.querySelectorAll('.chart circle,.chart path').forEach((c) => { c.style.opacity = pc; });
      el.querySelectorAll('.kb').forEach((k) => { k.style.transform = `scale(${1.03 + 0.07 * clamp(lt / duration)})`; });
    });
    const cap = document.getElementById('cap');
    const text = captions ? D.scenes[active].narration : '';
    if (cap.dataset.i !== `${active}:${captions}`) { cap.dataset.i = `${active}:${captions}`; cap.innerHTML = ''; if (text) { const s = document.createElement('span'); s.textContent = text; cap.append(s); } }
    const prog = document.getElementById('prog');
    if (prog) prog.style.width = `${(t / total) * 100}%`;
    const seek = document.getElementById('seek');
    if (seek && document.activeElement !== seek) seek.value = t;
    const tm = document.getElementById('tm');
    if (tm) tm.textContent = `${fmt(t)} / ${fmt(total)}`;
    return active;
  }

  // Clips follow the playhead: exact seeks while exporting, loose sync while playing.
  function syncClips(active, exact) {
    const waits = [];
    scenes.forEach((el, i) => {
      el.querySelectorAll('video.clip').forEach((v) => {
        const want = Math.max(0, t - D.scenes[i].start) + (+v.dataset.offset || 0);
        if (i !== active) { if (!v.paused) v.pause(); return; }
        if (exact) {
          if (Math.abs(v.currentTime - want) > 0.001) {
            waits.push(new Promise((r) => { const done = () => { v.removeEventListener('seeked', done); r(); }; v.addEventListener('seeked', done); setTimeout(done, 3000); }));
            v.currentTime = want;
          }
        } else if (playing) {
          if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want;
          if (v.paused) v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      });
    });
    return Promise.all(waits);
  }

  function speak(i) {
    if (!voice || !('speechSynthesis' in window) || spoken === i) return;
    spoken = i;
    speechSynthesis.cancel();
    const text = D.scenes[i].narration;
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[㐀-鿿]/.test(text) ? 'zh-TW' : 'en-US';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  function frame(now) {
    if (!playing) return;
    t += (now - last) / 1000;
    last = now;
    if (t >= total) { t = total; setPlaying(false); }
    const a = draw(t);
    syncClips(a, false);
    speak(a);
    requestAnimationFrame(frame);
  }

  function setPlaying(on) {
    playing = on;
    document.getElementById('pp').textContent = on ? '❚❚' : '▶';
    document.getElementById('bigplay').style.display = on ? 'none' : '';
    if (on) {
      if (t >= total) t = 0;
      spoken = -1;
      document.querySelectorAll('video.clip').forEach((v) => { v.muted = false; });
      last = performance.now();
      requestAnimationFrame(frame);
    } else {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      syncClips(draw(t), false);
    }
  }

  window.__video = {
    duration: total,
    width: D.W,
    height: D.H,
    scenes: D.scenes.map(({ start, duration }) => ({ start, duration })),
    async seek(time) {
      const a = draw(time);
      await syncClips(a, true);
      if (document.fonts?.ready) await document.fonts.ready;
    },
  };

  addEventListener('resize', fit);
  fit();
  draw(0);
  if (exporting) {
    document.getElementById('bar').remove();
    document.getElementById('bigplay').remove();
    document.getElementById('prog').remove();
    return;
  }
  const toggle = () => setPlaying(!playing);
  document.getElementById('pp').onclick = toggle;
  document.getElementById('bigplay').onclick = toggle;
  stage.onclick = toggle;
  document.getElementById('seek').oninput = (e) => { t = +e.target.value; spoken = -1; if ('speechSynthesis' in window) speechSynthesis.cancel(); syncClips(draw(t), false); };
  const cc = document.getElementById('cc');
  cc.classList.toggle('off', !captions);
  cc.onclick = () => { captions = !captions; cc.classList.toggle('off', !captions); draw(t); };
  const vo = document.getElementById('vo');
  vo.classList.add('off');
  vo.onclick = () => { voice = !voice; vo.classList.toggle('off', !voice); vo.textContent = voice ? '🔊' : '🔈'; spoken = -1; if (!voice && 'speechSynthesis' in window) speechSynthesis.cancel(); };
  document.getElementById('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    if (e.key === 'ArrowRight') { t = Math.min(total, t + 5); draw(t); }
    if (e.key === 'ArrowLeft') { t = Math.max(0, t - 5); draw(t); }
  });
  let idle;
  addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => playing && document.body.classList.add('idle'), 2200); });
}
