/* 小さな道具：DOMを作る・日付・数字の表示・トースト */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'data') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
export function add(el, ...kids) {
  el.append(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== true).map(k => (typeof k === 'number' ? String(k) : k)));
  return el;
}
export const svgNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(svgNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  add(el, kids);
  return el;
}
export const clear = el => { el.replaceChildren(); return el; };

/* 数字 */
export const n0 = x => Math.round(x || 0).toLocaleString('ja-JP');
export const n1 = x => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 1 }));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const num = v => {
  if (v == null) return null;
  const t = String(v).normalize('NFKC').replace(/[,，\s]/g, '').replace(/[^\d.\-]/g, '');
  if (t === '' || t === '-' || t === '.') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};

/* 日付は端末の時刻（日本時間など）で YYYY-MM-DD */
export const pad = x => String(x).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (s, k) => { const d = parse(s); d.setDate(d.getDate() + k); return ymd(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const jdate = (s, withWd = true) => { const d = parse(s); return `${d.getMonth() + 1}月${d.getDate()}日` + (withWd ? `（${WD[d.getDay()]}）` : ''); };
export const jdateY = s => { const d = parse(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
export const weekStart = s => { const d = parse(s); const k = (d.getDay() + 6) % 7; return addDays(s, -k); }; // 月曜はじまり
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

let toastTimer;
export function toast(msg, undo) {
  const t = document.getElementById('toast');
  clear(t);
  add(t, h('span', { text: msg }), undo && h('button', { class: 'link', text: '元に戻す', on: { click: () => { undo(); t.classList.remove('show'); } } }));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2600);
}

/* 下から出るシート。閉じたら onClose */
const stack = [];
/* シートが開いている間は、後ろの画面とほかのシートを操作できないようにする */
function setInert() {
  const open = stack.length > 0;
  ['view', 'tabs'].forEach(id => { const el = document.getElementById(id); if (el) el.inert = open; });
  document.querySelectorAll('.sheet-wrap').forEach(w => { w.inert = open && w !== stack[stack.length - 1]?.wrap; });
}
export function sheet(title, body, { onClose, tall = false, cls = '' } = {}) {
  const prevFocus = document.activeElement;
  const close = () => {
    const i = stack.indexOf(api);
    if (i < 0) return;
    stack.splice(i, 1);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    document.body.classList.toggle('sheeted', stack.length > 0);
    setInert();
    onClose && onClose();
    prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
  };
  const head = h('header', { class: 'sheet-head' },
    h('h2', { text: title, id: 'sh' + stack.length }),
    h('button', { class: 'icon-btn', 'aria-label': '閉じる', on: { click: close } }, '×'));
  const panel = h('div', { class: 'sheet ' + (tall ? 'tall ' : '') + cls, tabindex: '-1', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sh' + stack.length }, head, h('div', { class: 'sheet-body' }, body));
  const wrap = h('div', { class: 'sheet-wrap', on: { click: e => { if (e.target === wrap) close(); } } }, panel);
  const api = { close, panel, wrap, body: panel.querySelector('.sheet-body'), setTitle: t => (head.firstChild.textContent = t) };
  stack.push(api);
  document.body.append(wrap);
  document.body.classList.add('sheeted');
  setInert();
  requestAnimationFrame(() => { wrap.classList.add('open'); panel.focus({ preventScroll: true }); });
  return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
export const closeAllSheets = () => [...stack].reverse().forEach(s => s.close());

/* はい・いいえを聞く（window.confirm は使わない） */
export function ask(title, text, okText = 'はい', { danger = false, cancelText = 'やめる' } = {}) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (done) return; done = true; res(v); sh.close(); };
    const sh = sheet(title, [
      h('p', { class: 'lead', text }),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn ghost', text: cancelText, on: { click: () => fin(false) } }),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), text: okText, on: { click: () => fin(true) } }))
    ], { onClose: () => { if (!done) { done = true; res(false); } } });
  });
}

/* 数字入力欄（スマホで数字キーボードが出る） */
export function numInput(attrs = {}) {
  return h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', ...attrs });
}
export function field(label, input, hint) {
  const id = input.id || (input.id = 'f' + uid());
  return h('div', { class: 'field' }, h('label', { for: id, text: label }), input, hint && h('small', { text: hint }));
}
