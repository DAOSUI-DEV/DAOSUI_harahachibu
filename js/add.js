/* 記録する：食べた物（さがす・写真・成分表示・マイメニュー）、量の調整、修正、運動、体重 */
import { h, add, clear, sheet, toast, ask, numInput, field, n0, n1, num, hm, jdate, today, addDays } from './util.js';
import * as store from './store.js';
import * as foods from './foods.js';
import * as ai from './ai.js';
import { MEALS, mealName, mealNow } from './calc.js';
import { EXERCISES, burn } from '../data/exercises.js';
import { PHOTO_CATS } from '../data/photo-labels.js';
import { state, rerender } from './state.js';
import { SC_WEIGHT, shortcutURL, parseWeight } from './ios.js';

/* 写真の特徴（判定した写真ID → 特徴）。写真つきで記録した時に「前に記録した物」として覚える */
const embByPhoto = new Map();
const learn = e => { if (e && e.ph && embByPhoto.has(e.ph)) ai.remember(embByPhoto.get(e.ph), e).catch(() => {}); };

/* ---- 「量を選ぶ」画面で使う形にそろえる ---- */
export function fromDish(d) { return { kind: 'dish', key: d.key, n: d.n, sub: d.g, unit: pick(d), uName: d.u || '1人前', chain: d.chain, cdate: d.cdate }; }
export function fromMext(m) { return { kind: 'mext', key: m.key, n: m.n, sub: m.sub, unit: pick(m), units: m.units, refuse: m.refuse }; }
export function fromOff(o) {
  const units = [];
  if (o.serv) units.push(['1食分', o.serv]);
  if (o.pkg && o.pkg !== o.serv) units.push(['1個・1袋', o.pkg]);
  return { kind: 'off', key: o.key, n: o.n, sub: [o.brand, 'Open Food Facts'].filter(Boolean).join('・'), unit: pick(o), units, refuse: 0, code: o.code };
}
export function fromMine(m) { return { kind: 'mine', key: 'my:' + m.id, n: m.n, sub: m.q, unit: pick(m), uName: m.q || '1回分' }; }
export function fromBase(e) { const b = e.base; return { kind: b.kind, key: b.key, n: e.n, sub: b.kind === 'mext' ? '' : '', unit: b.unit, units: b.units, uName: b.uName, refuse: b.refuse }; }
const pick = o => ({ k: o.k, p: o.p ?? null, f: o.f ?? null, c: o.c ?? null, s: o.s ?? null });
const scale = (u, r) => { const v = x => (x == null ? null : Math.round(x * r * 10) / 10); return { k: Math.round(u.k * r), p: v(u.p), f: v(u.f), c: v(u.c), s: v(u.s) }; };
export const per100 = it => it.kind === 'mext' || it.kind === 'off';
const ratio = (it, amt) => (per100(it) ? amt / 100 : amt);
function qText(it, amt) {
  if (per100(it)) {
    const u = (it.units || []).find(x => x[1] === amt);
    return u ? `${u[0]}（${amt}g）` : `${n1(amt)}g`;
  }
  const base = it.uName || '1人前';
  if (amt === 1) return base;
  const nm = SIZES.find(x => x[0] === amt);
  return nm ? `${base}・${nm[1]}` : `${base} ×${n1(amt)}`;
}
/* 量の名前（写真のあとに1タップで選ぶ） */
const SIZES = [[0.5, '半分'], [0.75, '少なめ'], [1.5, '大盛り']];
/* 検索の結果などを「量を選ぶ」画面の形に */
export function toForm(it) {
  if (it.kind === 'mext') return fromMext(it);
  if (it.kind === 'off') return fromOff(it);
  if (it.kind === 'mine') return fromMine(it);
  if (it.kind === 'recent') return it.base ? fromBase({ n: it.n, base: it.base }) : { kind: 'label', key: it.src, n: it.n, unit: pick(it), uName: it.q || '1回分' };
  return fromDish(it);
}
/* ふつうの量（g の物は最初の単位、それ以外は1人前） */
const defAmt = f => (per100(f) ? ((f.units && f.units[0] && f.units[0][1]) || 100) : 1);
/* 記録1件の中身 */
function makeEntry(f, amt, t) {
  const v = scale(f.unit, ratio(f, amt));
  return { t, n: f.n, q: qText(f, amt), ...v, src: f.key, base: { kind: f.kind, key: f.key, unit: f.unit, amt, uName: f.uName, units: f.units, refuse: f.refuse } };
}
const pfcLine = v => [
  ['たんぱく質', v.p, 'g'], ['脂質', v.f, 'g'], ['炭水化物', v.c, 'g'], ['塩分', v.s, 'g']
].map(([l, x, u]) => h('span', { class: 'pfc-chip' }, h('b', { text: l }), x == null ? '—' : n1(x) + u));

function mealChips(cur, onPick) {
  const wrap = h('div', { class: 'chips meal-chips', role: 'radiogroup', 'aria-label': '食事' });
  const draw = sel => { clear(wrap); MEALS.forEach(([t, nm]) => add(wrap, h('button', { class: 'chip' + (t === sel ? ' on' : ''), role: 'radio', 'aria-checked': String(t === sel), text: nm, on: { click: () => { draw(t); onPick(t); } } }))); };
  draw(cur);
  return wrap;
}

/* ---- 量を選んで記録（edit があれば修正） ---- */
export function amountSheet(it, { date = state.cur, meal = mealNow(), photo = null, edit = null, onDone } = {}) {
  let amt = edit ? edit.base.amt : per100(it) ? ((it.units && it.units[0] && it.units[0][1]) || 100) : 1;
  let t = edit ? edit.t : meal;
  let toMine = false;
  const big = h('div', { class: 'amt-kcal' });
  const pf = h('div', { class: 'pfc-row' });
  const inp = numInput({ value: String(amt), 'aria-label': per100(it) ? 'グラム' : '倍率', class: 'amt-input' });
  const chips = h('div', { class: 'chips' });
  const presets = per100(it)
    ? [...(it.units || []).map(u => [u[0] === `${u[1]}g` ? u[0] : `${u[0]} ${u[1]}g`, u[1]]), ['100g', 100]].filter((x, i, a) => a.findIndex(y => y[1] === x[1]) === i)
    : photo ? [['半分残した', 0.5], ['少なめ', 0.75], ['普通', 1], ['大盛り', 1.5]] : [['半分', 0.5], ['1', 1], ['1.5', 1.5], ['2', 2]];
  const draw = () => {
    const v = scale(it.unit, ratio(it, amt));
    clear(big); add(big, h('strong', { text: n0(v.k) }), h('span', { text: 'kcal' }));
    clear(pf); add(pf, pfcLine(v));
    [...chips.children].forEach(b => b.classList.toggle('on', Number(b.dataset.v) === amt));
    btn.disabled = !(amt > 0);
  };
  presets.forEach(([l, v]) => add(chips, h('button', { class: 'chip', text: l, data: { v }, on: { click: () => { amt = v; inp.value = String(v); draw(); } } })));
  inp.addEventListener('input', () => { const v = num(inp.value); amt = v && v > 0 ? Math.min(v, per100(it) ? 5000 : 20) : 0; draw(); });
  const btn = h('button', { class: 'btn primary wide', text: edit ? '変更する' : '記録する', on: { click: save } });
  const mineBox = it.kind !== 'mine' && !edit && h('label', { class: 'check' }, h('input', { type: 'checkbox', on: { change: e => (toMine = e.target.checked) } }), 'マイメニューにも入れる（次から1タップ）');
  const body = [
    it.sub && h('p', { class: 'sub', text: it.sub }),
    big, pf,
    h('h3', { text: per100(it) ? '食べた量（g）' : photo ? '量はどのくらい？（1タップで選べる）' : '量（1人前・1個を1として）' }),
    photo && !per100(it) ? h('div', { class: 'size-chips' }, chips) : chips,
    h('div', { class: 'amt-line' }, per100(it) ? null : h('span', { text: '×' }), inp, per100(it) ? h('span', { text: 'g' }) : null),
    per100(it) && it.refuse > 0 && h('p', { class: 'note', text: `皮・骨・種など食べない部分（約${it.refuse}%）をのぞいた重さで入れてね` }),
    it.kind === 'mext' && h('p', { class: 'note', text: '値は100gあたりの成分から計算。' + foods.cite() }),
    it.kind === 'off' && h('p', { class: 'note', text: '値は Open Food Facts（みんなで入力している商品データ・ODbL）の100gあたりの成分から計算。まちがいもあるので、袋の表示とちがう時は「成分表示」から入れてね' }),
    it.chain && h('p', { class: 'note', text: `値は${it.chain}が公開している栄養成分（${it.cdate ? it.cdate.replace(/-/g, '/') + ' に確認' : '確認した時点'}）。メニューや量が変わると値も変わるよ` + (it.unit.p == null ? '。たんぱく質などは公開されていないので「—」' : '') }),
    h('h3', { text: '食事' }),
    mealChips(t, x => (t = x)),
    photo && h('p', { class: 'note', text: '写真つきで記録する' }),
    mineBox,
    btn
  ];
  const sh = sheet(it.n, body, { cls: 'amount' });
  draw();
  function save() {
    if (!(amt > 0)) return;
    const entry = makeEntry(it, amt, t);
    const v = entry;
    if (edit) {
      store.updateMeal(date, edit.id, entry);
      toast('変更した');
      onDone && onDone(true);
    } else {
      if (photo) entry.ph = photo;
      entry.at = hm();
      const saved = store.addMeal(date, entry);
      learn(saved);
      if (toMine) store.addMine({ n: it.n, q: entry.q, ...v, src: it.key });
      toast(`記録した：${it.n} ${n0(v.k)}kcal`, () => { store.removeMeal(date, saved.id); if (saved.ph) store.delPhoto(saved.ph); rerender(); });
      onDone && onDone(true, saved);
    }
    sh.close();
    rerender();
  }
  return sh;
}

/* ---- 食べた物を記録（メインのシート） ---- */
export function addSheet({ date = state.cur, meal = date === today() ? mealNow() : 'd', tab = 'search' } = {}) {
  let t = meal, photoId = null, used = false, pendingJan = null, paneHook = null;
  const tabs = [['search', 'さがす'], ['photo', '写真'], ['label', '成分表示'], ['mine', 'マイメニュー']];
  const seg = h('div', { class: 'seg', role: 'tablist' });
  const pane = h('div', { class: 'pane' });
  const photoChip = h('div', { class: 'photo-chip', hidden: true });
  const janChip = h('div', { class: 'photo-chip jan-chip', hidden: true });
  const done = () => { used = true; sh.close(); };
  const body = [
    h('p', { class: 'sub', text: jdate(date) }),
    mealChips(t, x => { t = x; paneHook && paneHook(); }),
    seg, photoChip, janChip, pane
  ];
  const sh = sheet('食べた物を記録', body, { tall: true, onClose: () => { if (photoId && !used) store.delPhoto(photoId); } });
  const show = name => {
    [...seg.children].forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    clear(pane);
    paneHook = null;
    ({ search: searchPane, photo: photoPane, label: labelPane, mine: minePane })[name]();
  };
  tabs.forEach(([k, l]) => add(seg, h('button', { class: 'seg-btn', role: 'tab', text: l, data: { tab: k }, on: { click: () => show(k) } })));
  const opts = () => ({ date, meal: t, photo: photoId, onDone: (ok, e) => { if (ok && pendingJan && e) { store.janSet(pendingJan, e); toast(`記録した。次からバーコード ${pendingJan} で出るよ`); } if (ok) done(); } });
  const setJan = code => {
    pendingJan = code;
    clear(janChip);
    janChip.hidden = !code;
    if (code) add(janChip, h('span', { text: `バーコード ${code} を登録中：次に記録した物を、このバーコードで覚える` }),
      h('button', { class: 'link', text: 'やめる', on: { click: () => setJan(null) } }));
  };
  const setPhotoChip = url => {
    clear(photoChip);
    photoChip.hidden = !url;
    if (url) add(photoChip, h('img', { src: url, alt: '' }), h('span', { text: '写真を付けて記録する' }),
      h('button', { class: 'link', text: '外す', on: { click: () => { store.delPhoto(photoId); photoId = null; setPhotoChip(null); } } }));
  };

  function itemRow(it, onTap) {
    const right = per100(it) ? `100gで ${n0(it.k)}` : it.kind === 'mine' ? `${it.q || '1回分'} ${n0(it.k)}` : it.kind === 'recent' ? `${it.q || ''} ${n0(it.k)}` : `${it.u || '1人前'} ${n0(it.k)}`;
    return h('li', {}, h('button', { class: 'item', on: { click: onTap } },
      h('span', { class: 'item-n' }, h('span', { text: it.n }), it.sub && h('small', { text: it.sub }), it.kind === 'dish' && h('small', { text: it.chain ? 'お店の公式の値' : it.calc ? '成分表から計算' : '目安' }), it.kind === 'off' && h('small', { text: [it.brand, '商品（Open Food Facts）'].filter(Boolean).join('・') })),
      h('span', { class: 'item-k', text: right + 'kcal' })));
  }
  const tapItem = it => amountSheet(toForm(it), opts());
  /* 何品かをまとめて記録（写真があれば1品目に付ける） */
  const recordMany = entries => {
    if (!entries.length) return;
    const saved = entries.map((e, i) => store.addMeal(date, { ...e, t, at: hm(), ph: i === 0 && photoId ? photoId : undefined }));
    if (saved[0].ph) learn(saved[0]);
    const sum = saved.reduce((a, e) => a + (e.k || 0), 0);
    toast(`記録した：${saved.length}品 ${n0(sum)}kcal`, () => { saved.forEach(e => store.removeMeal(date, e.id)); rerender(); });
    done(); rerender();
  };

  function searchPane() {
    const q = h('input', { type: 'search', placeholder: '例：おにぎり、鶏むね、ラーメン', 'aria-label': '食べ物の名前', enterkeyhint: 'search', autocomplete: 'off' });
    const list = h('ul', { class: 'list' });
    const info = h('p', { class: 'note' });
    const extra = h('div', { class: 'extra' });
    const run = () => {
      clear(list); clear(extra);
      const v = q.value.trim();
      if (!v) {
        const cb = mealCombos(t, date);
        if (cb.length) add(extra, h('h3', { class: 'list-h', text: '前と同じ（ワンタップでまとめて記録）' }), h('ul', { class: 'list combos' }, cb.map(c => h('li', {},
          h('button', { class: 'item', on: { click: () => recordMany(c.items.map(e => ({ n: e.n, q: e.q, k: e.k, p: e.p ?? null, f: e.f ?? null, c: e.c ?? null, s: e.s ?? null, src: e.src, base: e.base }))) } },
            h('span', { class: 'item-n' }, h('span', { text: c.items.map(e => e.n).join('・') }), h('small', { text: c.label })),
            h('span', { class: 'item-k', text: `${c.items.length}品 ${n0(c.items.reduce((a, e) => a + (e.k || 0), 0))}kcal` }))))));
        const rc = store.recent();
        info.textContent = (rc.length ? '最近記録した物' : '名前を入れてね。料理・チェーン店・商品・成分表からさがせる') + '。「、」で区切ると、まとめて記録できる（例：ラーメン、餃子）';
        rc.slice(0, 15).forEach(r => add(list, itemRow({ ...r, kind: 'recent' }, () => tapItem({ ...r, kind: 'recent' }))));
        return;
      }
      const parts = v.split(/[、,，\n]+/).map(x => x.trim()).filter(Boolean);
      if (parts.length >= 2) { info.textContent = ''; multi(parts.slice(0, 10)); return; }
      const res = foods.search(v);
      info.textContent = res.length ? '' : '見つからなかった。ひらがなや短い言葉でもさがしてみて。袋に成分表示があれば「成分表示」から入れられる';
      res.forEach(it => add(list, itemRow(it, () => tapItem(it))));
    };
    /* まとめて入力：「、」で区切った言葉ごとに、いちばん近い物を選んでおく（ちがう時は選び直せる） */
    function multi(parts) {
      const rows = parts.map(p => { const res = foods.search(p, 6); return { p, res, sel: res.length ? 0 : -1 }; });
      const box = h('div', { class: 'multi' });
      const sum = h('p', { class: 'combo-sum' });
      const btn = h('button', { class: 'btn primary wide', on: { click: () => recordMany(rows.filter(r => r.sel >= 0).map(r => { const f = toForm(r.res[r.sel]); return makeEntry(f, defAmt(f), t); })) } });
      const draw = () => {
        clear(box);
        rows.forEach(r => add(box, h('label', { class: 'multi-row' }, h('span', { class: 'multi-q', text: r.p }),
          h('select', { 'aria-label': `「${r.p}」で記録する物`, on: { change: e => { r.sel = Number(e.target.value); draw(); } } },
            r.res.map((it, j) => { const f = toForm(it), a = defAmt(f), e = makeEntry(f, a, t); return h('option', { value: String(j), selected: j === r.sel, text: `${it.n}（${e.q} ${n0(e.k)}kcal）` }); }),
            h('option', { value: '-1', selected: r.sel === -1, text: r.res.length ? '記録しない' : '見つからなかった' })))));
        const ch = rows.filter(r => r.sel >= 0);
        const k = ch.reduce((a, r) => { const f = toForm(r.res[r.sel]); return a + makeEntry(f, defAmt(f), t).k; }, 0);
        sum.textContent = `${ch.length}品・${n0(k)}kcal（量はふつう。記録したあと、1品ずつタップして直せる）`;
        btn.textContent = `${ch.length}品をまとめて記録`;
        btn.disabled = !ch.length;
      };
      draw();
      add(extra, h('h3', { class: 'list-h', text: 'まとめて記録' }), box, sum, btn);
    }
    paneHook = () => { if (!q.value.trim()) run(); };
    let timer;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    const bcInp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'vh', on: { change: () => bcInp.files[0] && scan(bcInp.files[0]) } });
    const bcOut = h('div', { class: 'bc-out' });
    const bcBtn = h('button', { class: 'btn ghost small', text: 'バーコードで探す', on: { click: () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) liveScanSheet(code => found(code), () => bcInp.click());
      else bcInp.click();
    } } });
    add(pane, h('div', { class: 'search' }, q),
      h('div', { class: 'bc-row' }, bcBtn, bcInp, h('span', { class: 'note', text: 'カメラを向けると読む（スマホの中で読む）' })),
      bcOut, extra, info, list);
    run();
    async function scan(file) {
      clear(bcOut);
      add(bcOut, h('p', { class: 'note', text: 'バーコードを読んでいる…' }));
      let code = null;
      try { code = await (await import('./barcode.js')).readCode(file); } catch (e) { console.error(e); }
      bcInp.value = '';
      clear(bcOut);
      if (!code) {
        const man = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'バーコードの下の数字（13けた）', autocomplete: 'off', 'aria-label': 'バーコードの数字' });
        const err = h('p', { class: 'err', role: 'alert' });
        add(bcOut, h('p', { class: 'note', text: '読めなかった。明るい所で、バーコードを画面いっぱいに、まっすぐ撮ってみて。数字を手で入れてもOK' }),
          h('div', { class: 'bc-row' }, man, h('button', { class: 'btn ghost small', text: '探す', on: { click: async () => {
            const v = man.value.normalize('NFKC').replace(/\D/g, '');
            if (!(await import('./barcode.js')).validJan(v)) { err.textContent = '数字が正しくないみたい。もう一度見て入れてね'; return; }
            found(v);
          } } })), err);
        return;
      }
      found(code);
    }
    async function found(code) {
      clear(bcOut);
      add(bcOut, h('p', { class: 'note', text: `バーコード ${code} を探している…` }));
      const r = await foods.byCode(code);
      clear(bcOut);
      if (r && r.kind === 'jan') { amountSheet(r.item.base ? fromBase(r.item) : { kind: 'label', key: r.item.src || 'label', n: r.item.n, unit: pick(r.item), uName: r.item.q || '1回分' }, opts()); return; }
      if (r && r.kind === 'off') { amountSheet(fromOff(r.item), opts()); return; }
      add(bcOut, h('div', { class: 'callout soft' },
        h('p', { text: `バーコード ${code} の商品は見つからなかった。` }),
        h('p', { class: 'note', text: '袋の成分表示を入れるか、名前でさがして記録すると、次からこのバーコードで出るよ（覚えるのはこのスマホの中だけ）' }),
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn primary', text: '成分表示を入れる', on: { click: () => { setJan(code); show('label'); } } }),
          h('button', { class: 'btn ghost', text: '名前でさがす', on: { click: () => { setJan(code); clear(bcOut); q.focus(); } } }))));
    }
    foods.loadOff().then(() => q.value.trim() && run());
    foods.load().then(() => q.value.trim() && run()).catch(e => { info.textContent = e.message; });
    setTimeout(() => q.focus({ preventScroll: true }), 250);
  }

  function photoPane() {
    const out = h('div', { class: 'photo-out' });
    const pickBtn = (label, capture) => {
      const inp = h('input', { type: 'file', accept: 'image/*', class: 'vh', capture: capture ? 'environment' : null, on: { change: () => inp.files[0] && got(inp.files[0]) } });
      return h('label', { class: 'btn ' + (capture ? 'primary' : 'ghost') }, label, inp);
    };
    add(pane, h('div', { class: 'row-btns' }, pickBtn('カメラで撮る', true), pickBtn('写真を選ぶ', false)),
      h('p', { class: 'note', text: '写真の判定はこのスマホの中だけでする。写真は外に送らない。保存する時は小さくして、位置情報などは消す' }), out);
    async function got(file) {
      clear(out);
      add(out, h('p', { class: 'note', text: '写真を読み込み中…' }));
      let blob;
      try { blob = await ai.shrink(file); } catch (e) { clear(out); add(out, h('p', { class: 'err', text: e.message })); return; }
      if (photoId) store.delPhoto(photoId);
      photoId = await store.putPhoto(blob, date);
      const url = URL.createObjectURL(blob);
      clear(out);
      add(out, h('img', { class: 'preview', src: url, alt: '撮った写真' }));
      if (!ai.isReady()) {
        const box = h('div', { class: 'callout' },
          h('p', { text: ai.isOld() ? '写真判定のAIを新しくした（前より当たりやすい）。使うにはもう一度準備がいる。' : '写真から料理を当てるには、最初にAIの準備がいる。' }),
          h('p', { class: 'note', text: ai.SIZE_NOTE }));
        const go = h('button', { class: 'btn primary', text: '写真判定を準備する', on: { click: async () => { go.disabled = true; const ok = await prepareUI(box); if (ok) classify(blob, out, url); else go.disabled = false; } } });
        add(box, h('div', { class: 'row-btns' }, go, h('button', { class: 'btn ghost', text: '写真だけ付けて、名前でさがす', on: { click: () => { setPhotoChip(url); show('search'); } } })));
        add(out, box);
        return;
      }
      classify(blob, out, url);
    }
  }
  async function classify(blob, out, url) {
    const st = h('p', { class: 'note', text: '何の料理か判定中…（数秒かかるよ）' });
    out.querySelector('.callout')?.remove();
    add(out, st);
    let res;
    try { res = await ai.classify(blob); }
    catch (e) { st.textContent = '判定できなかった：' + e.message; st.className = 'err'; add(out, h('button', { class: 'btn ghost', text: '名前でさがす', on: { click: () => { setPhotoChip(url); show('search'); } } })); return; }
    st.remove();
    const id = photoId;
    embByPhoto.set(id, res.emb);
    const o = opts();
    const row = (name, sub, right, onTap) => h('li', {}, h('button', { class: 'item', on: { click: onTap } },
      h('span', { class: 'item-n' }, h('span', { text: name }), sub && h('small', { text: sub })), h('span', { class: 'item-k', text: right })));
    // 前に記録した物（自分の写真から覚えた物）
    if (res.mem.length) add(out, h('h3', { text: '前に記録した物' }), h('ul', { class: 'list cand mem' }, res.mem.map(m =>
      row(m.item.n, (m.s >= 0.9 ? 'とても似てる写真で記録した' : '似てる写真で記録した') + (m.item.q ? `・${m.item.q}` : ''), n0(m.item.k) + 'kcal',
        () => amountSheet(m.item.base ? fromBase(m.item) : { kind: 'label', key: m.item.src || 'label', n: m.item.n, unit: pick(m.item), uName: m.item.q || '1回分' }, o)))));
    // AIの候補（種類で絞れる）
    let cat = null, shown = 6;
    const chips = h('div', { class: 'chips cat-chips', role: 'radiogroup', 'aria-label': '種類で絞る' });
    const list = h('ul', { class: 'list cand' });
    const more = h('button', { class: 'link', text: 'もっと見る' });
    const draw = () => {
      clear(chips);
      [[null, 'ぜんぶ'], ...PHOTO_CATS].forEach(([k, l]) => add(chips, h('button', { class: 'chip' + (cat === k ? ' on' : ''), role: 'radio', 'aria-checked': String(cat === k), text: l, on: { click: () => { cat = k; shown = 6; draw(); } } })));
      clear(list);
      const all = res.cands.filter(c => !cat || c.c === cat);
      all.slice(0, shown).forEach((c, i) => add(list, row(c.dish.n, i === 0 ? (cat ? 'この種類でいちばん近い' : 'いちばん近い') : '', `${c.dish.u} ${n0(c.dish.k)}kcal`, () => amountSheet(fromDish(c.dish), o))));
      more.hidden = shown >= Math.min(all.length, 20);
    };
    more.addEventListener('click', () => { shown = 20; draw(); });
    draw();
    // その場で名前検索（写真は付いたまま）
    const q = h('input', { type: 'search', placeholder: 'ちがう時は名前でさがす（例：カロリーメイト）', 'aria-label': '食べ物の名前でさがす', enterkeyhint: 'search', autocomplete: 'off' });
    const sres = h('ul', { class: 'list' });
    let timer;
    const runSearch = () => { clear(sres); const v = q.value.trim(); if (!v) return; foods.search(v, 30).forEach(it => add(sres, itemRow(it, () => tapItem(it)))); };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 150); });
    foods.load().then(() => q.value.trim() && runSearch()).catch(() => {});
    const head = h('h3', { text: 'これかな？（近い順）' });
    add(out, head, chips, list, more,
      h('div', { class: 'search inline-search' }, q), sres,
      h('p', { class: 'note', text: 'AIの推定だよ。量は次の画面で直せる。写真つきで記録すると、次から似た写真の時に「前に記録した物」として上に出る（覚えるのもスマホの中だけ）' }));
    (out.querySelector('.cand.mem') ? out.querySelector('h3') : head).scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function labelPane() {
    const name = h('input', { type: 'text', placeholder: '例：チョコパン', maxlength: 40, autocomplete: 'off' });
    const kc = numInput({ placeholder: '必須' });
    const p = numInput(), f = numInput(), c = numInput(), s = numInput(), na = numInput({ placeholder: 'mg' });
    const amt = numInput({ value: '1' });
    let toMine = false;
    na.addEventListener('input', () => { const v = num(na.value); if (v != null) s.value = String(Math.round(v * 2.54 / 100) / 10); });
    const err = h('p', { class: 'err', role: 'alert' });
    add(pane,
      h('p', { class: 'note', text: '袋の「栄養成分表示」の数字をそのまま入れてね（1個・1袋あたり）' }),
      field('名前', name),
      h('div', { class: 'grid2' }, field('エネルギー（kcal）', kc), field('たんぱく質（g）', p), field('脂質（g）', f), field('炭水化物（g）', c), field('食塩相当量（g）', s), field('ナトリウム表示なら（mg）', na, '食塩に計算する')),
      h('div', { class: 'grid2' }, field('食べた量（1袋を1）', amt)),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', on: { change: e => (toMine = e.target.checked) } }), 'マイメニューにも入れる'),
      err,
      h('button', { class: 'btn primary wide', text: '記録する', on: { click: save } }));
    function save() {
      const k = num(kc.value), a = num(amt.value) || 1;
      if (k == null || k < 0 || k > 5000) { err.textContent = 'エネルギー（kcal）を入れてね'; kc.focus(); return; }
      const unit = { k, p: num(p.value), f: num(f.value), c: num(c.value), s: num(s.value) };
      const nm = name.value.trim() || '成分表示から';
      const it = { kind: 'label', key: 'label', n: nm, unit, uName: '1個・1袋' };
      const v = scale(unit, a);
      const e = store.addMeal(date, { t, n: nm, q: qText(it, a), ...v, src: 'label', base: { kind: 'label', key: 'label', unit, amt: a, uName: '1個・1袋' }, ph: photoId || undefined, at: hm() });
      learn(e);
      if (pendingJan) { store.janSet(pendingJan, e); setJan(null); }
      if (toMine) store.addMine({ n: nm, q: '1個・1袋', ...unit, src: 'label' });
      toast(`記録した：${nm} ${n0(v.k)}kcal`, () => { store.removeMeal(date, e.id); rerender(); });
      done(); rerender();
    }
  }

  function minePane() {
    const list = h('ul', { class: 'list' });
    const draw = () => {
      clear(list);
      const m = store.mine();
      if (!m.length) { add(list, h('li', { class: 'empty', text: 'まだない。量を選ぶ画面で「マイメニューにも入れる」にチェックすると、ここに並ぶ' })); return; }
      m.forEach(it => add(list, h('li', { class: 'with-del' },
        h('button', { class: 'item', on: { click: () => amountSheet(fromMine(it), opts()) } },
          h('span', { class: 'item-n' }, h('span', { text: it.n }), (it.q || it.r) && h('small', { text: [it.q, it.r && `材料${it.r.items.length}つから計算（${it.r.sv}人分を作った時の1人前）`].filter(Boolean).join('・') })), h('span', { class: 'item-k', text: n0(it.k) + 'kcal' })),
        h('button', { class: 'icon-btn', 'aria-label': it.n + 'をマイメニューから外す', text: '×', on: { click: async () => { if (await ask('マイメニューから外す', `「${it.n}」を外す？（記録は消えない）`, '外す')) { store.removeMine(it.id); draw(); } } } }))));
    };
    add(pane, h('button', { class: 'btn ghost wide', text: '＋ 材料から自分の料理を作る', on: { click: () => recipeSheet(draw) } }),
      h('p', { class: 'note', text: '家のカレーや作り置きなど。成分表の材料と量（g）から1人前を計算して、マイメニューに入れる' }), list);
    draw();
  }

  show(tab);
  return sh;
}

/* ---- 前と同じ：この食事（朝・昼…）のいちばん近い日の組み合わせと、30日でよく食べる組み合わせ ---- */
export function mealCombos(t, date) {
  const sig = items => items.map(e => e.n + '|' + (e.q || '')).sort().join('\n');
  const lim = addDays(date, -30);
  const days = store.recordedDays().filter(d => d < date && d >= lim).reverse();
  const counts = new Map();
  let prev = null;
  for (const d of days) {
    const items = store.day(d).m.filter(e => e.t === t);
    if (!items.length) continue;
    const s = sig(items);
    if (!prev) prev = { d, s, items };
    const c = counts.get(s) || { n: 0, items };
    c.n++;
    counts.set(s, c);
  }
  const out = [];
  if (prev) {
    const n = counts.get(prev.s).n;
    out.push({ label: (prev.d === addDays(date, -1) ? '昨日の' : jdate(prev.d, false) + 'の') + mealName(t) + (n >= 2 ? `（30日で${n}回）` : ''), items: prev.items });
  }
  [...counts.entries()].filter(([s, c]) => (!prev || s !== prev.s) && c.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 2)
    .forEach(([, c]) => out.push({ label: `よく食べる（30日で${c.n}回）`, items: c.items }));
  return out;
}

/* ---- カメラを向けてバーコードを読む。閉じたら・アプリを離れたら、カメラはすぐ止める ---- */
export function liveScanSheet(onCode, fallback) {
  const video = h('video', { class: 'bc-video', playsinline: true, muted: true, autoplay: true, 'aria-label': 'カメラの映像' });
  const status = h('p', { class: 'note', role: 'status', text: 'カメラを準備中…（はじめての時は、カメラを使う許可を聞かれる）' });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null, stopped = false, timer = null;
  const end = () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVis);
    if (stream) stream.getTracks().forEach(tr => tr.stop());
    stream = null;
    video.srcObject = null;
  };
  const onVis = () => { if (document.visibilityState === 'hidden') sh.close(); };
  document.addEventListener('visibilitychange', onVis);
  const sh = sheet('バーコードを読む', [
    h('div', { class: 'bc-cam' }, video, h('div', { class: 'bc-frame', 'aria-hidden': 'true' })),
    status,
    h('p', { class: 'note', text: '映像はスマホの中で読むだけ。保存も送信もしない。読めたら自動で次に進む' }),
    h('button', { class: 'btn ghost wide', text: 'うまく読めない時は、写真を撮って読む', on: { click: () => { sh.close(); fallback && fallback(); } } })
  ], { onClose: end, cls: 'scan' });
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (e) {
      status.className = 'err';
      status.textContent = e && e.name === 'NotAllowedError'
        ? 'カメラを使う許可がなかった。下の「写真を撮って読む」を使ってね'
        : 'カメラを使えなかった。下の「写真を撮って読む」を使ってね';
      return;
    }
    if (stopped) { stream.getTracks().forEach(tr => tr.stop()); stream = null; return; }
    video.srcObject = stream;
    try { await video.play(); } catch { }
    status.textContent = 'バーコードを枠の中に入れてね（横長に、画面の幅いっぱいくらい）';
    let bc;
    try { bc = await import('./barcode.js'); } catch (e) { status.className = 'err'; status.textContent = '読み取りの準備ができなかった：' + e.message; return; }
    const tick = async () => {
      if (stopped) return;
      const w = video.videoWidth, hgt = video.videoHeight;
      if (w && hgt) {
        // 横は全部・縦は真ん中の6割だけ読む（速い）。位置は整数にする（半端だと線がぼやけて読めない）
        const chh = Math.round(hgt * 0.6), top = Math.round((hgt - chh) / 2);
        const sc = w > 1280 ? 0.5 : 1;
        canvas.width = Math.round(w * sc); canvas.height = Math.round(chh * sc);
        ctx.drawImage(video, 0, top, w, chh, 0, 0, canvas.width, canvas.height);
        let code = null;
        try { code = await bc.readImageData(ctx.getImageData(0, 0, canvas.width, canvas.height)); } catch (e) { console.error(e); }
        if (stopped) return;
        if (code) {                                                                 // zxing がチェックディジットまで確かめた物だけ
          try { navigator.vibrate && navigator.vibrate(30); } catch { }
          sh.close();
          onCode(code);
          return;
        }
      }
      timer = setTimeout(tick, 120);
    };
    tick();
  })();
  return sh;
}

/* ---- 材料から自分の料理を作る（成分表・商品の100gあたりの値 × 量） ---- */
export function recipeSheet(onSaved) {
  const name = h('input', { type: 'text', maxlength: 40, placeholder: '例：家のカレー', autocomplete: 'off' });
  const sv = numInput({ value: '1' });
  const q = h('input', { type: 'search', placeholder: '材料をさがす（例：豚こま、玉ねぎ、カレールウ）', 'aria-label': '材料の名前', autocomplete: 'off', enterkeyhint: 'search' });
  const res = h('ul', { class: 'list' });
  const rows = h('ul', { class: 'list ing' });
  const tot = h('div', { class: 'recipe-sum', 'aria-live': 'polite' });
  const err = h('p', { class: 'err', role: 'alert' });
  const items = [];
  const grams = it => (it.units && it.units[0] && it.units[0][1]) || it.serv || 100;
  const calc = () => {
    const s = { k: 0, p: 0, f: 0, c: 0, s: 0 };
    let unknown = false;
    for (const x of items) {
      const v = foods.scaled(x.it, x.g || 0);
      s.k += v.k || 0;
      for (const key of ['p', 'f', 'c', 's']) { if (v[key] == null) unknown = true; s[key] += v[key] || 0; }
    }
    const n = Math.min(20, Math.max(1, num(sv.value) || 1));
    const per = { k: Math.round(s.k / n), p: Math.round(s.p / n * 10) / 10, f: Math.round(s.f / n * 10) / 10, c: Math.round(s.c / n * 10) / 10, s: Math.round(s.s / n * 10) / 10 };
    return { s, per, n, unknown };
  };
  const drawSum = () => {
    clear(tot);
    if (!items.length) { add(tot, h('p', { class: 'note', text: '材料をさがして足してね。量は g で入れる（皮や骨など食べない所はのぞいた重さ）' })); return; }
    const r = calc();
    add(tot, h('div', { class: 'amt-kcal' }, h('small', { text: '1人前 ' }), h('strong', { text: n0(r.per.k) }), h('span', { text: 'kcal' })),
      h('div', { class: 'pfc-row' }, pfcLine(r.per)),
      h('p', { class: 'note', text: `全部で ${n0(r.s.k)}kcal を ${r.n}人分に分けた量` + (r.unknown ? '。たんぱく質などがわからない材料があるので、少なめに出ている' : '') }));
  };
  const drawRows = () => {
    clear(rows);
    items.forEach((x, i) => {
      const g = numInput({ value: String(x.g), 'aria-label': x.it.n + 'の量（g）' });
      g.addEventListener('input', () => { x.g = Math.min(5000, Math.max(0, num(g.value) || 0)); drawSum(); });
      add(rows, h('li', { class: 'with-del ing-row' },
        h('span', { class: 'item-n' }, h('span', { text: x.it.n }), x.it.units && x.it.units[0] && h('small', { text: `${x.it.units[0][0]}＝${x.it.units[0][1]}g` })),
        h('span', { class: 'amt-line small' }, g, h('span', { text: 'g' })),
        h('button', { class: 'icon-btn', 'aria-label': x.it.n + 'を外す', text: '×', on: { click: () => { items.splice(i, 1); drawRows(); } } })));
    });
    drawSum();
  };
  let timer;
  const run = () => {
    clear(res);
    const v = q.value.trim();
    if (!v) return;
    foods.search(v, 40).filter(it => it.kind === 'mext' || it.kind === 'off').slice(0, 8).forEach(it => add(res, h('li', {},
      h('button', { class: 'item', on: { click: () => { items.push({ it, g: grams(it) }); q.value = ''; clear(res); drawRows(); } } },
        h('span', { class: 'item-n' }, h('span', { text: it.n }), it.sub && h('small', { text: it.sub }), it.kind === 'off' && h('small', { text: it.brand || '商品' })),
        h('span', { class: 'item-k', text: `100gで ${n0(it.k)}kcal` })))));
  };
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 150); });
  sv.addEventListener('input', drawSum);
  foods.load().then(() => q.value.trim() && run()).catch(() => {});
  const sh = sheet('材料から料理を作る', [
    field('料理の名前', name),
    h('div', { class: 'grid2' }, field('何人分作った？', sv, '全部の量を人数で分ける')),
    h('h3', { text: '材料' }), rows,
    h('div', { class: 'search' }, q), res,
    tot, err,
    h('button', { class: 'btn primary wide', text: 'マイメニューに入れる', on: { click: () => {
      const nm = name.value.trim();
      if (!nm) { err.textContent = '料理の名前を入れてね'; name.focus(); return; }
      if (!items.length) { err.textContent = '材料を1つ以上足してね'; q.focus(); return; }
      const r = calc();
      store.addMine({ n: nm, q: '1人前', ...r.per, src: 'recipe', r: { sv: r.n, items: items.map(x => [x.it.n, x.g]) } });
      toast(`マイメニューに入れた：${nm}（1人前 ${n0(r.per.k)}kcal）`);
      sh.close();
      onSaved && onSaved();
    } } })
  ], { tall: true });
  drawRows();
  return sh;
}

/* ---- 写真判定の準備（進み具合つき） ---- */
export async function prepareUI(box) {
  const bar = h('progress', { max: 100, value: 0 });
  const txt = h('p', { class: 'note', text: '準備を始めるよ…' });
  add(box, bar, txt);
  try {
    await ai.prepare(p => {
      if (p.phase === 'dl' && p.total) { bar.value = Math.round(p.loaded / p.total * 100); txt.textContent = `ダウンロード中 ${Math.round(p.loaded / 1e6)}MB / ${Math.round(p.total / 1e6)}MB（画面はこのままで）`; }
      else if (p.phase === 'text') { bar.value = Math.round(p.done / p.total * 100); txt.textContent = `料理の特徴を作成中 ${p.done} / ${p.total}`; }
      else if (p.phase === 'vision') { bar.removeAttribute('value'); txt.textContent = '写真用のAIを読み込み中…'; }
    });
    txt.textContent = '準備できた！';
    bar.value = 100;
    return true;
  } catch (e) {
    txt.textContent = '準備できなかった：' + e.message + '。電波のいい所でもう一度試してね';
    txt.className = 'err';
    return false;
  }
}

/* ---- 記録の修正 ---- */
export async function editSheet(date, e) {
  let url = null;
  if (e.ph) { const b = await store.getPhoto(e.ph); if (b) url = URL.createObjectURL(b); }
  const body = [
    url && h('img', { class: 'preview', src: url, alt: e.n + 'の写真' }),
    h('div', { class: 'amt-kcal' }, h('strong', { text: n0(e.k) }), h('span', { text: 'kcal' })),
    h('p', { class: 'sub', text: `${jdate(date)} ${mealName(e.t)}・${e.q || ''}${e.at ? '・' + e.at : ''}` }),
    h('div', { class: 'pfc-row' }, pfcLine(e)),
    h('h3', { text: '食事を変える' }),
    mealChips(e.t, x => { store.updateMeal(date, e.id, { t: x }); rerender(); toast(mealName(x) + 'に移した'); }),
    h('div', { class: 'row-btns' },
      e.base && h('button', { class: 'btn ghost', text: '量を変える', on: { click: () => { sh.close(); amountSheet(fromBase(e), { date, edit: e }); } } }),
      !store.inMine(e) && h('button', { class: 'btn ghost', text: 'マイメニューに入れる', on: { click: ev => { store.addMine({ n: e.n, q: e.q, k: e.k, p: e.p, f: e.f, c: e.c, s: e.s, src: e.src }); ev.target.disabled = true; toast('マイメニューに入れた'); } } })),
    h('button', { class: 'btn danger wide', text: 'この記録を消す', on: { click: () => {
      const it = store.removeMeal(date, e.id);
      sh.close(); rerender();
      let undone = false;
      toast(`消した：${e.n}`, () => { undone = true; store.restoreMeal(date, it); rerender(); });
      if (e.ph) setTimeout(() => { if (!undone) store.delPhoto(e.ph); }, 6000);
    } } })
  ];
  const sh = sheet(e.n, body, { onClose: () => url && URL.revokeObjectURL(url) });
}

/* ---- 運動 ---- */
export function exerciseSheet(date = state.cur) {
  const w = store.latestWeight(date) || store.latestWeight();
  if (!w) { weightSheet(date, '運動の消費カロリーは体重から計算するから、先に体重を入れてね'); return; }
  const kg = w[1];
  let sel = null, min = 30;
  const q = h('input', { type: 'search', placeholder: '例：ウォーキング', 'aria-label': '運動の名前', autocomplete: 'off' });
  const list = h('ul', { class: 'list' });
  const res = h('div', { class: 'ex-res' });
  const inp = numInput({ value: '30', 'aria-label': '分' });
  const btn = h('button', { class: 'btn primary wide', text: '記録する', disabled: true, on: { click: save } });
  const drawList = () => {
    clear(list);
    const v = foods.norm(q.value);
    EXERCISES.filter(x => !v || foods.norm(x.n + x.y).includes(v)).forEach(x => add(list, h('li', {}, h('button', { class: 'item' + (sel === x ? ' on' : ''), on: { click: () => { sel = x; drawList(); drawRes(); } } },
      h('span', { class: 'item-n', text: x.n }), h('span', { class: 'item-k', text: `30分で ${burn(x.mets, kg, 30)}kcal` })))));
  };
  const drawRes = () => {
    clear(res);
    btn.disabled = !(sel && min > 0);
    if (sel) add(res, h('div', { class: 'amt-kcal' }, h('strong', { text: n0(burn(sel.mets, kg, min)) }), h('span', { text: 'kcal' })), h('p', { class: 'sub', text: `${sel.n}・${min}分（体重${n1(kg)}kgで計算）` }));
  };
  const chips = h('div', { class: 'chips' }, [10, 20, 30, 45, 60, 90].map(m => h('button', { class: 'chip', text: m + '分', on: { click: () => { min = m; inp.value = String(m); drawRes(); } } })));
  inp.addEventListener('input', () => { min = Math.min(600, Math.max(0, num(inp.value) || 0)); drawRes(); });
  q.addEventListener('input', drawList);
  const sh = sheet('運動を記録', [
    h('p', { class: 'note', text: '消費カロリー＝（メッツ−1）×体重×時間×1.05。安静にしていても使う分は引いてある。その日の「使える量」に足される' }),
    h('div', { class: 'search' }, q), list,
    h('h3', { text: '時間' }), chips, h('div', { class: 'amt-line' }, inp, h('span', { text: '分' })), res, btn
  ], { tall: true });
  drawList();
  function save() {
    const k = burn(sel.mets, kg, min);
    const it = store.addEx(date, { n: sel.n, mets: sel.mets, min, k });
    toast(`記録した：${sel.n} ${min}分 −${k}kcal`, () => { store.removeEx(date, it.id); rerender(); });
    sh.close(); rerender();
  }
}

/* ---- 体重 ---- */
export function weightSheet(date = state.cur, lead) {
  const cur = store.weights().find(x => x[0] === date);
  const last = store.latestWeight(date);
  const kg = numInput({ value: cur ? String(cur[1]) : '', placeholder: last ? String(last[1]) : '例：62.5' });
  const fat = numInput({ value: cur && cur[2] != null ? String(cur[2]) : '', placeholder: '体組成計があれば' });
  const err = h('p', { class: 'err', role: 'alert' });
  let recDate = date;
  const dateLine = h('p', { class: 'sub', text: jdate(date) + '（毎朝、トイレのあと・朝ごはんの前に量ると、くらべやすい）' });
  /* ヘルスケアから（設定で「ヘルスケア連携」をオンにした人だけ） */
  const hkOut = h('div', { class: 'hk-out', 'aria-live': 'polite' });
  const usePasted = text => {
    const r = parseWeight(text);
    if (!r) { hkOut.className = 'hk-out err'; hkOut.textContent = '体重が見つからなかった。ショートカットが動いたか確かめてね'; return false; }
    kg.value = String(r.kg);
    fat.value = r.fat != null ? String(r.fat) : '';
    recDate = r.date && r.date <= today() ? r.date : date;
    dateLine.textContent = jdate(recDate) + 'に記録する';
    hkOut.className = 'hk-out callout soft';
    hkOut.textContent = `ヘルスケアの記録：${n1(r.kg)}kg` + (r.fat != null ? `・体脂肪 ${n1(r.fat)}%` : '') + (r.date ? `（${jdate(r.date, false)}${r.time ? ' ' + r.time : ''}）` : '') + '。よければ「記録する」を押してね';
    return true;
  };
  const paste = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('no clipboard');
      const text = await navigator.clipboard.readText();
      if (usePasted(text)) return;
    } catch { }
    // 読めない時は、自分で貼り付けてもらう
    clear(hkOut); hkOut.className = 'hk-out';
    const box = h('input', { type: 'text', placeholder: 'ここを長押しして「ペースト」', autocomplete: 'off', 'aria-label': 'コピーした体重を貼り付ける' });
    box.addEventListener('input', () => usePasted(box.value));
    add(hkOut, h('p', { class: 'note', text: '自動で読めなかった。下の欄を長押しして「ペースト」してね' }), box);
    box.focus();
  };
  const hk = store.settings().hk && h('div', { class: 'hk-box' },
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn ghost small', text: '① ヘルスケアから取ってくる', on: { click: () => {
        clear(hkOut); hkOut.className = 'hk-out note';
        hkOut.textContent = `ショートカット「${SC_WEIGHT}」が動いて、体重をコピーする。終わったらこの画面に戻って②を押してね`;
        location.href = shortcutURL(SC_WEIGHT);
      } } }),
      h('button', { class: 'btn ghost small', text: '② 貼り付ける', on: { click: paste } })),
    hkOut);
  const sh = sheet('体重を記録', [
    lead && h('p', { class: 'lead', text: lead }),
    dateLine,
    h('div', { class: 'grid2' }, field('体重（kg）', kg), field('体脂肪率（%）', fat)),
    hk,
    err,
    h('button', { class: 'btn primary wide', text: '記録する', on: { click: () => {
      const v = num(kg.value), fv = num(fat.value);
      if (v == null || v < 20 || v > 300) { err.textContent = '体重を kg で入れてね（例：62.5）'; return; }
      if (fv != null && (fv < 2 || fv > 70)) { err.textContent = '体脂肪率は % で入れてね（例：24.5）'; return; }
      store.setWeight(recDate, Math.round(v * 10) / 10, fv == null ? null : Math.round(fv * 10) / 10);
      toast(recDate === date ? '体重を記録した' : `${jdate(recDate, false)}の体重を記録した`); sh.close(); rerender();
    } } }),
    cur && h('button', { class: 'btn ghost wide', text: 'この日の体重を消す', on: { click: () => { store.setWeight(date, null); sh.close(); rerender(); toast('消した'); } } })
  ]);
  setTimeout(() => kg.focus({ preventScroll: true }), 250);
}
