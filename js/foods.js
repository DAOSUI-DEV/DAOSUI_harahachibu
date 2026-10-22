/* 食品の一覧と検索
   - 成分表（日本食品標準成分表（八訂）増補2023年）：100gあたりの値。量（g）を選んで計算
   - 料理・コンビニの目安（dishes.js）：1人前の値。×0.5〜×2 で調整
   - チェーン店のメニュー（chains.json）：各社が公開している栄養成分。1品の値 */
import { DISHES } from '../data/dishes.js';
import * as store from './store.js';

let MEXT = null, loading = null, CITE = '';
export const cite = () => CITE;

export function load() {
  if (MEXT) return Promise.resolve(MEXT);
  if (!loading) loading = Promise.all([
    fetch(new URL('../data/foods.json', import.meta.url)).then(r => { if (!r.ok) throw new Error('食品データを読み込めなかった（' + r.status + '）'); return r.json(); }),
    fetch(new URL('../data/dishes-more.json', import.meta.url)).then(r => (r.ok ? r.json() : { rows: [] })).catch(() => ({ rows: [] })),
    fetch(new URL('../data/chains.json', import.meta.url)).then(r => (r.ok ? r.json() : { chains: [], rows: [] })).catch(() => ({ chains: [], rows: [] }))
  ]).then(([d, more, ch]) => {
    CITE = d.cite;
    MEXT = d.foods.map(r => {
      const [no, name, nice, g, k, p, f, c, fib, s, refuse, units, syn] = r;
      const n = nice || name;
      return { key: 'm:' + no, kind: 'mext', no, n, sub: nice ? name : '', g: d.groups[g], k, p, f, c, fib, s, refuse, units, common: !!nice,
        hay: norm([n, name, syn].join(' ')) };
    });
    MORE = (more.rows || []).map((r, i) => ({ id: 'x' + i, n: r[0], k: r[1], p: r[2], f: r[3], c: r[4], s: r[5], u: r[6], g: r[7], y: r[8], r: r[9],
      src: 'dish', key: 'd:x' + i, kind: 'dish', calc: String(r[8]).includes('成分表から計算'), hay: norm([r[0], r[8], r[7]].join(' ')) }));
    CHAINS = ch.chains || [];
    /* 店ごとの並び順（元の表は定番が上）を覚えておき、店の名前だけで探した時に定番から出す */
    const cnt = {}, pos = {};
    (ch.rows || []).forEach(r => (cnt[r[7]] = (cnt[r[7]] || 0) + 1));
    CHAIN = (ch.rows || []).map(r => {
      const c = CHAINS[r[7]] || {};
      const i = (pos[r[7]] = (pos[r[7]] || 0) + 1) - 1;
      return { key: 'c:' + c.id + ':' + r[0], kind: 'dish', n: r[0], k: r[1], p: r[2], f: r[3], c: r[4], s: r[5], u: r[6], g: c.n, sub: c.n,
        chain: c.n, csrc: c.src, cdate: c.date, ord: 1 - i / cnt[r[7]], hay: norm([r[0], c.n, c.y].join(' ')) };
    });
    /* dishes.js にも同じ商品がある時（例：ビッグマック）は、公式の値のほうだけ出す */
    const same = new Set(CHAIN.map(x => x.chain + '|' + norm(x.n)));
    HIDE = new Set(DISH.filter(d => CHAINS.some(c => String(d.y).includes(c.n) && same.has(c.n + '|' + norm(d.n)))).map(d => d.key));
    return MEXT;
  }).catch(e => { loading = null; throw e; });
  return loading;
}
let MORE = [], CHAIN = [], CHAINS = [], HIDE = new Set();
export const moreCount = () => MORE.length;
/* チェーン店の一覧（設定の「出典」用） */
export const chainInfo = () => CHAINS.map((c, i) => ({ n: c.n, src: c.src, url: c.url, date: c.date, count: CHAIN.filter(x => x.chain === c.n).length }));
const DISH = DISHES.map(x => ({ ...x, key: 'd:' + x.id, kind: 'dish', hay: norm([x.n, x.y, x.g].join(' ')) }));

/* Open Food Facts（日本の商品・ODbL）。GitHub Actions が毎月 data/off-jp.json を作り直す。大きいので必要になってから読む */
let OFF = null, OFF_BY = null, offLoading = null, OFF_MADE = '';
export const offInfo = () => (OFF ? { n: OFF.length, made: OFF_MADE } : null);
export function loadOff() {
  if (OFF) return Promise.resolve(OFF);
  if (!offLoading) offLoading = fetch(new URL('../data/off-jp.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).then(d => {
    const items = (d && d.items) || [];
    OFF_MADE = (d && d.made) || '';
    OFF = items.map(r => {
      const [code, name, brand, k, p, f, c, s, serv, pkg] = r;
      return { key: 'o:' + code, kind: 'off', code, n: name, brand, k, p, f, c, s, serv, pkg, hay: norm(name + ' ' + brand) };
    });
    OFF_BY = new Map(OFF.map(o => [o.code, o]));
    return OFF;
  }).catch(() => { OFF = []; OFF_BY = new Map(); return OFF; });
  return offLoading;
}
/* バーコード（JAN）から探す：自分で登録した物 → Open Food Facts の順 */
export async function byCode(code) {
  const mine = store.janGet(code);
  if (mine) return { kind: 'jan', item: mine };
  await loadOff();
  const o = OFF_BY.get(code) || (code.length === 12 ? OFF_BY.get('0' + code) : null) || (code.length === 13 && code[0] === '0' ? OFF_BY.get(code.slice(1)) : null);
  return o ? { kind: 'off', item: o } : null;
}
export const dishes = () => DISH;
export const dishByName = n => DISH.find(x => x.n === n);
export const byKey = key => (key.startsWith('d:') ? DISH.find(x => x.key === key) || MORE.find(x => x.key === key) : key.startsWith('c:') ? CHAIN.find(x => x.key === key) : (MEXT || []).find(x => x.key === key));

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

/* 検索。マイメニュー → 料理の目安 → チェーン店 → 成分表 → 商品 の順に、よく合う物を上に */
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
    if (HIDE.has(d.key)) continue;
    const sc = score(d, d.hay, norm(d.n), 3);
    if (sc >= 0) res.push({ sc, item: d });
  }
  for (const d of MORE) {
    const sc = score(d, d.hay, norm(d.n), 2.8);
    if (sc >= 0) res.push({ sc, item: d });
  }
  for (const d of CHAIN) {
    const sc = score(d, d.hay, norm(d.n), 2.5 + d.ord * 0.3);
    if (sc >= 0) res.push({ sc, item: d });
  }
  for (const f of MEXT || []) {
    const sc = score(f, f.hay, norm(f.n), f.common ? 2.5 : 0);
    if (sc >= 0) res.push({ sc, item: f });
  }
  for (const o of OFF || []) {
    const sc = score(o, o.hay, norm(o.n), 1.2);
    if (sc >= 0) res.push({ sc, item: o });
  }
  res.sort((a, b) => b.sc - a.sc);
  return res.slice(0, limit).map(r => r.item);
}

/* 量を決めた時の栄養。mext は g、dish/mine は 倍率 */
export function scaled(item, amount) {
  if (item.kind === 'mext' || item.kind === 'off') {
    const r = amount / 100;
    const v = x => (x == null ? null : Math.round(x * r * 10) / 10);
    return { k: Math.round(item.k * r), p: v(item.p), f: v(item.f), c: v(item.c), s: v(item.s) };
  }
  const v = x => (x == null ? null : Math.round(x * amount * 10) / 10);
  return { k: Math.round(item.k * amount), p: v(item.p), f: v(item.f), c: v(item.c), s: v(item.s) };
}
