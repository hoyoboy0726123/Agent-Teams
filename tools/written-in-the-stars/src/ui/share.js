// The share card: a 9:16 picture (1080×1920) in the style of a year-in-review story. One big number (the age this
// life reached), the life's label, "in X of my 100 lives…", the Big Three and the site's address. Drawn on a canvas
// so it can be saved as a PNG or handed to the phone's share sheet.

export const CARD_W = 1080, CARD_H = 1920;
const NAVY = "#0b1026", NAVY2 = "#1a2257", GOLD = "#f0cd84", CREAM = "#fbf6ea", LAV = "#c9c2f7", DIM = "#9ea3d6";
const SERIF = `"Fraunces", "Iowan Old Style", Georgia, "Times New Roman", serif`;
const SANS = `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Lines of `text` that fit in `width` at the context's current font.
function wrap(g, text, width) {
  const words = String(text).split(/\s+/), lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// The largest font size (down to `min`) at which `text` fits on one line.
function fit(g, text, font, size, width, min = 24) {
  let s = size;
  for (; s > min; s -= 4) { g.font = font(s); if (g.measureText(text).width <= width) break; }
  g.font = font(s);
  return s;
}

function sunIcon(g, x, y, r, c) { g.strokeStyle = c; g.lineWidth = r * 0.16; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.fillStyle = c; g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill(); }
function moonIcon(g, x, y, r, c) {
  // A crescent: the disc minus an offset disc, clipped to the disc (no hole punched through the sky).
  g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
  g.beginPath(); g.rect(x - r, y - r, 2 * r, 2 * r); g.arc(x + r * 0.45, y - r * 0.2, r * 0.85, 0, Math.PI * 2);
  g.fillStyle = c; g.fill("evenodd"); g.restore();
}
function risingIcon(g, x, y, r, c) { g.strokeStyle = c; g.lineWidth = r * 0.16; g.lineCap = "round"; g.beginPath(); g.moveTo(x - r, y + r * 0.6); g.lineTo(x + r, y + r * 0.6); g.moveTo(x, y + r * 0.3); g.lineTo(x, y - r); g.moveTo(x - r * 0.45, y - r * 0.5); g.lineTo(x, y - r); g.lineTo(x + r * 0.45, y - r * 0.5); g.stroke(); }

// data: { age, title, line, hundred: { n, text } | null, big: { sun, moon, rising }, closes: [mood by year], url, seed }
export function drawShareCard(canvas, data) {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const g = canvas.getContext("2d"), cx = CARD_W / 2, pad = 96, inner = CARD_W - pad * 2;
  // Night sky.
  const sky = g.createLinearGradient(0, 0, 0, CARD_H);
  sky.addColorStop(0, NAVY); sky.addColorStop(0.55, "#121a45"); sky.addColorStop(1, NAVY2);
  g.fillStyle = sky; g.fillRect(0, 0, CARD_W, CARD_H);
  const glow = g.createRadialGradient(cx, 640, 40, cx, 640, 620);
  glow.addColorStop(0, "rgba(240,205,132,0.20)"); glow.addColorStop(1, "rgba(240,205,132,0)");
  g.fillStyle = glow; g.fillRect(0, 0, CARD_W, CARD_H);
  const r = rng(data.seed || 7);
  for (let i = 0; i < 170; i++) {
    const x = r() * CARD_W, y = r() * CARD_H, s = r() < 0.08 ? 2.6 : r() < 0.4 ? 1.6 : 1;
    g.globalAlpha = 0.25 + r() * 0.6; g.fillStyle = r() < 0.15 ? GOLD : "#ffffff";
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  g.textAlign = "center"; g.textBaseline = "alphabetic";

  // Brand.
  g.fillStyle = GOLD; g.font = `600 34px ${SANS}`;
  if ("letterSpacing" in g) g.letterSpacing = "8px";
  g.fillText("WRITTEN IN THE STARS", cx, 150);
  if ("letterSpacing" in g) g.letterSpacing = "0px";
  g.strokeStyle = "rgba(240,205,132,0.45)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - 60, 186); g.lineTo(cx + 60, 186); g.stroke();

  // The big number.
  g.fillStyle = LAV; g.font = `400 54px ${SERIF}`;
  g.fillText("This time, I lived to", cx, 300);
  g.fillStyle = GOLD;
  fit(g, String(data.age), s => `600 ${s}px ${SERIF}`, 470, inner, 200);
  g.fillText(String(data.age), cx, 700);

  // The label.
  g.fillStyle = CREAM;
  fit(g, data.title, s => `italic 500 ${s}px ${SERIF}`, 104, inner, 48);
  g.fillText(data.title, cx, 860);
  g.fillStyle = LAV; g.font = `400 40px ${SANS}`;
  wrap(g, data.line, inner).slice(0, 2).forEach((l, i) => g.fillText(l, cx, 930 + i * 52));

  // The life's mood, year by year.
  const closes = data.closes || [];
  if (closes.length > 1) {
    const top = 1040, h = 150, x0 = pad, w = inner;
    g.strokeStyle = "rgba(201,194,247,0.25)"; g.lineWidth = 2; g.setLineDash([6, 8]);
    g.beginPath(); g.moveTo(x0, top + h / 2); g.lineTo(x0 + w, top + h / 2); g.stroke(); g.setLineDash([]);
    g.strokeStyle = GOLD; g.lineWidth = 5; g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    // Scaled to this life's own range, so its ups and downs show.
    const lo = Math.min(...closes), hi = Math.max(lo + 10, ...closes);
    closes.forEach((v, i) => { const px = x0 + (i / (closes.length - 1)) * w, py = top + h - ((v - lo) / (hi - lo)) * h; i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke();
    g.fillStyle = DIM; g.font = `400 28px ${SANS}`; g.textAlign = "left"; g.fillText("born", x0, top + h + 40);
    g.textAlign = "right"; g.fillText(`age ${data.age}`, x0 + w, top + h + 40); g.textAlign = "center";
  }

  // In X of my 100 lives…
  if (data.hundred) {
    const y0 = 1330;
    g.fillStyle = "rgba(255,255,255,0.06)"; roundRect(g, pad - 24, y0 - 84, inner + 48, 230, 36); g.fill();
    g.fillStyle = CREAM; g.font = `400 46px ${SERIF}`;
    g.fillText(`In ${data.hundred.n} of my 100 lives,`, cx, y0);
    g.fillStyle = GOLD; fit(g, `I ${data.hundred.text}.`, s => `600 ${s}px ${SERIF}`, 64, inner, 36);
    g.fillText(`I ${data.hundred.text}.`, cx, y0 + 84);
  }

  // The Big Three.
  const big = data.big || {}, cols = [["Sun", big.sun, sunIcon], ["Moon", big.moon, moonIcon], ["Rising", big.rising || "unknown", risingIcon]];
  const yb = 1640, colW = inner / 3;
  cols.forEach(([role, sign, icon], i) => {
    const x = pad + colW * i + colW / 2;
    icon(g, x, yb - 72, 26, GOLD);
    g.fillStyle = CREAM; fit(g, sign || "?", s => `500 ${s}px ${SERIF}`, 52, colW - 16, 28); g.fillText(sign || "?", x, yb + 4);
    g.fillStyle = DIM; g.font = `400 28px ${SANS}`; g.fillText(role, x, yb + 46);
  });

  // The site.
  g.fillStyle = LAV; g.font = `400 34px ${SANS}`;
  g.fillText("Is your life written in the stars, or just luck?", cx, 1800, inner);
  g.fillStyle = GOLD; g.font = `600 36px ${SANS}`;
  g.fillText(data.url, cx, 1856, inner);
  return canvas;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export const cardBlob = canvas => new Promise(done => canvas.toBlob(b => done(b), "image/png"));
