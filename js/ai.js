/* 写真判定（画面側）。重い処理は ai-worker.js に任せる
   - 料理の候補：SigLIP の「写真の特徴」と「料理の説明文の特徴」の近さで並べる
   - 前に記録した物：自分が写真つきで記録した時の「写真の特徴」をスマホの中に覚えておき、似た写真なら上に出す */
import * as store from './store.js';
import { PHOTO_LABELS, PHOTO_LABELS_VER, PHOTO_TEMPLATE } from '../data/photo-labels.js';
import { dishByName } from './foods.js';

export const MODEL_ID = 'siglip-base-patch16-224';
export const SIZE_NOTE = '初回だけ約230MB（Wi-Fiがおすすめ）。準備が終わるとスマホに残るのは約120MB';
const MEM_MAX = 400;          // 覚えておく写真の数
const MEM_SHOW = 0.78;        // これより似ていたら「前に記録した物」に出す
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const TEST_HOST = LOCAL && new URLSearchParams(location.search).has('aitest') ? location.origin + '/testmodel/' : null;

let w = null, seq = 0, onProg = null, textSet = false, configured = false;
const pend = new Map();
function worker() {
  if (w) return w;
  w = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => {
    if (data.progress || data.step) { onProg && onProg(data); return; }
    if (data.ready) return;
    const p = pend.get(data.id);
    if (!p) return;
    pend.delete(data.id);
    data.ok ? p.res(data.result) : p.rej(new Error(data.error));
  };
  w.onerror = e => { const err = new Error('写真判定を動かせなかった（' + (e.message || 'ワーカーのエラー') + '）'); pend.forEach(p => p.rej(err)); pend.clear(); reset(); };
  return w;
}
function reset() { try { w && w.terminate(); } catch { } w = null; textSet = false; configured = false; }
function call(cmd, args, transfer) {
  const id = ++seq;
  return new Promise((res, rej) => { pend.set(id, { res, rej }); worker().postMessage({ id, cmd, args }, transfer || []); });
}
async function setup() {
  if (!configured) { await call('config', { host: TEST_HOST }); configured = true; }
}

export const isReady = () => { const s = store.settings(); return s.ai === 'ready' && s.aiModel === MODEL_ID; };
/* 前のAI（CLIP）で準備していた人 */
export const isOld = () => { const s = store.settings(); return s.ai === 'ready' && s.aiModel !== MODEL_ID; };

/* 説明文をまとめて、料理ごとの平均の特徴にする */
function labelTexts() {
  const texts = [], owner = [];
  PHOTO_LABELS.forEach((l, i) => l.p.forEach(p => { texts.push(PHOTO_TEMPLATE(p)); owner.push(i); }));
  return { texts, owner };
}
function averageByLabel(data, dim, owner, n) {
  const out = new Float32Array(n * dim);
  owner.forEach((li, ti) => { for (let j = 0; j < dim; j++) out[li * dim + j] += data[ti * dim + j]; });
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < dim; j++) s += out[i * dim + j] ** 2;
    s = Math.sqrt(s) || 1;
    for (let j = 0; j < dim; j++) out[i * dim + j] /= s;
  }
  return out;
}

/* 初回の準備：ダウンロード → 料理の特徴を作る → 写真用AIを読み込む */
export async function prepare(progressFn) {
  const files = new Map();
  onProg = m => {
    if (m.progress) {
      const f = files.get(m.progress.file) || { loaded: 0, total: 0 };
      if (m.progress.total) f.total = m.progress.total;
      f.loaded = m.progress.status === 'done' ? f.total || f.loaded : m.progress.loaded;
      files.set(m.progress.file, f);
      let l = 0, t = 0;
      files.forEach(v => { l += v.loaded; t += v.total; });
      progressFn && progressFn({ phase: 'dl', loaded: l, total: t });
    } else if (m.step) progressFn && progressFn({ phase: 'text', done: m.step.done, total: m.step.total });
  };
  try {
    if (store.settings().aiModel !== MODEL_ID) {         // 前のAIのデータは先に消して、容量を空ける
      try { await setup(); await call('purge'); } catch { }
      reset();
      try { await caches.delete('transformers-cache'); } catch { }
      await store.delAI('text');
    }
    await setup();
    let rec = await store.getAI('text');
    if (!rec || rec.ver !== PHOTO_LABELS_VER || rec.model !== MODEL_ID || rec.n !== PHOTO_LABELS.length) {
      const { texts, owner } = labelTexts();
      const r = await call('text', { texts });
      rec = { id: 'text', model: MODEL_ID, ver: PHOTO_LABELS_VER, n: PHOTO_LABELS.length, dim: r.dim, data: averageByLabel(r.data, r.dim, owner, PHOTO_LABELS.length) };
      await store.putAI(rec);
    }
    await call('setText', { data: rec.data, dim: rec.dim, n: rec.n });
    textSet = true;
    progressFn && progressFn({ phase: 'vision' });
    await call('loadVision');
    store.setSettings({ ai: 'ready', aiModel: MODEL_ID });
    try { await navigator.storage?.persist?.(); } catch { }
    return true;
  } finally { onProg = null; }
}

/* 写真 → { cands: 全部の候補（近い順）, mem: 前に記録した似た物, emb: 写真の特徴 } */
export async function classify(blob) {
  await setup();
  if (!textSet) {
    const rec = await store.getAI('text');
    if (!rec || rec.ver !== PHOTO_LABELS_VER || rec.model !== MODEL_ID) { store.setSettings({ ai: 'off' }); throw new Error('写真判定の準備がまだ。設定から準備してね'); }
    await call('setText', { data: rec.data, dim: rec.dim, n: rec.n });
    textSet = true;
  }
  const r = await call('classify', { blob });
  const cands = PHOTO_LABELS.map((l, i) => ({ i, c: l.c, dish: dishByName(l.n), s: r.sims[i] }))
    .filter(x => x.dish).sort((a, b) => b.s - a.s);
  const mem = await recall(r.emb);
  return { cands, mem, emb: r.emb };
}

/* ---- 前に記録した物を覚える・思い出す（スマホの中だけ） ---- */
async function memory() {
  const m = await store.getAI('mem');
  return m && m.model === MODEL_ID ? m : { id: 'mem', model: MODEL_ID, items: [] };
}
const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
async function recall(emb) {
  const m = await memory();
  const best = new Map();
  for (const it of m.items) {
    if (!it.emb || it.emb.length !== emb.length) continue;
    const s = cos(emb, it.emb);
    if (s < MEM_SHOW) continue;
    const key = it.item.n + '|' + it.item.k;
    if (!best.has(key) || best.get(key).s < s) best.set(key, { item: it.item, s });
  }
  return [...best.values()].sort((a, b) => b.s - a.s).slice(0, 3);
}
export async function remember(emb, item) {
  if (!emb || !item) return;
  const m = await memory();
  m.items.push({ at: Date.now(), emb, item: { n: item.n, q: item.q, k: item.k, p: item.p ?? null, f: item.f ?? null, c: item.c ?? null, s: item.s ?? null, src: item.src, base: item.base || null } });
  if (m.items.length > MEM_MAX) m.items = m.items.slice(-MEM_MAX);
  await store.putAI(m);
}
export async function memoryCount() { return (await memory()).items.length; }
export const forgetMemory = () => store.delAI('mem');

/* AIのデータを消す（覚えた物は残す） */
export async function remove() {
  try { await setup(); await call('purge'); } catch { }
  reset();
  try { await caches.delete('transformers-cache'); } catch { }
  await store.delAI('text');
  store.setSettings({ ai: 'off' });
}

/* 写真を小さくして保存用にする（位置情報などの付加情報もここで消える） */
export async function shrink(file, max = 720) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close && bmp.close();
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('写真を読み込めなかった'))), 'image/jpeg', 0.82));
}
