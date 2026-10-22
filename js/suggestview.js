/* 「提案」の画面：次の食事に使える量から、コンビニ・自炊・外食の案を出す */
import { h, add, n0, n1, numInput, num, today, hm, toast } from './util.js';
import * as store from './store.js';
import { totals, nextMealBudget, mealNow } from './calc.js';
import { konbini, homeMeals, eatout, EATOUT_TIPS } from './suggest.js';
import { state, rerender } from './state.js';
import { fromDish, amountSheet } from './add.js';

let custom = null;
const sumLine = t => `${n0(t.k)}kcal・たんぱく質 ${n1(t.p)}g・塩分 ${n1(t.s)}g`;

function recordSet(items) {
  const d = today(), t = mealNow();
  const ids = items.map(it => store.addMeal(d, { t, n: it.n, q: it.u || '1人前', k: it.k, p: it.p ?? null, f: it.f ?? null, c: it.c ?? null, s: it.s ?? null, src: it.key || 'suggest',
    base: { kind: it.key ? 'dish' : 'label', key: it.key || 'suggest', unit: { k: it.k, p: it.p ?? null, f: it.f ?? null, c: it.c ?? null, s: it.s ?? null }, amt: 1, uName: it.u || '1人前' }, at: hm() }).id);
  toast(`記録した：${items.length}品 ${n0(items.reduce((a, x) => a + x.k, 0))}kcal`, () => { ids.forEach(id => store.removeMeal(d, id)); rerender(); });
  rerender();
}

export function renderSuggest(root) {
  const d = today();
  const day = store.day(d);
  const t = totals(day);
  const tg = store.targetFor(d);
  const remain = tg ? tg.k + t.ex - t.k : null;
  const nm = remain != null ? nextMealBudget(remain, day) : null;
  let budget;
  if (custom) budget = custom;
  else if (!tg) budget = 600;
  else budget = state.sugMode === 'all' ? Math.max(0, remain) : Math.round(nm.kcal);
  const pRemain = tg && tg.pfc ? Math.max(0, tg.pfc.p - t.p) : null;
  const pNext = pRemain != null && nm && nm.left ? pRemain / nm.left : pRemain;

  const inp = numInput({ placeholder: 'kcal', 'aria-label': '使う量（kcal）', value: custom ? String(custom) : '' });
  inp.addEventListener('change', () => { const v = num(inp.value); custom = v && v >= 100 ? Math.min(v, 3000) : null; setTimeout(rerender, 0); });
  const modeChips = tg ? h('div', { class: 'chips', role: 'radiogroup' },
    [['next', '次の1食'], ['all', '今日の残り全部']].map(([k, l]) => h('button', { class: 'chip' + (!custom && state.sugMode === k ? ' on' : ''), text: l, on: { click: () => { custom = null; state.sugMode = k; rerender(); } } }))) : null;

  const headCard = h('section', { class: 'sug-head' },
    h('p', { class: 'sub', text: tg ? (nm.left ? `今日の残り ${n0(Math.max(0, remain))}kcal・あと${nm.left}食` : `今日の残り ${n0(Math.max(0, remain))}kcal`) : '目標を決めると、残りの量に合わせて出せる（今は600kcalで提案）' }),
    h('p', { class: 'big' }, h('small', { text: '使えるのは' }), h('strong', { text: n0(budget) }), h('small', { text: 'kcal' })),
    pNext ? h('p', { class: 'eq', text: `たんぱく質はあと ${n0(pNext)}g くらいとりたい` }) : null,
    modeChips,
    h('div', { class: 'amt-line' }, h('span', { text: '自分で決める' }), inp, h('span', { text: 'kcal' })),
    tg && remain <= 0 ? h('p', { class: 'callout soft', text: '今日はもう目安に届いてる。おなかがすいたら、野菜スティック・ゆで卵・無糖ヨーグルト・スープなど軽い物にしよう' }) : null);

  const seg = h('div', { class: 'seg', role: 'tablist' }, [['konbini', 'コンビニ'], ['home', '自炊'], ['out', '外食']].map(([k, l]) =>
    h('button', { class: 'seg-btn' + (state.sugTab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(state.sugTab === k), text: l, on: { click: () => { state.sugTab = k; rerender(); } } })));
  const body = h('div', { class: 'sug-body' });
  const b = Math.max(budget, 150);

  if (state.sugTab === 'konbini') {
    const list = konbini(b, pNext || 0);
    if (!list.length) add(body, h('p', { class: 'note', text: 'この量に合う組み合わせがなかった。量を増やすか、単品（サラダチキン・ゆで卵・スープ春雨など）にしよう' }));
    list.forEach(c => add(body, h('article', { class: 'combo' },
      h('ul', {}, c.items.map(it => h('li', {}, h('span', { text: it.n }), h('small', { text: n0(it.k) + 'kcal' })))),
      h('p', { class: 'combo-sum', text: sumLine(c.t) }),
      h('button', { class: 'btn ghost', text: 'これを食べた（記録）', on: { click: () => recordSet(c.items) } }))));
    add(body, h('p', { class: 'note', text: 'コンビニの商品は店や時期で違う。買ったら袋の成分表示で直すと正確' }));
  } else if (state.sugTab === 'home') {
    const { sets, singles } = homeMeals(b);
    if (sets.length) add(body, h('h2', { text: '献立の組み合わせ' }));
    sets.forEach(st => add(body, h('article', { class: 'combo' },
      h('ul', {}, st.items.map(it => h('li', {}, h('span', { text: it.n }), h('small', { text: n0(it.k) + 'kcal' + (it.time ? `・${it.time}分` : '') })))),
      h('p', { class: 'combo-sum', text: sumLine(st.t) }),
      h('button', { class: 'btn ghost', text: 'これを食べた（記録）', on: { click: () => recordSet(st.items) } }))));
    add(body, h('h2', { text: 'レシピ（1人分）' }));
    if (!singles.length) add(body, h('p', { class: 'note', text: 'この量に合うレシピがなかった' }));
    singles.forEach(r => add(body, h('details', { class: 'recipe' },
      h('summary', {}, h('span', { text: r.n }), h('small', { text: `${n0(r.k)}kcal・たんぱく質${r.p}g・${r.time}分` })),
      h('h3', { text: '材料' }), h('ul', {}, r.items.map(x => h('li', { text: x }))),
      h('h3', { text: '作り方' }), h('ol', {}, r.steps.map(x => h('li', { text: x }))),
      h('button', { class: 'btn ghost', text: 'これを食べた（記録）', on: { click: () => recordSet([r]) } }))));
  } else {
    const picks = eatout(b);
    add(body, h('h2', { text: 'この量に収まるメニュー' }));
    if (!picks.length) add(body, h('p', { class: 'note', text: '外食の1食は500kcal以上のことが多い。この量なら、そば・うどん・定食のごはん少なめが近い' }));
    add(body, h('ul', { class: 'list' }, picks.map(dd => h('li', {}, h('button', { class: 'item', on: { click: () => amountSheet(fromDish(dd), { date: today(), meal: mealNow() }) } },
      h('span', { class: 'item-n' }, h('span', { text: dd.n }), h('small', { text: `たんぱく質${n1(dd.p)}g・塩分${n1(dd.s)}g` })), h('span', { class: 'item-k', text: n0(dd.k) + 'kcal' }))))));
    add(body, h('h2', { text: 'お店ごとのコツ' }));
    EATOUT_TIPS.forEach(g => add(body, h('details', { class: 'recipe' }, h('summary', {}, h('span', { text: g.g })), h('ul', {}, g.tips.map(x => h('li', { text: x }))))));
  }
  add(root, h('header', { class: 'dayhead' }, h('h1', { text: '次は何を食べる？' })), headCard, seg, body);
}
