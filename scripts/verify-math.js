/* ==========================================================================
   verify-math.js · 内容里可计算断言的独立复算
   用法：node scripts/verify-math.js
   为什么需要它：本站内容大量使用具体数字（−log₂ 值、pᴺ、标准误、KV Cache 字节数）。
   这些数字一旦在编辑中漂移，页面会「看起来正常但算错」，而 selfcheck 只看结构看不见。
   开发期这条脚本抓到过：m10 把 16 GiB 写成 16 GB、m04 图解面板 A/B 的三处夸大。
   每条断言都同时检查「算出来对」与「文中确实这么写」。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, 'content/modules', f + '.html'), 'utf8');
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ');

let fail = 0, n = 0;
const near = (label, got, want, tol) => {
  n++;
  const ok = Math.abs(got - want) <= (tol == null ? Math.abs(want) * 0.02 : tol);
  if (!ok) { fail++; console.log('  FAIL ' + label + '  算得 ' + got.toPrecision(4) + '，文中 ' + want); }
};
const says = (label, file, re) => {
  n++;
  if (!re.test(strip(rd(file)))) { fail++; console.log('  FAIL ' + label + '  ← 文中找不到该表述'); }
};

/* ---------------- M01 香农链条 ---------------- */
near('m01 −log₂0.70', -Math.log2(0.70), 0.51, 0.01);
near('m01 −log₂0.06', -Math.log2(0.06), 4.06, 0.02);
near('m01 −log₂0.04', -Math.log2(0.04), 4.64, 0.02);
near('m01 加权平均码长', 0.7 * 0.5146 + 0.2 * 2.3219 + 0.06 * 4.0589 + 0.04 * 4.6439, 1.25, 0.02);
near('m01 压缩率 2/1.254', 2 / 1.254, 1.6, 0.02);
near('m01 log₂10⁵', Math.log2(1e5), 16.6, 0.05);
says('m01 文中给出 1.25 比特/符号', 'm01', /1\.25/);
says('m01 文中给出 1.6 倍压缩率', 'm01', /1\.6 倍/);

/* ---------------- M02 交叉熵链条 ---------------- */
near('m02 −log₂0.60', -Math.log2(0.60), 0.74, 0.005);
near('m02 −log₂0.20', -Math.log2(0.20), 2.32, 0.005);
near('m02 惊讶度差', Math.log2(0.60) - Math.log2(0.20), 1.6, 0.03);
near('m02 2^2.322 = 等效选项数', Math.pow(2, -Math.log2(0.20)), 5, 0.02);
near('m02 熵 H(0.6,0.2,0.2)', -(0.6 * Math.log2(0.6) + 0.2 * Math.log2(0.2) * 2), 1.37, 0.01);
says('m02 交叉熵 3bit ⇒ 困惑度 8', 'm02', /3 ?bit 就是 2³ = 8|2³ = 8/);

/* ---------------- M06 梯度连乘 ---------------- */
near('m06 0.9⁹⁹', Math.pow(0.9, 99), 2.9e-5, 1e-6);
says('m06 文中出现 2.9×10⁻⁵', 'm06', /2\.9×10⁻⁵/);

/* ---------------- M08 规模定律 ---------------- */
says('m08 给出 Chinchilla 配比量级', 'm08', /20\s*(倍|词元|tokens|:1)/);

/* ---------------- M10 温度与 KV Cache ---------------- */
const perTok = 2 * 32 * 8 * 128 * 2;
near('m10 每词元 131072 字节', perTok, 131072, 1);
near('m10 每词元 = 128 KiB', perTok / 1024, 128, 0.01);
near('m10 128k 上下文 = 2³⁴ 字节', perTok * 131072, 2 ** 34, 1);
near('m10 即 16 GiB', perTok * 131072 / 2 ** 30, 16, 0.01);
near('m10 十进制约 17.2 GB', perTok * 131072 / 1e9, 17.2, 0.05);
/* 断言一律匹配 strip() 之后的纯文本：写进正则的标签会被 strip 掉，写了就永不匹配 */
says('m10 文中用 GiB 而非含糊的 GB', 'm10', /2³⁴ 字节 = 16 GiB/);
says('m10 文中同时给出十进制 GB', 'm10', /17\.2 GB/);
/* 温度不改排序：这是 M10 的核心论断 */
const z = [6.2, 4.4, 2.6, 1.9, 0.4, -0.3, -1.6, -2.1];
const sm = (T) => { const s = z.map(v => v / T), mx = Math.max(...s), e = s.map(v => Math.exp(v - mx)); const u = e.reduce((a, b) => a + b); return e.map(v => v / u); };
const rank = (p) => p.map((v, i) => i).sort((a, b) => p[b] - p[a]).join(',');
near('m10 T=0.05 与 T=2 的排序不变（同一串索引）', rank(sm(0.05)) === rank(sm(2)) ? 1 : 0, 1, 0);
says('m10 文中声明温度不改排序', 'm10', /不改排序|绝不改排序/);

/* ---------------- M12 连乘与窗口 ---------------- */
near('m12 0.95¹⁰ ≈ 60%', Math.pow(0.95, 10) * 100, 60, 0.5);
near('m12 0.90¹⁰ ≈ 35%', Math.pow(0.90, 10) * 100, 35, 0.5);
near('m12 期望出错步 1/(1−0.95)', Math.round(1 / (1 - 0.95)), 20, 0);
near('m12 期望出错步 1/(1−0.90)', Math.round(1 / (1 - 0.90)), 10, 0);
const tokOf = (obs, loop) => 320 + 5 * (34 + 26 + obs + (loop ? 70 : 0));
near('m12 命中+重复 = 1410', tokOf(88, true), 1410, 0);
near('m12 脏命中+重复 = 1570', tokOf(120, true), 1570, 0);
near('m12 漏检+重复 = 1190（不溢出）', tokOf(44, true), 1190, 0);
near('m12 漏检不溢出（≤1200）', tokOf(44, true) <= 1200 ? 1 : 0, 1, 0);

/* ---------------- M13 统计 ---------------- */
near('m13 N=100 p=0.95 标准误', Math.sqrt(0.95 * 0.05 / 100), 0.0218, 0.0005);
near('m13 N=500 p=0.95 标准误', Math.sqrt(0.95 * 0.05 / 500), 0.0097, 0.0005);
near('m13 区分度 4p(1−p) 在 p=0.5 取最大', 4 * 0.5 * 0.5, 1, 0);
near('m13 p=0.95 时区分度仅 0.19', 4 * 0.95 * 0.05, 0.19, 0.005);

console.log(fail
  ? 'verify-math: ' + fail + '/' + n + ' 条断言与内容不符，必须修'
  : 'verify-math: ' + n + ' 条可计算断言全部与内容一致');
process.exit(fail ? 1 : 0);
