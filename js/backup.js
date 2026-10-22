/* バックアップ：記録と写真をパスワードで暗号化した1つのファイルにする
   PBKDF2（SHA-256・60万回）で鍵を作り、AES-GCM 256bit で暗号化。パスワードはどこにも保存しない */
import * as store from './store.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 600000;

async function key(pass, salt, it) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function makeBackup(pass) {
  const photos = await store.allPhotos();
  const ph = [];
  for (const p of photos) ph.push({ id: p.id, date: p.date, type: p.blob.type, data: b64(await p.blob.arrayBuffer()) });
  const plain = enc.encode(JSON.stringify({ app: 'harahachibu', v: 1, at: new Date().toISOString(), local: store.dumpAll(), photos: ph }));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt, ITER), plain);
  const file = JSON.stringify({ format: 'harahachibu-backup', v: 1, kdf: 'PBKDF2-SHA256', it: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  return new Blob([file], { type: 'application/octet-stream' });
}

export async function readBackup(file, pass) {
  let o;
  try { o = JSON.parse(await file.text()); } catch { throw new Error('はらはちぶのバックアップファイルではない'); }
  if (o.format !== 'harahachibu-backup' || !o.ct) throw new Error('はらはちぶのバックアップファイルではない');
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await key(pass, unb64(o.salt), o.it || ITER), unb64(o.ct)); }
  catch { throw new Error('パスワードがちがうか、ファイルがこわれている'); }
  const d = JSON.parse(dec.decode(plain));
  if (d.app !== 'harahachibu') throw new Error('はらはちぶのバックアップファイルではない');
  return d;
}

export async function restore(d) {
  store.loadAll(d.local || {});
  await store.replacePhotos((d.photos || []).map(p => ({ id: p.id, date: p.date, blob: new Blob([unb64(p.data)], { type: p.type || 'image/jpeg' }) })));
}

/* iPhone は共有シート（「ファイルに保存」）、ほかはダウンロード */
export async function saveFile(blob, name) {
  const file = new File([blob], name, { type: 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
