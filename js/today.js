/* 「今日」の画面：お茶碗メーター・PFC・食事・運動・体重・今週の貯金 */
import { h, add, s, n0, n1, jdate, today, addDays, toast, WD, parse } from './util.js';
import * as store from './store.js';
import { totals, meterLevel, MEALS, bank, mealNow } from './calc.js';
import { state, rerender } from './state.js';
import { addSheet, editSheet, exerciseSheet, weightSheet } from './add.js';

let lastRatio = 0, lastDate = null;

/* お茶碗：食べた量で中身が増える。目安を超えるとあふれる */
function bowl(ratio, lvl) {
  const L = 22, R = 238, RIM = 30, BOT = 114;
  const inner = `M${L} ${RIM} C ${L} 142, ${R} 142, ${R} ${RIM} Z`;
  const yFor = r => (r <= 0 ? BOT + 8 : BOT - Math.min(r, 1) * (BOT - RIM + 2));
  const id = 'bw' + Math.random().toString(36).slice(2, 7);
  const wave = y => `M${L - 4} ${y} q 18 -4 36 0 t 36 0 t 36 0 t 36 0 t 36 0 t 36 0 t 36 0 V 300 H ${L - 4} Z`;
  const fill = s('g', { class: 'bowl-fill ' + lvl, style: `transform: translateY(${yFor(lastDate === state.cur ? lastRatio : 0) - BOT}px)` },
    s('path', { d: wave(BOT) }));
  const svg = s('svg', { viewBox: '0 0 260 140', class: 'bowl', 'aria-hidden': 'true' },
    s('defs', {}, s('clipPath', { id }, s('path', { d: inner }))),
    s('path', { d: 'M98 104 L 103 130 H 157 L 162 104 Z', class: 'bowl-foot' }),
    s('path', { d: inner, class: 'bowl-in' }),
    s('g', { 'clip-path': `url(#${id})` }, fill,
      s('path', { d: `M${L} ${RIM + 9} H ${R}`, class: 'bowl-band' }),
      s('path', { d: `M${L} ${RIM + 14} H ${R}`, class: 'bowl-band thin' })),
    s('path', { d: `M${L} ${RIM} C ${L} 142, ${R} 142, ${R} ${RIM}`, class: 'bowl-line' }),
    s('path', { d: `M${L - 6} ${RIM} H ${R + 6}`, class: 'bowl-rim' }),
    ratio > 1 && s('path', { class: 'spill', d: `M${R - 14} ${RIM - 1} C ${R - 4} ${RIM - 9}, ${R + 10} ${RIM - 6}, ${R + 10} ${RIM + 8} L ${R + 11} ${RIM + 30} a 5 5 0 0 1 -10 0 L ${R + 2} ${RIM + 10} C ${R + 2} ${RIM + 4}, ${R - 4} ${RIM + 2}, ${R - 14} ${RIM + 2} Z` }));
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transform = `translateY(${yFor(ratio) - BOT}px)`; }));
  lastRatio = ratio; lastDate = state.cur;
  return svg;
}

function pfcBars(t, tg) {
  if (!tg || !tg.pfc) return null;
  const row = (label, v, goal, warnHigh = true) => {
    const r = goal ? v / goal : 0;
    return h('div', { class: 'pfc' },
      h('span', { class: 'pfc-l', text: label }),
      h('span', { class: 'pfc-bar' }, h('i', { style: { width: Math.min(100, r * 100) + '%' }, class: warnHigh && r > 1.15 ? 'hi' : '' })),
      h('span', { class: 'pfc-v', text: `${n0(v)} / ${n0(goal)}g` }));
  };
  return h('div', { class: 'pfcs' },
    row('たんぱく質', t.p, tg.pfc.p, false), row('脂質', t.f, tg.pfc.f), row('炭水化物', t.c, tg.pfc.c),
    h('p', { class: 'salt' + (t.s > (store.profile()?.salt || 7.5) ? ' warn' : ''), text: `塩分 ${n1(t.s)}g（1日 ${n1(store.profile()?.salt || 7.5)}g未満が目標）` }),
    t.unknown ? h('p', { class: 'note', text: `たんぱく質などがわからない記録が${t.unknown}件あるので、グラフは少なめに出ている` }) : null);
}

const thumbs = new Map();
function thumb(id) {
  const img = h('img', { class: 'thumb', alt: '', loading: 'lazy' });
  if (thumbs.has(id)) img.src = thumbs.get(id);
  else store.getPhoto(id).then(b => { if (b) { const u = URL.createObjectURL(b); thumbs.set(id, u); img.src = u; } });
  return img;
}

export function renderToday(root) {
  const d = state.cur;
  const isToday = d === today();
  const day = store.day(d);
  const t = totals(day);
  const tg = store.targetFor(d);
  const p = store.profile();
  const budget = tg ? tg.k + t.ex : null;
  const remain = budget != null ? budget - t.k : null;
  const lvl = meterLevel(t.k, budget);
  const ratio = budget ? t.k / budget : Math.min(1, t.k / 2000);

  const head = h('header', { class: 'dayhead' },
    h('button', { class: 'icon-btn', 'aria-label': '前の日', text: '‹', on: { click: () => { state.cur = addDays(d, -1); rerender(); } } }),
    h('h1', {}, h('span', { text: jdate(d) }), isToday ? h('small', { text: '今日' }) : h('button', { class: 'link', text: '今日にもどる', on: { click: () => { state.cur = today(); rerender(); } } })),
    h('button', { class: 'icon-btn', 'aria-label': '次の日', text: '›', disabled: isToday, on: { click: () => { state.cur = addDays(d, 1); rerender(); } } }));

  const meter = h('section', { class: 'meter ' + lvl, 'aria-label': 'この日のカロリー' },
    bowl(ratio, budget ? lvl : 'none'),
    budget != null
      ? [h('p', { class: 'big' }, remain >= 0 ? [h('small', { text: 'あと' }), h('strong', { text: n0(remain) }), h('small', { text: 'kcal' })] : [h('strong', { text: n0(-remain) }), h('small', { text: 'kcal オーバー' })]),
        h('p', { class: 'eq' }, h('span', { text: `目安 ${n0(tg.k)}` }), t.ex ? h('span', { text: ` ＋ 運動 ${n0(t.ex)}` }) : null, h('span', { text: ` − 食べた ${n0(t.k)}` }))]
      : [h('p', { class: 'big' }, h('strong', { text: n0(t.k) }), h('small', { text: 'kcal 食べた' })),
        h('button', { class: 'btn primary', text: '目標を決める', on: { click: () => import('./settings.js').then(m => m.goalSheet()) } }),
        h('p', { class: 'note', text: '目標を決めると「あと何kcal食べられるか」がわかる' })],
    pfcBars(t, tg));

  const meals = h('section', { class: 'meals', 'aria-label': '食べた物' });
  for (const [mt, nm] of MEALS) {
    const items = day.m.filter(e => e.t === mt);
    const sum = items.reduce((a, e) => a + (e.k || 0), 0);
    add(meals, h('div', { class: 'meal' },
      h('div', { class: 'meal-head' },
        h('span', { class: 'stamp' + (nm.length > 1 ? ' long' : ''), text: nm, 'aria-hidden': 'true' }),
        h('h2', { class: 'vh', text: nm }),
        h('span', { class: 'meal-sum', text: items.length ? `${items.length}品・${n0(sum)}kcal` : 'まだ記録なし' }),
        h('button', { class: 'icon-btn add-btn', 'aria-label': nm + 'に記録', text: '＋', on: { click: () => addSheet({ date: d, meal: mt }) } })),
      items.length ? h('ul', { class: 'list' }, items.map(e => h('li', {}, h('button', { class: 'item', on: { click: () => editSheet(d, e) } },
        e.ph ? thumb(e.ph) : null,
        h('span', { class: 'item-n' }, h('span', { text: e.n }), h('small', { text: e.q || '' })),
        h('span', { class: 'item-k', text: n0(e.k) }))))) : null));
  }

  const exs = h('section', { class: 'side-block' },
    h('div', { class: 'block-head' }, h('h2', { text: '運動' }), h('button', { class: 'link', text: '＋ 運動を記録', on: { click: () => exerciseSheet(d) } })),
    day.x.length ? h('ul', { class: 'list' }, day.x.map(x => h('li', { class: 'with-del' },
      h('span', { class: 'item static' }, h('span', { class: 'item-n' }, h('span', { text: x.n }), h('small', { text: x.min + '分' })), h('span', { class: 'item-k', text: '−' + n0(x.k) })),
      h('button', { class: 'icon-btn', 'aria-label': x.n + 'の記録を消す', text: '×', on: { click: () => { const it = store.removeEx(d, x.id); rerender(); toast('消した：' + x.n, () => { store.restoreEx(d, it); rerender(); }); } } })))) : null);

  const w = store.weights().find(x => x[0] === d);
  const prevW = store.latestWeight(addDays(d, -1));
  const wt = h('section', { class: 'side-block' },
    h('div', { class: 'block-head' }, h('h2', { text: '体重' }),
      h('button', { class: 'link', text: w ? '直す' : '＋ 体重を記録', on: { click: () => weightSheet(d) } })),
    w ? h('p', { class: 'weight' }, h('strong', { text: n1(w[1]) }), 'kg', w[2] != null ? h('span', { text: `　体脂肪 ${n1(w[2])}%` }) : null,
      prevW ? h('small', { text: `（前回より ${w[1] - prevW[1] >= 0 ? '+' : '−'}${n1(Math.abs(w[1] - prevW[1]))}kg）` }) : null) : null);

  let bk = null;
  if (tg) {
    const b = bank(tg.k, x => { const dd = store.day(x); return { t: totals(dd), rec: dd.m.length > 0 }; }, d);
    const bmr = p?.bmr || 0;
    bk = h('section', { class: 'bank-mini', 'aria-label': '今週のカロリー貯金' },
      h('div', { class: 'block-head' }, h('h2', { text: '今週のカロリー貯金' }),
        b.savedDays ? h('strong', { class: b.saved >= 0 ? 'plus' : 'minus', text: (b.saved >= 0 ? '+' : '−') + n0(Math.abs(b.saved)) + 'kcal' }) : h('small', { class: 'sub', text: '昨日までの記録から計算' })),
      h('ol', { class: 'week' }, b.days.map(x => h('li', { class: (x.isToday ? 'today ' : '') + (x.diff == null || x.isToday ? 'none' : x.diff >= 0 ? 'plus' : 'minus') },
        h('span', { text: WD[parse(x.d).getDay()] }),
        h('i', { style: { height: x.diff == null || x.isToday ? '0' : Math.max(3, Math.min(28, Math.abs(x.diff) / 25)) + 'px' } })))),
      b.future
        ? h('p', { class: 'note', text: `明日から日曜までの${b.future}日は、1日 ${n0(Math.max(0, b.perDay))}kcal で今週ぴったり（月曜はじまり。記録がない日は目安どおり食べたとみなす）` })
        : h('p', { class: 'note', text: `今週はあと ${n0(Math.max(0, b.remain))}kcal（今日で今週はおしまい）` }),
      bmr && b.future && b.perDay < bmr ? h('p', { class: 'warn', text: `1日 ${n0(bmr)}kcal（基礎代謝）より少なくするのは体に良くない。食べ過ぎた分は来週にも分けて、ゆっくり戻そう` }) : null);
  }

  const hour = new Date().getHours();
  const tooLittle = p?.bmr && t.n > 0 && (d < today() || hour >= 20) && t.k < p.bmr * 0.8;
  const notes = [
    tooLittle && h('p', { class: 'callout', text: `この日は${n0(t.k)}kcal。記録し忘れた物はない？ 基礎代謝（約${n0(p.bmr)}kcal）より少ない日が続くと、筋肉が落ちたり体調をくずしやすいよ` }),
    lvl === 'over' && isToday && h('p', { class: 'callout soft', text: '今日はオーバー。明日からの数日で少しずつ戻せばOK。1日で取り戻そうとしないでね' })
  ];

  add(root, head, meter, notes, meals, exs, wt, bk,
    h('button', { class: 'fab', on: { click: () => addSheet({ date: d, meal: isToday ? mealNow() : 'd' }) } }, h('span', { text: '＋', 'aria-hidden': 'true' }), '食べた物を記録'));
}
