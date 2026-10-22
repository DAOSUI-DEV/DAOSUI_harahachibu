/* SVGのグラフ（ライブラリなし） */
import { s } from './util.js';

const W = 340, H = 190, L = 34, R = 10, T = 12, B = 24;
function ticks(min, max, n = 4) {
  const span = max - min || 1;
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/* 折れ線：series = [{ pts: [[x, y]], cls, dots, line }]、x は数字（日数） */
export function lineChart({ series, xMin, xMax, yMin, yMax, xLabels = [], goal, label }) {
  const allY = series.flatMap(se => se.pts.map(p => p[1])).concat(goal ? [goal.y] : []);
  if (yMin == null) yMin = Math.min(...allY);
  if (yMax == null) yMax = Math.max(...allY);
  const padY = Math.max((yMax - yMin) * 0.12, 0.5);
  yMin -= padY; yMax += padY;
  const X = x => L + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - L - R);
  const Y = y => T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B);
  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label || 'グラフ' });
  for (const v of ticks(yMin, yMax)) {
    g.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' }));
    g.append(s('text', { x: L - 6, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, String(v)));
  }
  for (const [x, t] of xLabels) g.append(s('text', { x: X(x), y: H - 6, class: 'tick', 'text-anchor': 'middle' }, t));
  if (goal) {
    g.append(s('line', { x1: L, x2: W - R, y1: Y(goal.y), y2: Y(goal.y), class: 'goal' }));
    g.append(s('text', { x: W - R, y: Y(goal.y) - 5, class: 'goal-t', 'text-anchor': 'end' }, goal.label));
  }
  for (const se of series) {
    if (!se.pts.length) continue;
    if (se.line !== false && se.pts.length > 1) g.append(s('path', { d: se.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(''), class: 'ln ' + (se.cls || '') }));
    if (se.dots) for (const p of se.pts) g.append(s('circle', { cx: X(p[0]), cy: Y(p[1]), r: se.r || 2.6, class: 'dot ' + (se.cls || '') }));
  }
  return g;
}

/* 棒グラフ：bars = [{ v, cls, label }]、line = 目安の線（日ごとに違ってOK） */
export function barChart({ bars, line, label, xLabels = [] }) {
  const max = Math.max(1, ...bars.map(b => b.v || 0), ...(line || []).map(v => v || 0)) * 1.12;
  const n = bars.length;
  const bw = (W - L - R) / n;
  const Y = y => T + (1 - y / max) * (H - T - B);
  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label || 'グラフ' });
  for (const v of ticks(0, max, 4)) {
    g.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' }));
    g.append(s('text', { x: L - 6, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, v >= 1000 ? (v / 1000) + 'k' : String(v)));
  }
  bars.forEach((b, i) => {
    if (!b.v) return;
    const x = L + i * bw + bw * 0.18;
    g.append(s('rect', { x, y: Y(b.v), width: bw * 0.64, height: Math.max(0, Y(0) - Y(b.v)), rx: Math.min(3, bw * 0.2), class: 'bar ' + (b.cls || '') }, s('title', {}, b.label || '')));
  });
  if (line) {
    const d = line.map((v, i) => (v ? (i && line[i - 1] ? 'L' : 'M') + (L + i * bw + bw / 2).toFixed(1) + ' ' + Y(v).toFixed(1) : '')).join('');
    g.append(s('path', { d, class: 'target' }));
  }
  for (const [i, t] of xLabels) g.append(s('text', { x: L + i * bw + bw / 2, y: H - 6, class: 'tick', 'text-anchor': 'middle' }, t));
  return g;
}
