'use strict';
/* 最终标定（第 2 轮）：确认 hint 里每条断言在 40 个 seed 上的成立比例 */
const TYPES = [
  { name: '强规律', P: [[.03, .91, .03, .03], [.03, .03, .91, .03], [.03, .03, .03, .91], [.91, .03, .03, .03]] },
  { name: '语言式', P: [[.05, .70, .20, .05], [.60, .05, .30, .05], [.15, .15, .15, .55], [.10, .10, .70, .10]] },
  { name: '纯随机', P: [[.25, .25, .25, .25], [.25, .25, .25, .25], [.25, .25, .25, .25], [.25, .25, .25, .25]] }
];
const stat = (M) => { let v = [.25, .25, .25, .25]; for (let it = 0; it < 300; it++) { const nv = [0, 0, 0, 0]; for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) nv[j] += v[k] * M[k][j]; v = nv; } return v; };
const Hrow = (r) => r.reduce((s, p) => p > 0 ? s - p * Math.log2(p) : s, 0);
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
const gen = (M, len, seed) => { const r = rng(seed), pi = stat(M), pick = (pr) => { let u = r(), a = 0; for (let j = 0; j < 4; j++) { a += pr[j]; if (u < a) return j; } return 3; }; const q = [pick(pi)]; for (let t = 1; t < len; t++) q.push(pick(M[q[t - 1]])); return q; };
const PAR = 1.2;
const est = (h, u, o) => { const par = o === 0 ? [.25, .25, .25, .25] : est(h, u, o - 1); const c = [0, 0, 0, 0]; if (u >= o) for (let t = o; t < u; t++) { let m = true; for (let b = 1; b <= o; b++) if (h[t - b] !== h[u - b]) { m = false; break; } if (m) c[h[t]]++; } const tot = c[0] + c[1] + c[2] + c[3]; const oo = c.map((x, j) => (x + PAR * par[j]) / (tot + PAR)); const s = oo.reduce((a, b) => a + b, 0); return oo.map(x => x / s); };
const cost = (q, o) => q.map((_, t) => -Math.log2(Math.max(est(q, t, o)[q[t]], 1e-12)));
const cum = (a, n) => a.slice(0, n).reduce((x, y) => x + y, 0);
const floorOf = (t, q) => { const pi = stat(t.P); return q.reduce((s, v, tt) => s - Math.log2(Math.max(tt === 0 ? pi[v] : t.P[q[tt - 1]][v], 1e-12)), 0); };

function span(label, idx, len, order, metric) {
  let mn = 9e9, mx = -9e9;
  for (let seed = 1; seed <= 40; seed++) { const q = gen(TYPES[idx].P, len, seed); const v = metric(q, idx, len); mn = Math.min(mn, v); mx = Math.max(mx, v); }
  console.log('  ' + label + ': ' + mn.toFixed(2) + ' ~ ' + mx.toFixed(2));
}
console.log('=== 压缩率区间（定长 ÷ 模型累计，o1） ===');
[18, 24, 36, 48, 60].forEach(len => span(TYPES[0].name + ' @' + len, 0, len, 1, (q, t, n) => 2 * n / cum(cost(q, 1), n)));
[18, 24, 36, 48, 60].forEach(len => span(TYPES[1].name + ' @' + len, 1, len, 1, (q, t, n) => 2 * n / cum(cost(q, 1), n)));
[36, 60].forEach(len => span(TYPES[2].name + ' @' + len, 2, len, 1, (q, t, n) => 2 * n / cum(cost(q, 1), n)));

console.log('\n=== 纯随机：地板线 vs 定长（应≈重合） ===');
[36, 60].forEach(len => span('地板/定长 @' + len, 2, len, 1, (q, t, n) => floorOf(TYPES[2], q) / (2 * n)));

console.log('\n=== order2 相对 order1 更省的 seed 比例 ===');
TYPES.forEach((t) => {
  [12, 24, 36, 60].forEach(n => {
    let w = 0; for (let seed = 1; seed <= 40; seed++) { const q = gen(t.P, 60, seed); if (cum(cost(q, 2), n) < cum(cost(q, 1), n)) w++; }
    console.log('  ' + t.name.padEnd(4) + ' 前' + String(n).padStart(2) + ' 个符号: ' + w + '/40');
  });
});

console.log('\n=== order0（只看频率）应始终接近定长 ===');
TYPES.forEach((t) => { let mn = 9e9, mx = -9e9; for (let seed = 1; seed <= 40; seed++) { const q = gen(t.P, 36, seed); const r = 72 / cum(cost(q, 0), 36); mn = Math.min(mn, r); mx = Math.max(mx, r); } console.log('  ' + t.name.padEnd(4) + ' o0 压缩率 @36: ' + mn.toFixed(2) + ' ~ ' + mx.toFixed(2)); });

console.log('\n=== 命中率（模型 argmax 全押 vs 25% 瞎猜基线），默认 seed=7 len=36 ===');
TYPES.forEach((t) => {
  const q = gen(t.P, 36, 7); let hits = 0;
  for (let tt = 0; tt < 36; tt++) { const p = est(q, tt, 1); let b = 0; for (let j = 1; j < 4; j++) if (p[j] > p[b]) b = j; if (b === q[tt]) hits++; }
  console.log('  ' + t.name.padEnd(4) + ' o1: ' + hits + '/36=' + (100 * hits / 36).toFixed(0) + '% | 你=' + (hits + (36 - hits) * 3) + ' | 模型=' + cum(cost(q, 1), 36).toFixed(1) + ' | 地板=' + floorOf(t, q).toFixed(1) + ' | 定长=72');
});
console.log('\n=== 默认 seed=7 len=36 三类型的四条线具体值（写进图注/hint） ===');
TYPES.forEach((t) => { const q = gen(t.P, 36, 7); console.log('  ' + t.name.padEnd(4) + ' 地板每符号=' + (floorOf(t, q) / 36).toFixed(2) + ' | o1 每符号=' + (cum(cost(q, 1), 36) / 36).toFixed(2)); });
