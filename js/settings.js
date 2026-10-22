/* 「設定」：目標（安全装置つき）・写真判定・バックアップ・データの削除・このアプリについて */
import { h, add, clear, sheet, toast, ask, numInput, field, n0, n1, num, today, addDays, diffDays, jdateY } from './util.js';
import * as store from './store.js';
import * as ai from './ai.js';
import * as foods from './foods.js';
import { plan, PAL, ageNow } from './calc.js';
import { makeBackup, readBackup, restore, saveFile } from './backup.js';
import { prepareUI } from './add.js';
import { rerender } from './state.js';

export const VERSION = '1.0.0';

function radios(name, opts, cur, onPick) {
  const wrap = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': name });
  const draw = sel => { clear(wrap); opts.forEach(([v, l]) => add(wrap, h('button', { class: 'chip' + (v === sel ? ' on' : ''), role: 'radio', 'aria-checked': String(v === sel), text: l, on: { click: () => { draw(v); onPick(v); } } }))); };
  draw(cur);
  return wrap;
}

export function goalSheet() {
  const p0 = store.profile() || {};
  const lw = store.latestWeight();
  const f = { sex: p0.sex || null, pal: p0.pal ?? 1 };
  const age = numInput({ value: p0.age ? String(ageNow(p0)) : '', placeholder: '例：35' });
  const ht = numInput({ value: p0.height ? String(p0.height) : '', placeholder: '例：165' });
  const wt = numInput({ value: lw ? String(lw[1]) : '', placeholder: '例：68.5' });
  const gw = numInput({ value: p0.goalW != null ? String(p0.goalW) : '', placeholder: '例：62' });
  const gd = h('input', { type: 'date', min: addDays(today(), 7), value: p0.goalDate && p0.goalDate > today() ? p0.goalDate : addDays(today(), 120) });
  const man = numInput({ value: p0.manual ? String(p0.manual) : '', placeholder: '空欄なら自動で計算' });
  const palBox = h('div', { class: 'pal' });
  const drawPal = () => { clear(palBox); PAL.forEach((x, i) => add(palBox, h('button', { class: 'pal-opt' + (f.pal === i ? ' on' : ''), role: 'radio', 'aria-checked': String(f.pal === i), on: { click: () => { f.pal = i; drawPal(); calc(); } } }, h('b', { text: x.n }), h('span', { text: x.d })))); };
  drawPal();
  const res = h('div', { class: 'goal-res', 'aria-live': 'polite' });
  const saveBtn = h('button', { class: 'btn primary wide', text: 'この目標にする', on: { click: save } });
  let pl = null, cur = null;
  [age, ht, wt, gw, man].forEach(i => i.addEventListener('input', calc));
  gd.addEventListener('change', calc);

  function read() {
    return { sex: f.sex, age: num(age.value), ageAt: today(), height: num(ht.value), pal: f.pal, goalW: num(gw.value), goalDate: gd.value || null, manual: num(man.value) || null };
  }
  function calc() {
    cur = read();
    const w = num(wt.value);
    clear(res);
    const bad = [];
    if (!cur.sex) bad.push('性別');
    if (!(cur.age >= 5 && cur.age <= 110)) bad.push('年齢');
    if (!(cur.height >= 100 && cur.height <= 230)) bad.push('身長');
    if (!(w >= 20 && w <= 300)) bad.push('今の体重');
    if (!(cur.goalW >= 20 && cur.goalW <= 300)) bad.push('目標体重');
    if (bad.length) { pl = null; saveBtn.disabled = true; add(res, h('p', { class: 'note', text: bad.join('・') + ' を入れると計算できる' })); return; }
    pl = plan(cur, w);
    saveBtn.disabled = !['ok', 'maintain', 'manual', 'manualRaised', 'minor'].includes(pl.status);
    const setDate = d => { gd.value = d; calc(); };
    if (pl.status === 'minor') {
      add(res, h('p', { class: 'callout', text: '18歳未満は、成長に必要な栄養がたくさんいるので、目標カロリーは出さないよ。記録とグラフだけ使ってね。体重のことが気になる時は、家族や学校・病院の先生に相談しよう' }));
      return;
    }
    if (pl.status === 'tooThin') {
      add(res, h('p', { class: 'callout', text: `目標体重 ${n1(cur.goalW)}kg は BMI ${n1(pl.goalBmi)} で、やせすぎ（BMI 18.5 未満）になる。体に良くないので、この目標は設定できない` }),
        h('button', { class: 'btn ghost', text: `目標を ${n1(pl.minGoalW)}kg にする（BMI 18.5）`, on: { click: () => { gw.value = String(pl.minGoalW); calc(); } } }));
      return;
    }
    if (pl.status === 'tooFast') {
      add(res, h('p', { class: 'callout', text: `この期限だと、1日に ${n0(pl.want)}kcal 減らすことになって急すぎる（減らすのは1日 ${n0(pl.maxDef)}kcal まで）。急に減らすと筋肉が落ちたり、リバウンドしやすい。期限をのばそう` }),
        h('div', { class: 'row-btns col' },
          h('button', { class: 'btn primary', text: `おすすめ：${jdateY(pl.recDate)}まで（1週間に体重の0.5%）`, on: { click: () => setDate(pl.recDate) } }),
          h('button', { class: 'btn ghost', text: `いちばん早くて：${jdateY(pl.minDate)}まで`, on: { click: () => setDate(pl.minDate) } })));
      return;
    }
    add(res,
      h('p', { class: 'big' }, h('small', { text: '1日の目安' }), h('strong', { text: n0(pl.target) }), h('small', { text: 'kcal' })),
      h('dl', { class: 'facts' },
        h('dt', { text: '基礎代謝' }), h('dd', { text: `${n0(pl.bmr)}kcal（何もしなくても使う量）` }),
        h('dt', { text: '1日に使う量' }), h('dd', { text: `${n0(pl.tdee)}kcal（基礎代謝×${pl.pal}）` }),
        pl.status === 'ok' && [h('dt', { text: '減らす量' }), h('dd', { text: `1日 ${n0(pl.deficit)}kcal → 1週間に約 ${n1(pl.weekKg)}kg` }),
          h('dt', { text: '期限まで' }), h('dd', { text: `${pl.days}日（${n1(pl.need)}kg 減らす）` })],
        h('dt', { text: '栄養の目安' }), h('dd', { text: `たんぱく質 ${n0(pl.pfc.p)}g・脂質 ${n0(pl.pfc.f)}g・炭水化物 ${n0(pl.pfc.c)}g・塩分 ${n1(pl.salt)}g未満` })),
      pl.status === 'maintain' && h('p', { class: 'note', text: '目標体重が今の体重とほぼ同じ（または上）なので、今の体重をキープする量にした' }),
      pl.status === 'manualRaised' && h('p', { class: 'callout soft', text: `基礎代謝（${n0(pl.bmr)}kcal）より少ない目安はつけられないので、${n0(pl.target)}kcal にした` }),
      pl.status === 'ok' && pl.recDate && pl.days < diffDays(today(), pl.recDate) && h('p', { class: 'note', text: `もっとゆっくりなら：${jdateY(pl.recDate)}までにすると1週間に体重の0.5%ペースで、続けやすい` }));
  }

  const sh = sheet('目標を決める', [
    h('p', { class: 'note', text: '入れた数字はこのスマホの中だけに保存する。外には送らない' }),
    h('h3', { text: '性別（基礎代謝の計算に使う）' }),
    radios('性別', [['f', '女性'], ['m', '男性']], f.sex, v => { f.sex = v; calc(); }),
    h('div', { class: 'grid2' }, field('年齢', age), field('身長（cm）', ht), field('今の体重（kg）', wt), field('目標体重（kg）', gw)),
    field('いつまでに', gd),
    h('h3', { text: 'ふだんの動き' }), palBox,
    h('details', { class: 'more' }, h('summary', { text: '1日の目安を自分で決める' }),
      field('1日の目安（kcal）', man, '基礎代謝より下にはできない（体を守るため）')),
    res, saveBtn,
    h('p', { class: 'note', text: '妊娠中・授乳中の人、持病がある人、治療中の人は、目標を決める前にお医者さんに相談してね。基礎代謝は国立健康・栄養研究所の式で計算した目安' })
  ], { tall: true });
  calc();

  function save() {
    if (!pl || saveBtn.disabled) return;
    const w = num(wt.value);
    const lw2 = store.latestWeight();
    if (!lw2 || lw2[0] !== today() || lw2[1] !== w) store.setWeight(today(), Math.round(w * 10) / 10, store.weights().find(x => x[0] === today())?.[2] ?? null);
    store.setProfile({ ...cur, salt: pl.salt, bmr: Math.round(pl.bmr || 0), target: pl.target ?? null, setAt: today(), setW: w });
    if (pl.target) store.pushTarget(today(), pl.target, { p: Math.round(pl.pfc.p), f: Math.round(pl.pfc.f), c: Math.round(pl.pfc.c) });
    else store.pushTarget(today(), null);
    toast(pl.target ? `目標を決めた：1日 ${n0(pl.target)}kcal` : '保存した');
    sh.close();
    rerender();
  }
}

/* バックアップを作る */
function backupSheet() {
  const p1 = h('input', { type: 'password', autocomplete: 'new-password' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary wide', text: 'バックアップを作る', on: { click: go } });
  const sh = sheet('バックアップを作る', [
    h('p', { class: 'lead', text: '記録と写真を1つのファイルにまとめて、パスワードで暗号化する。機種変更の時や、念のための保存に使ってね' }),
    field('パスワード（8文字以上）', p1), field('もう一度', p2),
    h('p', { class: 'note', text: 'パスワードを忘れると、誰にも（作った人にも）戻せない。メモしておいてね' }),
    err, btn]);
  async function go() {
    if (p1.value.length < 8) { err.textContent = 'パスワードは8文字以上にしてね'; return; }
    if (p1.value !== p2.value) { err.textContent = 'パスワードが一致しない'; return; }
    btn.disabled = true; btn.textContent = '作成中…';
    try {
      const blob = await makeBackup(p1.value);
      const r = await saveFile(blob, `harahachibu-${today()}.hhb`);
      if (r !== 'cancel') { store.setSettings({ lastBackup: today() }); toast('バックアップを作った'); sh.close(); rerender(); }
      else { btn.disabled = false; btn.textContent = 'バックアップを作る'; }
    } catch (e) { err.textContent = '作れなかった：' + e.message; btn.disabled = false; btn.textContent = 'バックアップを作る'; }
  }
}
function restoreSheet() {
  const file = h('input', { type: 'file', accept: '.hhb,application/octet-stream,application/json' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary wide', text: '戻す', on: { click: go } });
  const sh = sheet('バックアップから戻す', [
    h('p', { class: 'lead', text: '今このスマホにある記録は、バックアップの中身で置きかわる' }),
    field('バックアップのファイル', file), field('パスワード', pw), err, btn]);
  async function go() {
    if (!file.files[0]) { err.textContent = 'ファイルを選んでね'; return; }
    btn.disabled = true; btn.textContent = '確認中…';
    try {
      const d = await readBackup(file.files[0], pw.value);
      if (!(await ask('記録を置きかえる', `${d.at ? jdateY(d.at.slice(0, 10)) + 'の' : ''}バックアップで置きかえる？ 今の記録は消える`, '置きかえる', { danger: true }))) { btn.disabled = false; btn.textContent = '戻す'; return; }
      await restore(d);
      toast('バックアップから戻した');
      sh.close(); rerender();
    } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = '戻す'; }
  }
}
function wipeSheet() {
  const inp = h('input', { type: 'text', autocomplete: 'off', placeholder: 'けす' });
  const btn = h('button', { class: 'btn danger wide', text: 'すべて消す', disabled: true, on: { click: async () => {
    try { await ai.remove(); } catch { }
    await store.wipeAll();
    toast('すべて消した'); sh.close(); rerender();
  } } });
  inp.addEventListener('input', () => (btn.disabled = inp.value.trim() !== 'けす'));
  const sh = sheet('すべての記録を消す', [
    h('p', { class: 'lead', text: '食事・運動・体重・写真・目標・マイメニューをこのスマホから全部消す。元に戻せない' }),
    field('消すなら「けす」と入れてね', inp), btn]);
}

export async function renderSettings(root) {
  const p = store.profile();
  const st = store.settings();
  const tg = store.targetFor(today());
  const lw = store.latestWeight();
  const goal = h('section', { class: 'side-block' }, h('h2', { text: '目標' }));
  if (p) {
    add(goal, h('dl', { class: 'facts' },
      tg ? [h('dt', { text: '1日の目安' }), h('dd', { text: `${n0(tg.k)}kcal` })] : [h('dt', { text: '1日の目安' }), h('dd', { text: 'なし（記録だけ）' })],
      p.goalW != null && [h('dt', { text: '目標体重' }), h('dd', { text: `${n1(p.goalW)}kg${p.goalDate && p.target && !p.manual ? `（${jdateY(p.goalDate)}まで）` : ''}` })],
      h('dt', { text: 'ふだんの動き' }), h('dd', { text: (PAL[p.pal] || PAL[1]).n }),
      h('dt', { text: '決めた日' }), h('dd', { text: jdateY(p.setAt) })),
      lw && p.setW && Math.abs(lw[1] - p.setW) >= 2 && h('p', { class: 'callout soft', text: `目標を決めた時から体重が ${n1(Math.abs(lw[1] - p.setW))}kg 変わった。計算し直すと目安が変わるよ` }),
      h('button', { class: 'btn ghost wide', text: '目標を変える・計算し直す', on: { click: goalSheet } }));
  } else add(goal, h('p', { class: 'note', text: '身長・体重・目標体重・期限から、1日の目安を計算する' }), h('button', { class: 'btn primary wide', text: '目標を決める', on: { click: goalSheet } }));

  const aiBox = h('section', { class: 'side-block' }, h('h2', { text: '写真判定' }));
  if (st.ai === 'ready') add(aiBox, h('p', { text: '準備できている。写真から料理の候補を出せる' }),
    h('button', { class: 'btn ghost wide', text: 'AIのデータを消す（約105MB空く）', on: { click: async () => { if (await ask('AIのデータを消す', '写真判定が使えなくなる。また使う時は、もう一度ダウンロードがいる', '消す')) { await ai.remove(); toast('消した'); rerender(); } } } }));
  else {
    const box = h('div', {});
    add(aiBox, h('p', { text: '写真から料理の候補を出す機能。判定はスマホの中だけでして、写真は外に送らない' }), h('p', { class: 'note', text: ai.SIZE_NOTE }), box,
      h('button', { class: 'btn primary wide', text: '写真判定を準備する', on: { click: async e => { e.target.disabled = true; const ok = await prepareUI(box); if (ok) setTimeout(rerender, 800); else e.target.disabled = false; } } }));
  }

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const home = !standalone && h('section', { class: 'side-block' }, h('h2', { text: 'ホーム画面に追加しよう' }),
    h('ol', { class: 'steps' }, h('li', { text: 'Safariの下にある共有ボタン（四角から矢印）をタップ' }), h('li', { text: '「ホーム画面に追加」をタップ' }), h('li', { text: 'ホーム画面の「はらはちぶ」から開く' })),
    h('p', { class: 'note', text: 'Safariのまま使うと、しばらく開かない日が続いた時に記録が消されることがある。ホーム画面から使うと消えにくい。それでも念のためバックアップを' }));

  const usage = h('p', { class: 'note' });
  navigator.storage?.estimate?.().then(e => { usage.textContent = `このアプリが使っている容量：約${n1((e.usage || 0) / 1e6)}MB`; }).catch(() => {});
  const data = h('section', { class: 'side-block' }, h('h2', { text: 'データ' }),
    h('p', { class: 'note', text: st.lastBackup ? `最後のバックアップ：${jdateY(st.lastBackup)}` : 'まだバックアップしていない' }),
    h('div', { class: 'row-btns col' },
      h('button', { class: 'btn ghost', text: 'バックアップを作る（暗号化）', on: { click: backupSheet } }),
      h('button', { class: 'btn ghost', text: 'バックアップから戻す', on: { click: restoreSheet } }),
      h('button', { class: 'btn ghost', text: '使っていない写真を整理', on: { click: async () => { const n = await store.cleanupPhotos(); toast(n ? `${n}枚消した` : '整理する写真はなかった'); } } }),
      h('button', { class: 'btn danger', text: 'すべての記録を消す', on: { click: wipeSheet } })),
    usage);

  const about = h('section', { class: 'side-block about' }, h('h2', { text: 'このアプリについて' }),
    h('ul', { class: 'dots' },
      h('li', { text: '記録・体重・写真・目標は、このスマホの中だけに保存。サーバーには送らない（ログインもない）' }),
      h('li', { text: 'インターネットを使うのは、アプリ本体の読み込みと、写真判定のAIデータの初回ダウンロード（Hugging Face から）だけ' }),
      h('li', { text: '写真は保存する時に小さくして、位置情報などの付加情報を消している' })),
    h('h3', { text: '出典' }),
    h('p', { class: 'note', text: '食品の成分：' + (foods.cite() || '日本食品標準成分表（八訂）増補2023年から引用') + '（文部科学省）。料理・コンビニの値は成分表などをもとにした目安で、店や作り方で変わる' }),
    h('p', { class: 'note', text: '運動のメッツ：国立健康・栄養研究所「改訂版 身体活動のメッツ（METs）表」を参考にした目安。基礎代謝：国立健康・栄養研究所の式' }),
    h('h3', { text: '使っているもの' }),
    h('ul', { class: 'dots small' },
      h('li', {}, 'Transformers.js（Apache-2.0）', ' ', h('a', { href: 'vendor/transformers/transformers.LICENSE.txt', text: 'ライセンス' })),
      h('li', {}, 'ONNX Runtime Web（MIT）', ' ', h('a', { href: 'vendor/transformers/ONNXRUNTIME.LICENSE.txt', text: 'ライセンス' })),
      h('li', { text: 'OpenAI CLIP ViT-B/32（MIT）：写真判定のAI。Hugging Face の Xenova/clip-vit-base-patch32 から各スマホでダウンロード' }),
      h('li', {}, 'Zen Maru Gothic（SIL Open Font License 1.1）', ' ', h('a', { href: 'fonts/OFL-zen-maru-gothic.txt', text: 'ライセンス' }))),
    h('p', { class: 'note', text: 'このアプリの計算は目安で、医療のアドバイスではない。体調が気になる時はお医者さんに相談してね。バージョン ' + VERSION }));

  add(root, h('header', { class: 'dayhead' }, h('h1', { text: '設定' })), goal, aiBox, home, data, about);
}
