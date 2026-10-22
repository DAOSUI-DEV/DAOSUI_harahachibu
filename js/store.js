/* 記録の保存場所。すべてこのスマホの中だけ（外には送らない）。
   - 文字の記録：localStorage（キーは hh. で始まる）
   - 写真とAIの準備データ：IndexedDB（harahachibu） */
import { uid, today } from './util.js';

const P = 'hh.';
const get = (k, d) => { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const set = (k, v) => {
  try { localStorage.setItem(P + k, JSON.stringify(v)); }
  catch (e) { emit('error', 'スマホの保存場所がいっぱいで保存できなかった。設定の「バックアップ」で保存してから、古い写真を消してね'); throw e; }
  emit('change', k);
};
const subs = {};
export const on = (ev, fn) => (subs[ev] = subs[ev] || []).push(fn);
const emit = (ev, x) => (subs[ev] || []).forEach(fn => { try { fn(x); } catch (e) { console.error(e); } });

/* プロフィールと目標。目標カロリーは「決めた日」から使う（あとで変えても過去の日の判定は変わらない） */
export const profile = () => get('profile', null);
export const setProfile = p => set('profile', p);
export const targets = () => get('targets', []);   // [[この日から, kcal, {p,f,c}]]
export function pushTarget(from, kcal, pfc) {
  const t = targets().filter(x => x[0] < from);
  if (kcal != null) t.push([from, kcal, pfc || null]);
  set('targets', t);
}
export function targetFor(d) {
  const t = targets();
  if (!t.length) return null;
  let cur = null;
  for (const x of t) if (x[0] <= d) cur = x;
  if (!cur) cur = t[0];   // 目標を決める前の日は、最初の目標で判定
  return { k: cur[1], pfc: cur[2] };
}
export const settings = () => ({ ai: 'off', onboarded: false, ...get('set', {}) });
export const setSettings = patch => set('set', { ...settings(), ...patch });

/* 1日の記録 { m: 食べた物, x: 運動 } */
const emptyDay = () => ({ m: [], x: [] });
export const day = d => ({ ...emptyDay(), ...get('d.' + d, {}) });
const saveDay = (d, v) => { if (!v.m.length && !v.x.length && !v.note) { localStorage.removeItem(P + 'd.' + d); emit('change', 'd.' + d); } else set('d.' + d, v); };
export function addMeal(d, e) {
  const v = day(d);
  const item = { id: uid(), ...e };
  v.m.push(item);
  saveDay(d, v);
  pushRecent(item);
  return item;
}
export function updateMeal(d, id, patch) { const v = day(d); const i = v.m.findIndex(x => x.id === id); if (i >= 0) { v.m[i] = { ...v.m[i], ...patch }; saveDay(d, v); } }
export function removeMeal(d, id) { const v = day(d); const it = v.m.find(x => x.id === id); v.m = v.m.filter(x => x.id !== id); saveDay(d, v); return it; }
export function restoreMeal(d, it) { const v = day(d); v.m.push(it); saveDay(d, v); }
export function addEx(d, e) { const v = day(d); const it = { id: uid(), ...e }; v.x.push(it); saveDay(d, v); return it; }
export function removeEx(d, id) { const v = day(d); const it = v.x.find(x => x.id === id); v.x = v.x.filter(x => x.id !== id); saveDay(d, v); return it; }
export function restoreEx(d, it) { const v = day(d); v.x.push(it); saveDay(d, v); }
export function recordedDays() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P + 'd.')) out.push(k.slice(P.length + 2)); }
  return out.sort();
}

/* 体重 [日付, kg, 体脂肪% or null] */
export const weights = () => get('w', []);
export function setWeight(d, kg, fat) {
  const w = weights().filter(x => x[0] !== d);
  if (kg != null) w.push([d, kg, fat ?? null]);
  w.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  set('w', w);
}
export const latestWeight = (upTo = today()) => { const w = weights().filter(x => x[0] <= upTo); return w.length ? w[w.length - 1] : null; };

/* マイメニュー（よく食べる物） */
export const mine = () => get('mine', []);
export function addMine(e) {
  const list = mine();
  const same = list.find(x => x.n === e.n && x.k === e.k);
  if (same) return same;
  const it = { id: uid(), n: e.n, q: e.q || '', k: e.k, p: e.p ?? null, f: e.f ?? null, c: e.c ?? null, s: e.s ?? null, src: e.src || 'mine' };
  list.unshift(it);
  set('mine', list.slice(0, 200));
  return it;
}
export const removeMine = id => set('mine', mine().filter(x => x.id !== id));
export const inMine = e => mine().some(x => x.n === e.n && x.k === e.k);

/* 自分で登録したバーコード（JAN → 記録した時の中身）。Open Food Facts にない商品を、次からバーコードで出す */
export const janGet = code => get('jan', {})[code] || null;
export function janSet(code, e) {
  if (!/^\d{8,14}$/.test(code)) return;
  const m = get('jan', {});
  m[code] = { n: e.n, q: e.q, k: e.k, p: e.p ?? null, f: e.f ?? null, c: e.c ?? null, s: e.s ?? null, src: e.src, base: e.base || null };
  set('jan', m);
}

/* 最近記録した物（検索の最初に出す） */
export const recent = () => get('recent', []);
function pushRecent(e) {
  const key = e.n + '|' + e.k;
  const list = recent().filter(x => x.n + '|' + x.k !== key);
  list.unshift({ n: e.n, q: e.q, k: e.k, p: e.p ?? null, f: e.f ?? null, c: e.c ?? null, s: e.s ?? null, src: e.src, base: e.base || null });
  set('recent', list.slice(0, 30));
}

/* まとめて取り出す・戻す・消す（バックアップ用） */
export function dumpAll() {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P)) o[k] = localStorage.getItem(k); }
  return o;
}
export function loadAll(o) {
  wipeLocal();
  for (const [k, v] of Object.entries(o)) if (k.startsWith(P) && typeof v === 'string') localStorage.setItem(k, v);
  emit('change', '*');
}
function wipeLocal() {
  const ks = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P)) ks.push(k); }
  ks.forEach(k => localStorage.removeItem(k));
}

/* ---- IndexedDB：写真とAIの準備データ ---- */
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('harahachibu', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('photos', { keyPath: 'id' }); d.createObjectStore('ai', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
export const putPhoto = (blob, date) => { const id = uid(); return tx('photos', 'readwrite', st => st.put({ id, date, blob })).then(() => id); };
export const getPhoto = id => tx('photos', 'readonly', st => st.get(id)).then(r => r && r.blob);
export const delPhoto = id => tx('photos', 'readwrite', st => st.delete(id));
export const allPhotos = () => tx('photos', 'readonly', st => st.getAll());
export const putAI = rec => tx('ai', 'readwrite', st => st.put(rec));
export const getAI = id => tx('ai', 'readonly', st => st.get(id));
export const delAI = id => tx('ai', 'readwrite', st => st.delete(id));
export async function wipeAll() {
  wipeLocal();
  await tx('photos', 'readwrite', st => st.clear());
  await tx('ai', 'readwrite', st => st.clear());
  emit('change', '*');
}
export async function replacePhotos(list) {
  await tx('photos', 'readwrite', st => { st.clear(); list.forEach(p => st.put(p)); });
}
/* 記録から外れた写真を掃除 */
export async function cleanupPhotos() {
  const used = new Set();
  for (const d of recordedDays()) day(d).m.forEach(e => e.ph && used.add(e.ph));
  const all = await allPhotos();
  const dead = all.filter(p => !used.has(p.id));
  await tx('photos', 'readwrite', st => dead.forEach(p => st.delete(p.id)));
  return dead.length;
}
export const onError = fn => on('error', fn);
