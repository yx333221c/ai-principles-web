/* 临时验算（定稿）：quality = exp(-((k-0.3)/0.6)^2)
   reward = quality + eps*1.5*exp(-((k-1.15)/0.75)^2)   —— 漏洞峰在 κ≈1.15
   J = reward - beta*k                                    —— 被优化的东西 */
const KMAX = 2.0, TH = 0.6;
const G = (k, c, w) => Math.exp(-((k - c) * (k - c)) / (w * w));
const quality = k => G(k, 0.3, 0.6);
const reward = (k, e) => quality(k) + e * 1.5 * G(k, 1.15, 0.75);
const obj = (k, e, b) => reward(k, e) - b * k;
function argmax(f, lo, hi) { let bk = lo, bv = -Infinity; for (let i = 0; i <= 4000; i++) { const k = lo + (hi - lo) * i / 4000; const v = f(k); if (v > bv) { bv = v; bk = k; } } return { k: bk, v: bv }; }
const qm = argmax(k => quality(k), 0, KMAX);
let mcK = KMAX;
for (let i = 0; i <= 4000; i++) { const k = qm.k + (KMAX - qm.k) * i / 4000; if (quality(k) < qm.v * TH) { mcK = k; break; } }
console.log('q峰 k=' + qm.k.toFixed(3) + ' v=' + qm.v.toFixed(3) + ' | q(0)=' + quality(0).toFixed(3) + ' q(2)=' + quality(2).toFixed(3) +
  ' | 塌缩阈 κ=' + mcK.toFixed(3) + ' 阈=' + (qm.v * TH).toFixed(3));
console.log('r(0) eps=1: ' + reward(0, 1).toFixed(3) + ' | J 的最小值可能为负，需要夹到 0');
for (const e of [0, 0.2, 0.55, 0.8, 1]) {
  const p = argmax(k => reward(k, e), 0, KMAX);
  console.log('\neps=' + e.toFixed(2) + '  r峰 κ=' + p.k.toFixed(2) + ' v=' + p.v.toFixed(2) + ' q(峰)=' + quality(p.k).toFixed(2) + (p.k > mcK ? '  ←r 峰已进塌缩区' : ''));
  for (const b of [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 1.0, 1.5, 2.0]) {
    const k = argmax(kk => obj(kk, e, b), 0, KMAX).k;
    const r = reward(k, e), q = quality(k);
    console.log('   β=' + b.toFixed(2) + ' κ*=' + k.toFixed(2) + ' J*=' + obj(k, e, b).toFixed(2) +
      ' r=' + r.toFixed(2) + ' q=' + q.toFixed(2) + ' gap=' + (r - q).toFixed(2) + (k > mcK ? '  [塌缩区]' : k < 0.05 ? '  [几乎没动]' : ''));
  }
}
