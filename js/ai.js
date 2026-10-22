/* 写真判定（画面側）。重い処理は ai-worker.js に任せる */
import * as store from './store.js';
import { PHOTO_LABELS, PHOTO_LABELS_VER, PHOTO_TEMPLATE } from '../data/photo-labels.js';
import { dishByName } from './foods.js';

export const SIZE_NOTE = '初回だけ約170MB（Wi-Fiがおすすめ）。準備が終わるとスマホに残るのは約105MB';
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

export const isReady = () => store.settings().ai === 'ready';

/* 初回の準備：ダウンロード → 文字の特徴を作る → 写真用AIを読み込む */
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
    await setup();
    let rec = await store.getAI('text');
    if (!rec || rec.ver !== PHOTO_LABELS_VER || rec.n !== PHOTO_LABELS.length) {
      const texts = PHOTO_LABELS.map(l => PHOTO_TEMPLATE(l[0]));
      const r = await call('text', { texts });
      rec = { id: 'text', ver: PHOTO_LABELS_VER, n: texts.length, dim: r.dim, data: r.data };
      await store.putAI(rec);
    }
    await call('setText', { data: rec.data, dim: rec.dim, n: rec.n });
    textSet = true;
    progressFn && progressFn({ phase: 'vision' });
    await call('loadVision');
    store.setSettings({ ai: 'ready' });
    try { await navigator.storage?.persist?.(); } catch { }
    return true;
  } finally { onProg = null; }
}

/* 写真 → 候補（上位5つ。画面では3つ見せる） */
export async function classify(blob) {
  await setup();
  if (!textSet) {
    const rec = await store.getAI('text');
    if (!rec || rec.ver !== PHOTO_LABELS_VER) { store.setSettings({ ai: 'off' }); throw new Error('写真判定の準備がまだ。設定から準備してね'); }
    await call('setText', { data: rec.data, dim: rec.dim, n: rec.n });
    textSet = true;
  }
  const r = await call('classify', { blob, top: 5 });
  return r.top.map(([i, p]) => ({ en: PHOTO_LABELS[i][0], dish: dishByName(PHOTO_LABELS[i][1]), p })).filter(x => x.dish);
}

/* AIのデータを消す */
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
