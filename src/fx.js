// Fire, heat and ember effects for the Stream Deck keys (144x144).
//
// Pure functions of (frame, heat, palette) -> SVG fragments. No state, no I/O, no
// filters: the Stream Deck renderer cannot be trusted with feGaussianBlur, so a flame
// is stacked tongues (outer / mid / core) with translucent fills. Motion uses INTEGER
// harmonics of one FX_FRAMES-long cycle, so the loop is seamless at any frame rate.
//
// `heat` (0..1) is the story: how long something has waited on you, or how full a
// limit is. More heat = taller, brighter, busier flames.

export const FX_FRAMES = 24;
const TAU = Math.PI * 2;
const f1 = (n) => String(Math.round(n * 10) / 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wave = (frame, k, ph = 0) => Math.sin(((frame % FX_FRAMES) / FX_FRAMES) * TAU * k + ph);

// Palettes: [outer, mid, core]. Colour still means state (see keyart rule 1):
// warm = waiting on you, violet = a question for you, blue = working, green = done.
export const FIRE = {
  warn: ["#dc2626", "#f97316", "#fde68a"],
  ask: ["#7e22ce", "#a855f7", "#f3e8ff"],
  info: ["#1d4ed8", "#60a5fa", "#dbeafe"],
  ok: ["#15803d", "#4ade80", "#dcfce7"],
  bad: ["#991b1b", "#f87171", "#fee2e2"],
  dim: ["#3a3745", "#6b6679", "#9b96a8"],
};

// One flame tongue with its base on y0 and its tip swaying by `sway`.
function tongue(cx, y0, w, h, sway, col, op) {
  const tip = cx + sway;
  const mid = cx + sway * 0.5;
  return `<path d="M${f1(cx - w / 2)} ${f1(y0)}` +
    ` C${f1(cx - w / 2)} ${f1(y0 - h * 0.35)} ${f1(mid - w * 0.22)} ${f1(y0 - h * 0.62)} ${f1(tip)} ${f1(y0 - h)}` +
    ` C${f1(mid + w * 0.22)} ${f1(y0 - h * 0.62)} ${f1(cx + w / 2)} ${f1(y0 - h * 0.35)} ${f1(cx + w / 2)} ${f1(y0)} Z"` +
    ` fill="${col}" opacity="${op.toFixed(2)}"/>`;
}

// A row of flames along a baseline. Three stacked layers per position, each with its
// own flicker, taller in the middle of the row and shorter at the edges.
export function fireBed(frame, heat, pal, o = {}) {
  const { y0 = 144, x0 = 6, x1 = 138, n = 6, maxH = 76, op = 0.6 } = o;
  const hh = clamp(heat, 0.08, 1);
  const step = (x1 - x0) / n;
  let out = "";
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < n; i++) {
      const cx = x0 + step * (i + 0.5);
      const ph = i * 1.7 + layer * 0.9;
      const env = 0.62 + 0.38 * Math.sin(Math.PI * (i + 0.5) / n);
      const flick = 0.62 + 0.24 * wave(frame, 2, ph) + 0.14 * wave(frame, 3, ph * 2);
      const h = maxH * hh * env * flick * [1, 0.74, 0.46][layer];
      const w = step * [1.55, 1.05, 0.55][layer];
      const sway = step * 0.28 * wave(frame, 1, ph) * (0.6 + 0.4 * hh);
      out += tongue(cx, y0, w, h, sway, pal[layer], (op * [0.7, 0.85, 1][layer]) * (0.5 + 0.5 * hh));
    }
  }
  return out;
}

// Rising sparks. Each ember loops once per cycle with its own phase and drift, so the
// column never pulses in step. `heat` decides how many are lit.
export function embers(frame, heat, col, o = {}) {
  const { x0 = 10, x1 = 134, yBase = 140, rise = 90, count = 9 } = o;
  const lit = Math.max(1, Math.round(count * clamp(heat, 0, 1)));
  let out = "";
  for (let i = 0; i < lit; i++) {
    const p = (((frame + (i * FX_FRAMES) / count) % FX_FRAMES) + FX_FRAMES) % FX_FRAMES / FX_FRAMES;
    const bx = x0 + (((i * 53) % 100) / 100) * (x1 - x0);
    const x = bx + 7 * Math.sin(p * TAU + i);
    const y = yBase - p * rise * (0.7 + 0.3 * (((i * 37) % 100) / 100));
    const r = 0.8 + 2.2 * (1 - p);
    out += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${col}" opacity="${((1 - p) * 0.9).toFixed(2)}"/>`;
  }
  return out;
}

// Flames riding the leading edge of a gauge bar. They start to lick at 50% and are
// full height at 100%. `fillW` is the drawn width of the filled bar in key units.
export function barFire(frame, pct, fillW, pal) {
  const k = clamp((pct - 50) / 50, 0, 1);
  if (k <= 0) return "";
  const n = 5;
  const span = Math.min(fillW, 64);
  const xEnd = 12 + fillW;
  const x0 = xEnd - span;
  const step = span / n;
  let out = "";
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < n; i++) {
      const cx = x0 + step * (i + 0.5);
      const ph = i * 1.9 + layer;
      const flick = 0.65 + 0.35 * wave(frame, 2, ph);
      const h = (7 + 20 * k) * flick * (layer ? 0.55 : 1) * (0.6 + 0.4 * ((i + 1) / n));
      out += tongue(cx, 94.5, step * (layer ? 0.9 : 1.5), h, step * 0.3 * wave(frame, 1, ph), pal[layer + 1], 0.9 - layer * 0.1);
    }
  }
  return out;
}

// One small flame per session, left to right. The shape tells the story at a glance:
// big orange = approve me, violet = answer me, blue = working, green = done, ember = idle.
const SESSION_LOOK = {
  "needs-approval": { pal: FIRE.warn, heat: 1 },
  "input-needed": { pal: FIRE.ask, heat: 1 },
  working: { pal: FIRE.info, heat: 0.7 },
  finished: { pal: FIRE.ok, heat: 0.4 },
  idle: { pal: FIRE.dim, heat: 0.12 },
};
export function sessionFlames(frame, states, o = {}) {
  const list = states.slice(0, 6);
  if (!list.length) return "";
  const { y0 = 141, x0 = 8, x1 = 136, maxH = 34 } = o;
  const step = Math.min(30, (x1 - x0) / list.length);
  const startX = 72 - (step * list.length) / 2;
  let out = "";
  list.forEach((st, i) => {
    const look = SESSION_LOOK[st] ?? SESSION_LOOK.idle;
    out += fireBed(frame + i * 5, look.heat, look.pal, { y0, x0: startX + step * i, x1: startX + step * (i + 1), n: 1, maxH, op: 0.85 });
  });
  return out;
}
