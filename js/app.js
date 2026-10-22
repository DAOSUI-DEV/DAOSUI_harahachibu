/* はらはちぶ：起動・タブの切りかえ */
import { h, add, clear, today, toast, sheet, s } from './util.js';
import * as store from './store.js';
import * as foods from './foods.js';
import { state, setRender } from './state.js';
import { renderToday } from './today.js';
import { renderCalendar, renderGraph } from './history.js';
import { renderSuggest } from './suggestview.js';
import { renderSettings, goalSheet } from './settings.js';

const ic = d => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'tab-ic' }, s('path', { d }));
const TABS = [
  ['today', '今日', 'M3 10h18M4.5 10c0 5 3.3 8 7.5 8s7.5-3 7.5-8M9 21h6M12 18v3', renderToday],
  ['cal', 'カレンダー', 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5', renderCalendar],
  ['graph', 'グラフ', 'M3 19h18M5 15l4-5 4 3 6-7', renderGraph],
  ['sug', '提案', 'M6 21 15 3M10 21 19 3M4 21h16', renderSuggest],
  ['set', '設定', 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6', renderSettings]
];

const view = document.getElementById('view');
const nav = document.getElementById('tabs');
let lastTab = null;
function render() {
  const keep = state.tab === lastTab ? window.scrollY : 0;
  clear(view);
  const t = TABS.find(x => x[0] === state.tab) || TABS[0];
  document.body.dataset.tab = t[0];
  try { t[3](view); } catch (e) { console.error(e); add(view, h('p', { class: 'err', text: '画面を表示できなかった：' + e.message })); }
  [...nav.children].forEach(b => b.setAttribute('aria-current', b.dataset.tab === t[0] ? 'page' : 'false'));
  if (state.tab !== lastTab) window.scrollTo(0, 0); else window.scrollTo(0, keep);
  lastTab = state.tab;
}
setRender(render);
TABS.forEach(([k, l, d]) => add(nav, h('button', { data: { tab: k }, on: { click: () => { if (k === 'today' && state.tab === 'today') state.cur = today(); state.tab = k; render(); } } }, ic(d), h('span', { text: l }))));
store.onError(msg => toast(msg));

/* 日付が変わったら「今日」に合わせる */
let seenToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = today();
  if (t !== seenToday) { if (state.cur === seenToday) state.cur = t; seenToday = t; render(); }
});

function welcome() {
  const sh = sheet('はらはちぶへようこそ', [
    h('ul', { class: 'welcome' },
      h('li', {}, h('b', { text: '食べた物を記録すると、お茶碗が満ちていく。' }), 'あふれたら食べ過ぎのサイン。'),
      h('li', {}, h('b', { text: '記録はこのスマホの中だけ。' }), 'サーバーにも誰にも送らない。ログインもいらない。'),
      h('li', {}, h('b', { text: 'ホーム画面に追加して使ってね。' }), 'Safariの共有ボタン →「ホーム画面に追加」。記録が消えにくくなる。')),
    h('div', { class: 'row-btns col' },
      h('button', { class: 'btn primary', text: '目標を決める', on: { click: () => { store.setSettings({ onboarded: true }); sh.close(); goalSheet(); } } }),
      h('button', { class: 'btn ghost', text: 'あとで（記録だけ始める）', on: { click: () => { store.setSettings({ onboarded: true }); sh.close(); } } }))
  ], { onClose: () => store.setSettings({ onboarded: true }) });
}

render();
foods.load().catch(() => {});
if (!store.settings().onboarded) welcome();
try { navigator.storage?.persisted?.().then(p => { if (!p) navigator.storage.persist?.(); }); } catch { }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
