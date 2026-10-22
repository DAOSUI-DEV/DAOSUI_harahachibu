/* バーコード（JAN・EAN・UPC）を写真から読む。zxing-wasm（MIT）＋ zxing-cpp（Apache-2.0）をスマホの中で動かす。写真は外に送らない */
import { readBarcodes, setZXingModuleOverrides } from '../vendor/zxing/reader/index.js';

setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL('../vendor/zxing/zxing_reader.wasm', import.meta.url).href : prefix + path)
});

async function toImageData(file, max = 1600) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close && bmp.close();
  return ctx.getImageData(0, 0, cv.width, cv.height);
}

const FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE'];
const pickCode = res => { const ok = res.find(r => r.isValid && /^\d{8,14}$/.test(r.text)); return ok ? ok.text : null; };

/* 写真から。読めたら数字の文字列、読めなければ null */
export async function readCode(file) {
  const img = await toImageData(file);
  return pickCode(await readBarcodes(img, { formats: FORMATS, tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 1 }));
}

/* カメラの映像の1コマから（速さ優先：回転は試さない） */
export async function readImageData(img) {
  return pickCode(await readBarcodes(img, { formats: FORMATS, tryHarder: true, tryRotate: false, tryInvert: false, maxNumberOfSymbols: 1 }));
}

/* 手で入れた数字が JAN として正しいか（チェックディジット） */
export function validJan(s) {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(s)) return false;
  const d = s.split('').map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
