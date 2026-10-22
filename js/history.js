/* カレンダーとグラフ */
import { h, add, n0, n1, today, addDays, diffDays, parse, jdate, weekStart, pad } from './util.js';
import * as store from './store.js';
import { totals, dayLevel, trend, projection } from './calc.js';
import { lineChart, barChart } from './charts.js';
import { state, rerender } from './state.js';

const info = d => { const v = store.day(d); const t = totals(v); const tg = store.targetFor(d); const budget = tg ? tg.k + t.ex : null; return { t, tg, budget, lvl: dayLevel(t.k, budget, t.n) }; };

export function streak() {
  let d = today();
  if (!store.day(d).m.length) d = addDays(d, -1);
  let n = 0;
  while (store.day(d).m.length) { n++; d = addDays(d, -1); }
  return n;
}

export function renderCalendar(root) {
  const base = state.calMonth || today().slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const days = new Date(y, m, 0).getDate();
  const lead = (parse(first).getDay() + 6) % 7;
  const move = k => { const dt = new Date(y, m - 1 + k, 1); state.calMonth = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`; rerender(); };
  const grid = h('div', { class: 'cal', role: 'grid', 'aria-label': `${y}年${m}月` },
    ['月', '火', '水', '木', '金', '土', '日'].map(w => h('span', { class: 'cal-wd', role: 'columnheader', text: w })));
  for (let i = 0; i < lead; i++) add(grid, h('span', { class: 'cal-pad' }));
  let recDays = 0, okDays = 0, sum = 0;
  for (let i = 1; i <= days; i++) {
    const d = `${y}-${pad(m)}-${pad(i)}`;
    const fut = d > today();
    const x = fut ? null : info(d);
    if (x && x.t.n) { recDays++; sum += x.t.k; if (x.lvl === 'ok') okDays++; }
    add(grid, h('button', { class: `cal-d ${x ? x.lvl : 'future'}${d === today() ? ' today' : ''}`, role: 'gridcell', disabled: fut,
      'aria-label': `${jdate(d)} ${x && x.t.n ? n0(x.t.k) + 'kcal' : '記録なし'}`, on: { click: () => { state.cur = d; state.tab = 'today'; rerender(); } } },
      h('b', { text: String(i) }), x && x.t.n ? h('small', { text: n0(x.t.k) }) : null));
  }
  const weeks = [];
  for (let ws = weekStart(first); ws <= `${y}-${pad(m)}-${pad(days)}` && ws <= today(); ws = addDays(ws, 7)) {
    if (!store.targetFor(ws)) continue;
    const done = addDays(ws, 6) < today();
    let saved = 0, any = false;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      if (d >= today()) break;          // 今日はまだ途中なので入れない
      const x = info(d);
      if (x.t.n && x.budget != null) { saved += x.budget - x.t.k; any = true; }
    }
    if (!any) continue;
    weeks.push(h('li', {}, h('span', { text: `${jdate(ws, false)}〜${jdate(addDays(ws, 6), false)}` }), h('strong', { class: saved >= 0 ? 'plus' : 'minus', text: (saved >= 0 ? '+' : '−') + n0(Math.abs(saved)) + 'kcal' }), done ? null : h('small', { text: '途中' })));
  }
  add(root,
    h('header', { class: 'dayhead' },
      h('button', { class: 'icon-btn', 'aria-label': '前の月', text: '‹', on: { click: () => move(-1) } }),
      h('h1', { text: `${y}年${m}月` }),
      h('button', { class: 'icon-btn', 'aria-label': '次の月', text: '›', disabled: base >= today().slice(0, 7), on: { click: () => move(1) } })),
    h('section', { class: 'card-flat' }, grid,
      h('ul', { class: 'legend' }, [['ok', '目安以内'], ['near', '少しオーバー（1割まで）'], ['over', 'オーバー'], ['none', '記録なし']].map(([c, t]) => h('li', { class: c }, h('i'), t)))),
    h('section', { class: 'stats' },
      h('div', {}, h('strong', { text: String(streak()) }), h('span', { text: '日 連続で記録中' })),
      h('div', {}, h('strong', { text: String(recDays) }), h('span', { text: '日 記録した' })),
      h('div', {}, h('strong', { text: String(okDays) }), h('span', { text: '日 目安以内' })),
      h('div', {}, h('strong', { text: recDays ? n0(sum / recDays) : '—' }), h('span', { text: 'kcal 1日平均' }))),
    h('section', { class: 'side-block share-block' }, h('h2', { text: '友達に見せる' }),
      h('p', { class: 'note', text: '1週間の成績を画像にして、LINEなどで送れる。名前・今の体重・食べた物は載らない' }),
      h('button', { class: 'btn ghost wide', text: '今週の成績を画像にする', on: { click: () => import('./report.js').then(m => m.reportSheet()) } })),
    weeks.length ? h('section', { class: 'side-block' }, h('h2', { text: '週ごとのカロリー貯金' }), h('ul', { class: 'weeks' }, weeks),
      h('p', { class: 'note', text: '貯金＝その日に使える量 − 食べた量 の合計。プラスなら食べ過ぎていない' })) : null);
}

export function renderGraph(root) {
  const range = state.graphRange;
  const end = today();
  const ws = store.weights();
  const start = range ? addDays(end, -range + 1) : (ws[0] ? ws[0][0] : addDays(end, -29));
  const span = Math.max(6, diffDays(start, end));
  const X = d => diffDays(start, d);
  const xLabels = [];
  const stepD = Math.max(1, Math.round(span / 4));
  for (let i = 0; i <= span; i += stepD) { const d = parse(addDays(start, i)); xLabels.push([i, `${d.getMonth() + 1}/${d.getDate()}`]); }
  const p = store.profile();
  const inR = ws.filter(w => w[0] >= start);
  const tr = trend(ws).filter(x => x[0] >= start);
  const pr = projection(ws, p?.goalW);
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': '期間' },
    [[30, '1か月'], [90, '3か月'], [365, '1年'], [0, '全部']].map(([v, l]) => h('button', { class: 'chip' + (range === v ? ' on' : ''), role: 'radio', 'aria-checked': String(range === v), text: l, on: { click: () => { state.graphRange = v; rerender(); } } })));
  const wBlock = h('section', { class: 'side-block' }, h('h2', { text: '体重' }));
  if (inR.length) {
    add(wBlock, lineChart({
      label: '体重のグラフ', xMin: 0, xMax: span, xLabels,
      series: [{ pts: inR.map(w => [X(w[0]), w[1]]), cls: 'raw', dots: true, line: false }, { pts: tr.map(x => [X(x[0]), x[1]]), cls: 'trend' }],
      goal: p?.goalW ? { y: p.goalW, label: `目標 ${n1(p.goalW)}kg` } : null
    }), h('p', { class: 'note', text: '点が毎日の体重、線が日々のブレをならした「傾向」。体重は水分などで1〜2kgは上下するので、線を見よう' }));
    if (pr) add(wBlock, h('p', { class: 'lead', text: `この3週間の傾向：1週間で ${pr.weekKg <= 0 ? '−' : '+'}${n1(Math.abs(pr.weekKg))}kg` + (pr.date ? `。このペースだと目標に届くのは ${jdate(pr.date, false)}ごろ` : '') }));
    else add(wBlock, h('p', { class: 'note', text: '2週間くらい記録すると、目標に届く日の予想が出る' }));
  } else add(wBlock, h('p', { class: 'note', text: 'この期間の体重の記録がない。「今日」の画面の「体重」から記録できる' }));
  const fat = inR.filter(w => w[2] != null);
  const fBlock = fat.length ? h('section', { class: 'side-block' }, h('h2', { text: '体脂肪率' }),
    lineChart({ label: '体脂肪率のグラフ', xMin: 0, xMax: span, xLabels, series: [{ pts: fat.map(w => [X(w[0]), w[2]]), cls: 'fat', dots: true }] })) : null;
  const N = 14, bars = [], line = [], kl = [];
  for (let i = N - 1; i >= 0; i--) {
    const d = addDays(end, -i);
    const x = info(d);
    bars.push({ v: x.t.n ? x.t.k : 0, cls: x.lvl, label: `${jdate(d)} ${n0(x.t.k)}kcal` });
    line.push(x.budget);
    if ((N - 1 - i) % 3 === 0) { const dt = parse(d); kl.push([N - 1 - i, `${dt.getMonth() + 1}/${dt.getDate()}`]); }
  }
  const kBlock = h('section', { class: 'side-block' }, h('h2', { text: '食べたカロリー（2週間）' }),
    barChart({ label: '2週間の食べたカロリー', bars, line, xLabels: kl }),
    h('p', { class: 'note', text: '棒が食べた量、線がその日に使える量（目安＋運動）' }));
  add(root, h('header', { class: 'dayhead' }, h('h1', { text: 'グラフ' })), chips, wBlock, fBlock, kBlock);
}
