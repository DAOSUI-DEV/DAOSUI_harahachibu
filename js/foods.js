/* 食品の一覧と検索
   - 成分表（日本食品標準成分表（八訂）増補2023年）：100gあたりの値。量（g）を選んで計算
   - 料理・コンビニの目安（dishes.js）：1人前の値。×0.5〜×2 で調整 */
import { DISHES } from '../data/dishes.js';
import * as store from './store.js';

let MEXT = null, loading = null, CITE = '';
export const cite = () => CITE;

export function load() {
  if (MEXT) return Promise.resolve(MEXT);
  if (!loading) loading = fetch(new URL('../data/foods.json', import.meta.url)).then(r => {
    if (!r.ok) throw new Error('食品データを読み込めなかった（' + r.status + '）');
    return r.json();
  }).then(d => {
    CITE = d.cite;
    MEXT = d.foods.map(r => {
      const [no, name, nice, g, k, p, f, c, fib, s, refuse, units, syn] = r;
      const n = nice || name;
      return { key: 'm:' + no, kind: 'mext', no, n, sub: nice ? name : '', g: d.groups[g], k, p, f, c, fib, s, refuse, units, common: !!nice,
        hay: norm([n, name, syn].join(' ')) };
    });
    return MEXT;
  }).catch(e => { loading = null; throw e; });
  return loading;
}
const DISH = DISHES.map(x => ({ ...x, key: 'd:' + x.id, kind: 'dish', hay: norm([x.n, x.y, x.g].join(' ')) }));
export const dishes = () => DISH;
export const dishByName = n => DISH.find(x => x.n === n);
export const byKey = key => (key.startsWith('d:') ? DISH.find(x => x.key === key) : (MEXT || []).find(x => x.key === key));

/* 表記ゆれをそろえる：全角半角・カタカナ→ひらがな・小文字・記号とスペースを消す */
export function norm(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・、。,.()（）［］\[\]「」『』/／〜~\-－]/g, '');
}
/* 「豚ロース」→「豚」「ろーす」のように、漢字とかなの境目で分ける */
const script = ch => (/[一-鿿々]/.test(ch) ? 'k' : /[぀-ゟ]/.test(ch) ? 'h' : 'o');
function split(t) {
  const out = [];
  let cur = '', sc = '';
  for (const ch of t) { const x = ch === 'ー' ? sc : script(ch); if (cur && x !== sc) { out.push(cur); cur = ''; } cur += ch; sc = x; }
  if (cur) out.push(cur);
  return out.filter(x => x.length > 0);
}
function tokenMatch(hay, tok) {
  if (hay.includes(tok)) return 2;
  const parts = split(tok);
  return parts.length > 1 && parts.every(p => hay.includes(p)) ? 1 : 0;
}

/* 検索。マイメニュー → 料理の目安 → 成分表 の順に、よく合う物を上に */
export function search(q, limit = 60) {
  const toks = String(q || '').normalize('NFKC').split(/\s+/).map(norm).filter(Boolean);
  if (!toks.length) return [];
  const res = [];
  const score = (item, hay, nameN, base) => {
    let sc = 0;
    for (const t of toks) { const m = tokenMatch(hay, t); if (!m) return -1; sc += m; }
    if (nameN.startsWith(toks[0])) sc += 3;
    else if (nameN.includes(toks[0])) sc += 1.5;
    return sc + base - Math.min(nameN.length, 40) / 40;
  };
  for (const m of store.mine()) {
    const nn = norm(m.n);
    const sc = score(m, nn, nn, 6);
    if (sc >= 0) res.push({ sc, item: { ...m, key: 'my:' + m.id, kind: 'mine' } });
  }
  for (const d of DISH) {
    const sc = score(d, d.hay, norm(d.n), 3);
    if (sc >= 0) res.push({ sc, item: d });
  }
  for (const f of MEXT || []) {
    const sc = score(f, f.hay, norm(f.n), f.common ? 2.5 : 0);
    if (sc >= 0) res.push({ sc, item: f });
  }
  res.sort((a, b) => b.sc - a.sc);
  return res.slice(0, limit).map(r => r.item);
}

/* 量を決めた時の栄養。mext は g、dish/mine は 倍率 */
export function scaled(item, amount) {
  if (item.kind === 'mext') {
    const r = amount / 100;
    const v = x => (x == null ? null : Math.round(x * r * 10) / 10);
    return { k: Math.round(item.k * r), p: v(item.p), f: v(item.f), c: v(item.c), s: v(item.s) };
  }
  const v = x => (x == null ? null : Math.round(x * amount * 10) / 10);
  return { k: Math.round(item.k * amount), p: v(item.p), f: v(item.f), c: v(item.c), s: v(item.s) };
}
