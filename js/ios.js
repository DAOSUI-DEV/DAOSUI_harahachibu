/* iPhone との連携（サーバーなし）
   - ショートカット：体重を取り込む（ショートカットがコピー → ここで貼り付け）、食べた分をヘルスケアに書き込む（ショートカットに渡す）
   - カレンダー：記録忘れのお知らせ（毎日くり返す予定のファイル .ics を作る）
   どれも、データはこの iPhone の中（ショートカット・ヘルスケア・カレンダー）だけを通る。外のサーバーには送らない */
import { today, pad, uid } from './util.js';

export const SC_WEIGHT = 'はらはちぶ体重';
export const SC_LOG = 'はらはちぶ記録';
export const shortcutURL = (name, text) =>
  'shortcuts://run-shortcut?name=' + encodeURIComponent(name) + (text != null ? '&input=text&text=' + encodeURIComponent(text) : '');

/* ショートカットがコピーした体重の文字を読む。
   例：「はらはちぶ体重 kg=65.2 kg fat=18.1% date=2026/10/22 7:15」「65.2」 → { kg, fat, date, time } */
export function parseWeight(text) {
  const t = String(text || '').normalize('NFKC').replace(/,/g, '.').trim();
  if (!t) return null;
  const numAfter = re => { const m = t.match(re); return m ? Number(m[1]) : null; };
  let kg = numAfter(/(?:kg|体重)\s*[=:：]?\s*(\d{2,3}(?:\.\d+)?)/i);
  if (kg == null) { const m = t.replace(/\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2}日?/g, ' ').match(/(\d{2,3}(?:\.\d+)?)/); kg = m ? Number(m[1]) : null; }
  if (kg == null || kg < 20 || kg > 300) return null;
  let fat = numAfter(/(?:fat|体脂肪率?)\s*[=:：]?\s*(\d+(?:\.\d+)?)/i);
  if (fat != null && fat > 0 && fat < 1) fat = fat * 100;                    // 0.181 のように割合で来た時
  if (fat != null && (fat < 2 || fat > 70)) fat = null;
  let date = null, time = null;
  const dm = t.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dm) {
    const d = `${dm[1]}-${pad(dm[2])}-${pad(dm[3])}`;
    if (d <= today() && d >= '2000-01-01') { date = d; if (dm[4]) time = `${pad(dm[4])}:${dm[5]}`; }
  }
  return { kg: Math.round(kg * 10) / 10, fat: fat == null ? null : Math.round(fat * 10) / 10, date, time };
}

/* ヘルスケアに渡す中身（まだ送っていない分だけ）。値はその日の合計 − 前に送った合計 */
export function healthPayload(d, tot, sent, now = new Date()) {
  const s0 = sent || { k: 0, p: 0, f: 0, c: 0, s: 0 };
  const dk = Math.round(tot.k - s0.k);
  const g = (a, b) => Math.max(0, Math.round(((a || 0) - (b || 0)) * 10) / 10);
  const when = d === today() ? `${d} ${pad(now.getHours())}:${pad(now.getMinutes())}` : `${d} 12:00`;
  return {
    delta: dk,
    data: { date: when, kcal: Math.max(0, dk), protein: g(tot.p, s0.p), fat: g(tot.f, s0.f), carbs: g(tot.c, s0.c),
      sodium_mg: Math.max(0, Math.round(((tot.s || 0) - (s0.s || 0)) / 2.54 * 1000)) }
  };
}

/* ---- カレンダー（.ics）：毎日くり返す予定と、その時刻のお知らせ ---- */
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
/* 1行75バイトまで（それ以上は折り返す。日本語の途中で切らない） */
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/* list: [{ hm: '20:00', title, body }]。url はアプリの場所（予定から開ける） */
export function makeIcs(list, url, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DAOSUI//harahachibu//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const x of list) {
    const [hh, mm] = x.hm.split(':').map(Number);
    const start = new Date(now);
    start.setHours(hh, mm, 0, 0);
    if (start <= now) start.setDate(start.getDate() + 1);                    // 今日の時刻を過ぎていたら明日から
    const ds = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(hh)}${pad(mm)}00`;
    lines.push('BEGIN:VEVENT', `UID:${uid()}-${pad(hh)}${pad(mm)}@harahachibu`, `DTSTAMP:${stamp(now)}`,
      `DTSTART:${ds}`, 'DURATION:PT5M', 'RRULE:FREQ=DAILY', `SUMMARY:${esc(x.title)}`, `DESCRIPTION:${esc(x.body)}`,
      url ? `URL:${url}` : null, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(x.title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}

/* アプリの場所（? や # を除く） */
export const appURL = () => location.origin + location.pathname.replace(/index\.html$/, '');
