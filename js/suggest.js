/* 次の食事の提案：コンビニの組み合わせ・自炊レシピ・外食での選び方 */
import { dishes } from './foods.js';
import { RECIPES } from '../data/recipes.js';

const sum = list => list.reduce((a, x) => ({ k: a.k + x.k, p: a.p + (x.p || 0), f: a.f + (x.f || 0), c: a.c + (x.c || 0), s: a.s + (x.s || 0) }), { k: 0, p: 0, f: 0, c: 0, s: 0 });

/* コンビニ：主食・メイン1つ＋おかず0〜2つ（＋たんぱく質の多い飲み物）。予算の8〜10割に収まり、たんぱく質がとれる順 */
const family = n => n.split(/[ （(]/)[0];
const fitScore = (k, budget) => 1 - Math.abs(budget * 0.9 - k) / budget;     // 予算の9割くらいがちょうどいい
export function konbini(budget, protein = 0) {
  const all = dishes().filter(d => d.g === 'コンビニ' || (d.g === '果物乳' && d.r !== 'x'));
  const mains = all.filter(d => d.r === 'm'), sides = all.filter(d => d.r === 's'), drinks = all.filter(d => d.r === 'd' && d.p >= 5);
  const pGoal = protein > 0 ? protein : budget * 0.25 / 4;
  const combos = [];
  const push = items => {
    const fams = items.map(x => family(x.n));
    if (new Set(fams).size !== fams.length) return;          // 同じ種類を2つ入れない（サラダチキン2つ など）
    const t = sum(items);
    if (t.k > budget || t.k < budget * 0.5) return;
    combos.push({ items, t, score: fitScore(t.k, budget) * 2 + Math.min(t.p / pGoal, 1) * 1.5 - (t.s > 3.5 ? 0.4 : 0) - items.length * 0.05 });
  };
  const base = [];
  for (const m of mains) {
    base.push([m]);
    for (let i = 0; i < sides.length; i++) {
      base.push([m, sides[i]]);
      for (let j = i + 1; j < sides.length; j++) base.push([m, sides[i], sides[j]]);
    }
  }
  if (budget < 300) for (const sd of sides) { base.push([sd]); for (const s2 of sides) if (s2 !== sd) base.push([sd, s2]); }
  for (const b of base) { push(b); if (b.length <= 2) for (const d of drinks) push([...b, d]); }
  combos.sort((a, b) => b.score - a.score);
  const out = [], usedMain = new Set();
  for (const c of combos) {
    const key = c.items[0].n;
    if (usedMain.has(key)) continue;
    usedMain.add(key);
    out.push(c);
    if (out.length >= 6) break;
  }
  return out;
}

/* 自炊：主菜＋（汁物 or 副菜）＋ごはん少なめ の献立と、単品 */
const RICE = { n: 'ごはん（少なめ 100g）', k: 156, p: 2.5, f: 0.3, c: 37.1, s: 0 };
const RICE150 = { n: 'ごはん（茶碗1杯 150g）', k: 234, p: 3.8, f: 0.5, c: 55.7, s: 0 };
export function homeMeals(budget) {
  const mains = RECIPES.filter(r => r.tag === '主菜'), extras = RECIPES.filter(r => r.tag === '汁物' || r.tag === '副菜'), bowls = RECIPES.filter(r => r.tag === 'ごはん');
  const sets = [];
  for (const m of mains) for (const e of [null, ...extras]) for (const r of [null, RICE, RICE150]) {
    const items = [m, e, r].filter(Boolean);
    const t = sum(items);
    if (t.k > budget || t.k < budget * 0.5) continue;
    sets.push({ items, t, score: Math.min(t.p / (budget * 0.25 / 4), 1) * 1.5 + fitScore(t.k, budget) * 2 + (r ? 0.2 : 0) + (e ? 0.2 : 0) });
  }
  for (const b of bowls) for (const e of [null, ...extras]) {
    const items = [b, e].filter(Boolean);
    const t = sum(items);
    if (t.k > budget || t.k < budget * 0.5) continue;
    sets.push({ items, t, score: Math.min(t.p / (budget * 0.25 / 4), 1) * 1.5 + fitScore(t.k, budget) * 2 + 0.3 });
  }
  sets.sort((a, b) => b.score - a.score);
  const out = [], used = new Set();
  for (const st of sets) { if (used.has(st.items[0].n)) continue; used.add(st.items[0].n); out.push(st); if (out.length >= 5) break; }
  const singles = RECIPES.filter(r => r.k <= budget).sort((a, b) => b.p / b.k - a.p / a.k);
  return { sets: out, singles };
}

/* 外食：お店のジャンル別のコツ＋予算内のメニュー */
export const EATOUT_TIPS = [
  { g: '定食屋', tips: ['「ごはん少なめ」で頼む（茶碗1杯→少なめで約80kcal減）', '焼き魚・刺身・生姜焼きは、から揚げ・とんかつより200〜300kcal低い', 'おひたし・冷奴などの小鉢を足すと、おなかが満たされやすい'] },
  { g: 'ラーメン・麺', tips: ['スープを飲み干さない（塩分も大きく減る）', '替え玉・ライス・チャーハンのセットはやめておく', '塩・しょうゆ系は、とんこつ・味噌系より軽め。そばは、うどん・ラーメンより低め'] },
  { g: '牛丼・丼もの', tips: ['並盛＋サラダ（＋みそ汁）にする', 'ごはん少なめ・「つゆ抜き」が選べる店も多い', 'カツ丼・天丼は牛丼並盛より200kcal以上高い'] },
  { g: 'ファミレス・洋食', tips: ['ハンバーグは和風おろしソースにして、セットのパンかライスは1つだけ', 'ドリンクバーは無糖（お茶・ブラックコーヒー）に', 'クリーム系・チーズ系パスタより、トマト系・和風を選ぶ'] },
  { g: '回転寿司', tips: ['赤身・白身・えび・貝を中心に。1皿2貫で約60〜120kcal', 'マヨ系の軍艦・天ぷらの皿・サイドの揚げ物は高い', '最初にみそ汁や茶わん蒸しを頼むと、皿の数が減りやすい'] },
  { g: 'ハンバーガー', tips: ['ポテトはSサイズかサラダに替える', 'ドリンクは無糖。シェイクは1杯で300kcal以上ある', 'ダブル系は1個分の1.5〜2倍。単品のバーガーを選ぶ'] },
  { g: 'カフェ', tips: ['ラテは小さいサイズで。無脂肪乳・豆乳に替えられる店も', 'クリームたっぷりの冷たいドリンクは300〜500kcalある', 'ケーキは1つを分けるか、食べた日はほかの食事で調整（カロリー貯金を使う）'] }
];
export function eatout(budget) {
  return dishes().filter(d => ['和食', '麺', '丼', '洋食中華'].includes(d.g) && d.r === 'm' && d.k <= budget && d.k >= budget * 0.4)
    .map(d => ({ d, sc: fitScore(d.k, budget) * 2 + Math.min(d.p / (budget * 0.25 / 4), 1) * 1.5 - (d.s > 4 ? 0.3 : 0) }))
    .sort((a, b) => b.sc - a.sc).slice(0, 8).map(x => x.d);
}
