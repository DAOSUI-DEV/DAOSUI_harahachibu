/* 計算まわり：基礎代謝・1日の目安・安全装置・合計・カロリー貯金・体重の傾向 */
import { today, addDays, diffDays, weekStart } from './util.js';

export const PAL = [
  { v: 1.5, n: '低い', d: '座り仕事が中心で、運動はほとんどしない' },
  { v: 1.75, n: 'ふつう', d: '座り仕事が中心だけど、通勤・買い物・家事でよく歩く。軽い運動をすることもある' },
  { v: 2.0, n: '高い', d: '立ち仕事や移動が多い。または運動を週に何回もしている' }
];
export const KCAL_PER_KG = 7200;          // 体脂肪1kg ≒ 7,200kcal
export const MAX_DEFICIT = 750;           // 1日に減らすのは最大 750kcal まで
export const MAX_WEEK_PCT = 0.01;         // 1週間に体重の1%まで
export const REC_WEEK_PCT = 0.005;        // おすすめは1週間に体重の0.5%
export const MIN_BMI = 18.5;
export const SALT = { m: 7.5, f: 6.5 };   // 食塩相当量の目標（日本人の食事摂取基準）

const r10 = x => Math.round(x / 10) * 10;
export const ageNow = p => Math.floor(p.age + Math.max(0, diffDays(p.ageAt, today())) / 365.25 + 1e-9);

/* 基礎代謝（国立健康・栄養研究所の式） */
export function bmr(sex, kg, cm, age) {
  return (0.0481 * kg + 0.0234 * cm - 0.0138 * age - (sex === 'm' ? 0.4235 : 0.9708)) * 1000 / 4.186;
}

/* 目標の計算。安全装置で止めた時は target を出さずに、理由と代わりの期限を返す */
export function plan(p, kg) {
  if (!p || !p.height || !p.age || !p.sex || !kg) return { status: 'missing' };
  const age = ageNow(p);
  const m2 = (p.height / 100) ** 2;
  const out = { age, bmi: kg / m2, minGoalW: Math.ceil(MIN_BMI * m2 * 10) / 10, salt: SALT[p.sex] };
  if (age < 18) return { ...out, status: 'minor' };
  const B = bmr(p.sex, kg, p.height, age);
  const pal = (PAL[p.pal ?? 1] || PAL[1]).v;
  const tdee = B * pal;
  Object.assign(out, { bmr: B, tdee, pal });
  if (p.goalW != null && p.goalW < out.minGoalW) return { ...out, status: 'tooThin', goalBmi: p.goalW / m2 };

  const maxDef = Math.min(MAX_DEFICIT, tdee - B, MAX_WEEK_PCT * kg * KCAL_PER_KG / 7);
  const recDef = Math.min(500, REC_WEEK_PCT * kg * KCAL_PER_KG / 7, maxDef);
  const need = p.goalW == null ? 0 : kg - p.goalW;
  out.need = need;
  if (need > 0.2) {
    out.minDate = addDays(today(), Math.ceil(need * KCAL_PER_KG / maxDef));
    out.recDate = addDays(today(), Math.ceil(need * KCAL_PER_KG / recDef));
  }
  let target, deficit = 0;
  if (p.manual) {
    target = Math.max(r10(p.manual), Math.ceil(B / 10) * 10);
    out.status = p.manual < B ? 'manualRaised' : 'manual';
    deficit = tdee - target;
  } else if (need <= 0.2) {
    target = r10(tdee);
    out.status = 'maintain';
  } else {
    const days = p.goalDate ? diffDays(today(), p.goalDate) : 0;
    out.days = days;
    deficit = days > 0 ? need * KCAL_PER_KG / days : Infinity;
    if (deficit > maxDef + 0.5) return { ...out, status: 'tooFast', want: deficit, maxDef };
    target = r10(tdee - deficit);
    out.status = 'ok';
  }
  out.deficit = deficit;
  out.target = target;
  out.weekKg = deficit * 7 / KCAL_PER_KG;
  out.pfc = { p: target * 0.2 / 4, f: target * 0.25 / 9, c: target * 0.55 / 4 };
  return out;
}

/* その日の合計 */
export function totals(d) {
  const t = { k: 0, p: 0, f: 0, c: 0, s: 0, ex: 0, n: d.m.length, unknown: 0 };
  for (const e of d.m) {
    t.k += e.k || 0;
    if (e.p == null || e.f == null || e.c == null) t.unknown++;
    t.p += e.p || 0; t.f += e.f || 0; t.c += e.c || 0; t.s += e.s || 0;
  }
  for (const x of d.x) t.ex += x.k || 0;
  return t;
}
/* 食べた量 ÷ その日に使える量 で色を決める（今日のメーター用） */
export const meterLevel = (eaten, budget) => (!budget ? 'none' : eaten > budget ? 'over' : eaten >= budget * 0.9 ? 'near' : 'ok');
/* 終わった日の判定（カレンダー用） */
export const dayLevel = (eaten, budget, n) => (!n ? 'none' : !budget ? 'rec' : eaten <= budget ? 'ok' : eaten <= budget * 1.1 ? 'near' : 'over');

/* カロリー貯金（月曜はじまりの1週間）。dayFn(日付) → {t: totals, rec: 記録あり} */
export function bank(target, dayFn, ref = today()) {
  const ws = weekStart(ref);
  const days = [];
  let saved = 0, weekBudget = 0, weekEaten = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const { t, rec } = dayFn(d);
    const budget = target + (t ? t.ex : 0);
    const past = d < ref, isToday = d === ref;
    const diff = rec ? budget - t.k : null;
    if (past && rec) saved += diff;
    weekBudget += budget;
    if (d <= ref) weekEaten += rec ? t.k : (past ? budget : 0); // 記録なしの過去の日は「目安どおり食べた」とみなす
    days.push({ d, budget, eaten: rec ? t.k : null, diff, past, isToday, future: d > ref });
  }
  const todayRow = days.find(x => x.isToday);
  const todayLeft = todayRow ? Math.max(0, todayRow.budget - (todayRow.eaten || 0)) : 0;
  const future = days.filter(x => x.future).length;           // 明日から日曜まで
  const remain = weekBudget - weekEaten;                       // 今週あと食べられる量（今日の残りもふくむ）
  const savedDays = days.filter(x => x.past && x.diff != null).length;
  return { ws, days, saved, savedDays, remain, todayLeft, future, perDay: future ? (remain - todayLeft) / future : null };
}

/* 体重の傾向線（毎日のブレをならす）：指数平滑。1日あたり α=0.1、量らなかった日があっても時間で調整 */
export function trend(ws) {
  if (!ws.length) return [];
  const out = [];
  let tv = ws[0][1], i = 0, lastD = ws[0][0];
  for (let d = ws[0][0]; d <= ws[ws.length - 1][0]; d = addDays(d, 1)) {
    if (ws[i] && ws[i][0] === d) {
      const gap = Math.max(1, diffDays(lastD, d));
      tv = tv + (1 - 0.9 ** gap) * (ws[i][1] - tv);
      lastD = d; i++;
    }
    out.push([d, tv]);
  }
  return out;
}
/* 最近3週間の傾向から、目標に届く日を予想 */
export function projection(ws, goalW) {
  const tr = trend(ws);
  if (tr.length < 10 || ws.filter(w => w[0] >= tr[Math.max(0, tr.length - 21)][0]).length < 5) return null;
  const pts = tr.slice(-21);
  const x0 = pts[0][0];
  const xs = pts.map(p => diffDays(x0, p[0])), ys = pts.map(p => p[1]);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const slope = sxx ? sxy / sxx : 0;   // kg/日
  const now = tr[tr.length - 1][1];
  const res = { slope, weekKg: slope * 7, now };
  if (goalW != null && now > goalW && slope < -0.003) res.date = addDays(tr[tr.length - 1][0], Math.ceil((now - goalW) / -slope));
  return res;
}

/* 次の食事に使える量のめやす */
export function nextMealBudget(remain, d, hour = new Date().getHours()) {
  const has = t => d.m.some(e => e.t === t);
  let left;
  if (hour < 11) left = ['b', 'l', 'd'].filter(t => !has(t)).length;
  else if (hour < 16) left = ['l', 'd'].filter(t => !has(t)).length;
  else left = has('d') ? 0 : 1;
  return { left, kcal: left ? Math.max(0, remain / left) : Math.max(0, remain) };
}

/* 食事の区分 */
export const MEALS = [['b', '朝'], ['l', '昼'], ['d', '夜'], ['s', '間食']];
export const mealName = t => (MEALS.find(m => m[0] === t) || [, '間食'])[1];
export function mealNow(date = new Date()) {
  const m = date.getHours() * 60 + date.getMinutes();
  return m < 630 ? 'b' : m < 900 ? 'l' : m < 1050 ? 's' : 'd';
}
