/* 今週の成績を画像にする。画像はスマホの中で作り、載せる物は自分で選ぶ。
   名前・実際の体重・食べた物は載せない（体重は選んだ時だけ「増減」を載せる） */
import { h, add, clear, sheet, toast, n0, n1, today, addDays, weekStart, parse, WD, jdate } from './util.js';
import * as store from './store.js';
import { totals, dayLevel } from './calc.js';

const C = { paper: '#f5f7fb', surface: '#ffffff', ink: '#1b2940', sub: '#5a6a81', ai: '#23457a', aiSoft: '#e2e9f4', line: '#d6deea',
  ok: '#2c8a57', near: '#c98a12', over: '#c9392a', none: '#b9c8de' };
const FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif';

function streakNow() {
  let d = today();
  if (!store.day(d).m.length) d = addDays(d, -1);
  let n = 0;
  while (store.day(d).m.length && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}

/* 1週間（月曜はじまり）のまとめ。今日はまだ途中なので「目安以内」には数えない */
export function weekData(ws) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const t = totals(store.day(d));
    const tg = store.targetFor(d);
    const budget = tg ? tg.k + t.ex : null;
    const fut = d > today();
    days.push({ d, fut, isToday: d === today(), n: t.n, k: t.k, budget, lvl: fut ? 'future' : dayLevel(t.k, budget, t.n), ratio: !t.n ? 0 : budget ? t.k / budget : 0.6 });
  }
  const done = days.filter(x => !x.fut && !x.isToday);
  const rec = days.filter(x => x.n && !x.fut);
  const recDone = done.filter(x => x.n);
  const okDays = done.filter(x => x.lvl === 'ok').length;
  const hasTarget = days.some(x => x.budget);
  const avg = recDone.length ? recDone.reduce((a, x) => a + x.k, 0) / recDone.length : null;
  const ws_ = store.weights();
  const end = addDays(ws, 6);
  const inWeek = ws_.filter(w => w[0] >= ws && w[0] <= end);
  const before = ws_.filter(w => w[0] < ws).pop();
  let wDiff = null;
  if (inWeek.length && before) wDiff = inWeek[inWeek.length - 1][1] - before[1];
  else if (inWeek.length >= 2) wDiff = inWeek[inWeek.length - 1][1] - inWeek[0][1];
  return { ws, end, days, recDays: rec.length, judged: done.length, okDays, hasTarget, avg, wDiff: wDiff == null ? null : Math.round(wDiff * 10) / 10, streak: streakNow() };
}

const cheer = w => {
  if (!w.recDays) return 'まずは1日、記録してみよう';
  if (!w.hasTarget) return `${w.recDays}日記録できた！`;
  const r = w.judged ? w.okDays / w.judged : 0;
  return r >= 1 && w.judged >= 5 ? 'パーフェクト！ 腹八分の達人' : r >= 0.7 ? 'いい感じ！ この調子' : r >= 0.4 ? 'まずまず。あと少し！' : '来週は1日ずつ、ゆっくりいこう';
};

function rr(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/* 小さなお茶碗（アプリのメーターと同じ考え方：満ちるほど食べた。あふれたらオーバー） */
function bowl(ctx, cx, top, x) {
  const R = 50, rim = top, depth = 62;
  const shape = () => { ctx.beginPath(); ctx.moveTo(cx - R, rim); ctx.bezierCurveTo(cx - R, rim + depth * 1.45, cx + R, rim + depth * 1.45, cx + R, rim); ctx.closePath(); };
  // 中身
  ctx.save(); shape(); ctx.clip();
  ctx.fillStyle = C.surface; ctx.fillRect(cx - R, rim, R * 2, depth + 20);
  if (x.n && !x.fut) {
    const col = x.lvl === 'ok' ? C.ok : x.lvl === 'near' ? C.near : x.lvl === 'over' ? C.over : C.ai;
    const r = Math.min(1, x.ratio);
    const y = rim + depth * 1.1 - r * (depth * 1.1);
    ctx.fillStyle = col; ctx.globalAlpha = x.isToday ? 0.55 : 0.9;
    ctx.fillRect(cx - R, y, R * 2, depth + 20);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // ふち
  ctx.lineWidth = 5; ctx.strokeStyle = x.fut ? C.line : C.ai;
  ctx.beginPath(); ctx.moveTo(cx - R, rim); ctx.bezierCurveTo(cx - R, rim + depth * 1.45, cx + R, rim + depth * 1.45, cx + R, rim); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - R - 6, rim); ctx.lineTo(cx + R + 6, rim); ctx.stroke();
  // 足
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - 20, rim + depth + 6); ctx.lineTo(cx - 17, rim + depth + 16); ctx.lineTo(cx + 17, rim + depth + 16); ctx.lineTo(cx + 20, rim + depth + 6); ctx.stroke();
  // あふれ
  if (x.lvl === 'over' && !x.fut) {
    ctx.fillStyle = C.over;
    ctx.beginPath(); ctx.moveTo(cx + R - 10, rim - 2); ctx.quadraticCurveTo(cx + R + 12, rim - 6, cx + R + 10, rim + 18);
    ctx.arc(cx + R + 6, rim + 22, 6, 0, Math.PI); ctx.quadraticCurveTo(cx + R + 2, rim + 6, cx + R - 10, rim + 4); ctx.fill();
  }
}

export async function drawWeek(canvas, w, o) {
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const range = `${jdate(w.ws, false)}〜${jdate(w.end, false)}`;
  const lines = ['今週のはらはちぶ', range, cheer(w), o.comment || '', '目安以内連続で記録した日1日の平均体重の変化先週からkcalgはらはちぶ・記録はスマホの中だけ月火水木金土日途中0123456789+−.'];
  try { await Promise.all([document.fonts.load(`700 64px ${FONT}`, lines.join('')), document.fonts.load(`500 32px ${FONT}`, lines.join(''))]); } catch { }
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.surface; rr(ctx, 48, 48, W - 96, H - 96, 44); ctx.fill();
  ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ai; ctx.font = `700 66px ${FONT}`; ctx.fillText(o.title || '今週のはらはちぶ', W / 2, 180);
  ctx.fillStyle = C.sub; ctx.font = `500 34px ${FONT}`; ctx.fillText(range, W / 2, 236);
  // 7日のお茶碗
  const gap = 132, x0 = W / 2 - gap * 3;
  w.days.forEach((x, i) => {
    const cx = x0 + gap * i;
    bowl(ctx, cx, 330, x);
    ctx.fillStyle = x.isToday ? C.ai : C.sub; ctx.font = `700 34px ${FONT}`;
    ctx.fillText(WD[parse(x.d).getDay()], cx, 470);
    if (x.isToday) { ctx.font = `500 24px ${FONT}`; ctx.fillText('途中', cx, 504); }
  });
  // 凡例
  ctx.font = `500 24px ${FONT}`; ctx.textAlign = 'left';
  const leg = w.hasTarget ? [[C.ok, '目安以内'], [C.near, '少しオーバー'], [C.over, 'オーバー']] : [[C.ai, '記録した日（目標を決めると色で出る）']];
  let lx = W / 2 - (w.hasTarget ? 300 : 230);
  leg.forEach(([c, t]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx, 552, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = C.sub; ctx.fillText(t, lx + 20, 561); lx += 40 + ctx.measureText(t).width + 30; });
  // 大きな数字
  const tile = (x, label, big, unit) => {
    ctx.fillStyle = C.aiSoft; rr(ctx, x, 610, 420, 230, 30); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.sub; ctx.font = `500 30px ${FONT}`; ctx.fillText(label, x + 210, 670);
    ctx.fillStyle = C.ai; ctx.font = `700 110px ${FONT}`; const bw = ctx.measureText(big).width;
    ctx.fillText(big, x + 210 - 22, 800);
    ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(unit, x + 210 - 22 + bw / 2 + 8, 800);
  };
  if (w.hasTarget) tile(100, '目安以内だった日', String(w.okDays), `/${w.judged}日`);
  else tile(100, '記録した日', String(w.recDays), '日');
  tile(560, '連続で記録', String(w.streak), '日');
  // 選んだ物だけ
  let y = 920;
  ctx.textAlign = 'left';
  const row = (label, val) => {
    ctx.fillStyle = C.sub; ctx.font = `500 34px ${FONT}`; ctx.fillText(label, 130, y);
    ctx.fillStyle = C.ink; ctx.font = `700 44px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(val, W - 130, y); ctx.textAlign = 'left';
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(130, y + 26); ctx.lineTo(W - 130, y + 26); ctx.stroke();
    y += 84;
  };
  if (o.avg && w.avg != null) row('1日の平均', `${n0(w.avg)} kcal`);
  if (o.weight && w.wDiff != null) row('体重の変化（先週から）', `${w.wDiff > 0 ? '+' : w.wDiff < 0 ? '−' : '±'}${n1(Math.abs(w.wDiff))} kg`);
  // ひとこと
  ctx.textAlign = 'center';
  const msg = o.comment || cheer(w);
  ctx.fillStyle = C.ai; ctx.font = `700 ${msg.length > 16 ? 40 : 48}px ${FONT}`;
  ctx.fillText(msg, W / 2, Math.max(y + 40, 1130));
  ctx.fillStyle = C.sub; ctx.font = `500 26px ${FONT}`; ctx.fillText('はらはちぶ・記録はスマホの中だけ', W / 2, H - 92);
  return canvas;
}

/* 共有の画面 */
export function reportSheet() {
  let which = 0, avg = false, weight = false;
  const canvas = document.createElement('canvas');
  const img = h('img', { class: 'report-img', alt: '今週の成績の画像' });
  const comment = h('input', { type: 'text', maxlength: 24, placeholder: 'ひとこと（なくてもOK・24文字まで）', autocomplete: 'off', 'aria-label': 'ひとこと' });
  let url = null, busy = 0;
  const redraw = async () => {
    const my = ++busy;
    const ws = addDays(weekStart(today()), which ? -7 : 0);
    await drawWeek(canvas, weekData(ws), { avg, weight, comment: comment.value.trim(), title: which ? '先週のはらはちぶ' : '今週のはらはちぶ' });
    if (my !== busy) return;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    img.src = url;
    img.dataset.ready = '1';
    redraw.blob = blob;
  };
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'どの週' });
  const drawChips = () => { clear(chips); [[0, '今週'], [1, '先週']].forEach(([v, l]) => add(chips, h('button', { class: 'chip' + (which === v ? ' on' : ''), role: 'radio', 'aria-checked': String(which === v), text: l, on: { click: () => { which = v; drawChips(); redraw(); } } }))); };
  drawChips();
  let timer;
  comment.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(redraw, 250); });
  const share = async () => {
    if (!redraw.blob) return;
    const file = new File([redraw.blob], `harahachibu-${weekStart(today())}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: url, download: file.name });
    document.body.append(a); a.click(); a.remove();
    toast('画像を保存した');
  };
  sheet('成績を画像にする', [
    chips,
    h('div', { class: 'report-opts' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', on: { change: e => { avg = e.target.checked; redraw(); } } }), '1日の平均カロリーも載せる'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', on: { change: e => { weight = e.target.checked; redraw(); } } }), '体重の変化も載せる（増えた・減った分だけ。今の体重は載せない）'),
      comment),
    img,
    h('button', { class: 'btn primary wide', text: '共有する（LINEなど）', on: { click: share } }),
    h('p', { class: 'note', text: '画像はこのスマホの中で作っている。名前・今の体重・食べた物は載らない。送る相手は共有の画面で自分で選ぶ' })
  ], { tall: true, onClose: () => url && URL.revokeObjectURL(url) });
  redraw();
}
