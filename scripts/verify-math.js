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
/* 悬空断言元检查（2026-10 复核要求）：
   脚本注释宣称「每条断言都同时检查算出来对与文中确实这么写」，但实测有 2 条 near()
   复算的是正文里根本不存在的数（m01 的 16.6、m02 的 1.37）——它们不会误报，
   只会让人误信「被复算覆盖的每个数都在正文里」。
   现在每条 near 的 want 都必须能在对应模块正文里搜到（opts.bool 显式豁免布尔/中间量断言）。 */
const needs = [];
/* 候选形式必须「代表同一个数」，且必须独立成数。
   两代 bug 都栽在这：
   ① 早期用裸 includes()，formsOf(0.0218) 含单字符 "0"，任何正文都命中 → 假绿；
   ② 我改成数字边界后**仍然假绿**：0.0218 四舍五入到 0 位就是 "0"，
      而正文里当然有独立的 "0"。"0" 压根不是 0.0218 的表示。
   所以每个形式都带上它「代表的值」，与 want 差超过 5% 的一律不算命中。
   尾零也要留成字符串：正文写「0.70 bit」时，只有解析后的 "0.7"
   会被边界判据拒掉（后面紧贴 0），于是又退回去撞别的数。 */
const numHit = (body, s) => {
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![\\d.])' + esc + '(?![\\d.])').test(body);
};
/* 断言值的「书写精度」：正文只写 −0.6 时，不能拿它当 −0.608 的证据。
   早先按 5% 相对容差放行所有舍入形式，结果 m05 的 ∂L/∂a₁=−0.608
   是靠网络权重 w₂₁=−0.6 命中的——一个毫不相干的数。
   现在只接受「精度不低于断言字面」的形式：−0.608 认 −0.608/−0.6080，
   不认 −0.61/−0.6。要匹配更粗的写法，用 {alt:['…']} 显式登记正文原话。 */
const decOf = (w) => {
  const s = String(w);
  if (s.includes('e') || s.includes('E')) {
    const m = s.match(/\.(\d+)e/i);
    return m ? m[1].length : 0;
  }
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};
const formsOf = (w) => {
  const out = [], seen = new Set();
  const dw = decOf(w);
  const add = (s, val) => {
    s = String(s);
    if (!s || s === 'NaN' || s === 'Infinity' || seen.has(s)) return;
    if (!isFinite(val) || Math.abs(val - w) > Math.abs(w) * 0.05 + 1e-12) return;
    seen.add(s); out.push(s);
    /* 正文用真减号 U+2212 写负数（−0.608），而 String(-0.608) 给 ASCII 连字符 */
    if (s[0] === '-') {
      const uni = '−' + s.slice(1);
      if (!seen.has(uni)) { seen.add(uni); out.push(uni); }
    }
  };
  add(w, w);
  for (let d = dw; d <= Math.max(dw, 4); d++) {
    const s = Number(w).toFixed(d);
    add(s, Number(s));
  }
  /* 百分数：只在断言本身写得足够细时才生成（0.0097 → 0.97 需要 4 位精度） */
  if (Math.abs(w) < 1) for (let d = dw; d <= Math.max(dw, 2); d++) {
    const s = (w * 100).toFixed(d);
    add(s, Number(s) / 100);
  }
  /* 科学计数法：正文写 2.9×10⁻⁵ 或 1.8e-2，断言里是 2.9e-5。
     指数符号两种都要收：toExponential 对大数给 "8.4e+22"（带 +），
     正则只写 -?\d+ 会把这类整条漏掉（实测 m08 的 8.4e22 因此无候选形式）。 */
  const ex = String(Number(w).toExponential()).match(/^([-\d.]+)e([+-]?\d+)$/);
  if (ex) {
    const e10 = Number(ex[2]), mdw = decOf(w);
    for (let d = mdw; d <= Math.max(mdw, 3); d++) {
      const mant = +Number(ex[1]).toFixed(d);
      add(mant + 'e' + e10, mant * Math.pow(10, e10));
      /* 正文用上标记法写数量级（8.4×10²²、2.9×10⁻⁵）。
         先剥掉前导 +：'+' 映成空串会让长度校验失败，10²² 就生成不出来。 */
      const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
      const eStr = String(ex[2]).replace(/^\+/, '');
      const sup = eStr.split('').map(c => SUP[c]).join('');
      if (sup.length === eStr.length) {
        add(mant + '×10' + sup, mant * Math.pow(10, e10));
        add(mant + ' × 10' + sup, mant * Math.pow(10, e10));
      }
    }
  }
  return out;
};
let nearCalls = 0, boolCalls = 0;
const near = (label, got, want, tol, opts) => {
  n++; nearCalls++;
  const o = opts || {};
  const pass = Math.abs(got - want) <= (tol == null ? Math.abs(want) * 0.02 : tol);
  if (!pass) { fail++; console.log('  FAIL ' + label + '  算得 ' + got.toPrecision(4) + '，文中 ' + want); }
  if (o.bool) boolCalls++;
  else {
    const file = o.file || (label.match(/m\d\d/) || [])[0];
    needs.push({ label, want, file, alt: o.alt || [], demo: o.demo || null });
  }
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
/* 旧版这里有 near('m01 log₂10⁵', …, 16.6)：正文既无 16.6 也无 10⁵（grep 全站 0 命中），
   属早期版本删改后遗留的悬空断言。2026-10 复核指出后删除，并加下方元检查防复发。 */
says('m01 文中给出 1.25 比特/符号', 'm01', /1\.25/);
says('m01 文中给出 1.6 倍压缩率', 'm01', /1\.6 倍/);
/* B1 修复（2026-10 复核）：正文原先把「理想码长」与「某套具体前缀码的平均码长」
   混为一谈，写了个任何口径都推不出的 1.34。现在两套码分开算，逐格复算： */
near('m01 Huffman(1,2,3,3) 平均码长', 0.7 * 1 + 0.2 * 2 + 0.06 * 3 + 0.04 * 3, 1.40, 0.005);
near('m01 次优码(1,2,4,4) 平均码长', 0.7 * 1 + 0.2 * 2 + 0.06 * 4 + 0.04 * 4, 1.50, 0.005);
near('m01 每 100 符号 Huffman 总长', 70 * 1 + 20 * 2 + 6 * 3 + 4 * 3, 140, 0);
near('m01 取整损失（Huffman 减熵）', 1.40 - (0.7 * 0.5146 + 0.2 * 2.3219 + 0.06 * 4.0589 + 0.04 * 4.6439), 0.15, 0.005);

/* ---------------- M02 交叉熵链条 ---------------- */
near('m02 −log₂0.60', -Math.log2(0.60), 0.74, 0.005);
near('m02 −log₂0.20', -Math.log2(0.20), 2.32, 0.005);
near('m02 惊讶度差', Math.log2(0.60) - Math.log2(0.20), 1.6, 0.03);
near('m02 2^2.322 = 等效选项数', Math.pow(2, -Math.log2(0.20)), 5, 0.02);
/* m02 加权表（模块核心教具）：q=(0.50,0.30,0.20)、p=(0.60,0.20,0.20)。
   旧版这里是一条 near('m02 熵 H(0.6,0.2,0.2)', …, 1.37) —— 复算的是正文里
   根本不存在的分布（2026-10 复核判为悬空断言），现改为逐格复算正文真表。 */
const q = [0.50, 0.30, 0.20], pm = [0.60, 0.20, 0.20];
const surp = pm.map(v => -Math.log2(v));
near('m02 惊讶度三格', surp[0], 0.74, 0.01);
near('m02 茶/水的惊讶度', surp[1], 2.32, 0.01);
const contrib = q.map((v, i) => v * surp[i]);
near('m02 贡献 0.37', contrib[0], 0.37, 0.005);
near('m02 贡献 0.70', contrib[1], 0.70, 0.005);
near('m02 贡献 0.46', contrib[2], 0.46, 0.005);
const Hqp = contrib.reduce((a, b) => a + b);
const Hq = -q.reduce((a, v) => a + v * Math.log2(v), 0);
near('m02 交叉熵 H(q,p)=1.53', Hqp, 1.53, 0.005);
near('m02 熵 H(q)=1.49', Hq, 1.49, 0.005);
near('m02 KL=0.04', Hqp - Hq, 0.04, 0.005);
near('m02 困惑度 2^1.53=2.89', Math.pow(2, Hqp), 2.89, 0.01);
near('m02 困惑度 2^1.49=2.80', Math.pow(2, Hq), 2.80, 0.01);
says('m02 文中给出 1.53 bit', 'm02', /= 1\.53 bit/);
says('m02 文中给出 1.49 bit', 'm02', /= 1\.49 bit/);
says('m02 文中给出 0.04 bit', 'm02', /= 1\.53 − 1\.49 = 0\.04 bit/);
says('m02 文中给出 2.89 与 2.80', 'm02', /= 2\.89 个选项.*?2\.80/s);
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
near('m10 128k 上下文 = 2³⁴ 字节', perTok * 131072, 2 ** 34, 1, { alt: ['2³⁴'] });
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
/* 这三条的数出现在演示源码的读数表里（正文只讲机制不报具体词元数），
   所以归属标成 demo 文件：改了演示的账目而没改这里，或反过来，都会被抓到。 */
const M12JS = 'assets/js/demos/m12-agent-timeline.js';
near('m12 命中+重复 = 1410', tokOf(88, true), 1410, 0, { demo: M12JS });
near('m12 脏命中+重复 = 1570', tokOf(120, true), 1570, 0, { demo: M12JS });
near('m12 漏检+重复 = 1190（不溢出）', tokOf(44, true), 1190, 0, { demo: M12JS });
near('m12 漏检不溢出（≤1200）', tokOf(44, true) <= 1200 ? 1 : 0, 1, 0, { bool: true });

/* ---------------- M13 统计 ---------------- */
/* 这三条原先复算的是 0.0218 / 0.19 这类**正文从未印出的数**（收紧元检查后被抓出）。
   它们不守护任何东西：√(0.95×0.05/100) 永远等于 0.0218，与页面无关。
   现在改成复算正文真正写出的那几句，才算真在防漂移。 */
near('m13 N=500 p=0.95 标准误 ±0.97 分', Math.sqrt(0.95 * 0.05 / 500) * 100, 0.97, 0.01, { alt: ['±0.97 分'] });
/* 元检查只问「这个数在不在正文」，而 0.97 的百分数形式 97 会在别处命中，
   所以「±0.97 分」这句原文得由 says() 守——两者分工，别指望前者。 */
says('m13 正文印出「±0.97 分」', 'm13', /±0\.97 分/);
near('m13 区分度在 p=0.5 取最大值 1', 4 * 0.5 * 0.5, 1, 0, { alt: ['最大值 1'] });
near('m13 p=0.99 时区分度几乎归零', 4 * 0.99 * 0.01, 0.04, 0.005, { alt: ['几乎归零'] });
says('m13 正文给出 SE 公式', 'm13', /√\(p/);
says('m13 正文给出区分度式 4·p·(1−p)', 'm13', /4\s*·\s*p\s*·\s*\(1\s*−\s*p\)/);

/* ---------------- M04 梯度下降（图解面板与误区里的量化断言）----------------
   地形与演示一致：碗形两轴 a=3；峡谷横陡 a=3 / 纵平 a=0.05；起点 (-1.75, 1.45) */
const L2 = (x, y) => 1.5 * x * x + 0.025 * y * y;
const G2 = (x, y) => [3 * x, 0.05 * y];
function traj(lr, beta, steps) {
  let x = -1.75, y = 1.45, vx = 0, vy = 0;
  const xs = [x], ys = [y];
  for (let i = 0; i < steps; i++) {
    const [gx, gy] = G2(x, y);
    if (beta > 0) { vx = beta * vx + gx; vy = beta * vy + gy; x -= lr * vx; y -= lr * vy; }
    else { x -= lr * gx; y -= lr * gy; }
    xs.push(x); ys.push(y);
  }
  return { xs, ys, L: L2(x, y) };
}
const flips = (a) => { let c = 0; for (let i = 1; i < a.length; i++) if (Math.sign(a[i]) !== Math.sign(a[i - 1])) c++; return c; };
const prog = (ys) => (1 - Math.abs(ys[ys.length - 1]) / 1.45) * 100;
const t66 = traj(0.66, 0, 10), m66 = traj(0.66, 0.9, 10);
near('m04 无动量十步换边 10/10', flips(t66.xs), 10, 0);
near('m04 动量十步换边 5/10（减半而非抹平）', flips(m66.xs), 5, 0);
near('m04 无动量十步沿谷底推进 29%', prog(t66.ys), 29, 1);
near('m04 动量十步沿谷底推进 98%', prog(m66.ys), 98, 1);
near('m04 无动量第十步损失 3.09', t66.L, 3.09, 0.02);
near('m04 动量第十步损失 0.411', m66.L, 0.411, 0.01);
/* β 的代价是反应迟钝，不是弹飞：β=0.98 在 lr=0.50 下发散不了，只是收不下去 */
const t98 = traj(0.50, 0.98, 200), t90 = traj(0.50, 0.90, 200);
near('m04 β=0.98 末 40 步仍换边 17 次', flips(t98.xs.slice(-40)), 17, 0);
near('m04 β=0.98 摆幅约 ±0.4', (Math.max(...t98.xs.slice(-40)) - Math.min(...t98.xs.slice(-40))) / 2, 0.41, 0.03,
  { demo: 'assets/js/demos/m04-loss-terrain.js' });
near('m04 β=0.98 损失卡在 1.8e-2', t98.L, 1.82e-2, 2e-3,
  { demo: 'assets/js/demos/m04-loss-terrain.js', alt: ['1.8e-2'] });
near('m04 β=0.90 同 lr 收敛到 1.5e-9', t90.L, 1.52e-9, 2e-10, { alt: ['1.5e-9'] });
/* 碗形实测临界：动量放宽稳定域（2(1+β)/a），不是收紧 */
function deadBowl(lr, beta) {
  let x = -1.75, y = 1.45, vx = 0, vy = 0;
  for (let i = 0; i < 200; i++) {
    if (beta > 0) { vx = beta * vx + 3 * x; vy = beta * vy + 3 * y; x -= lr * vx; y -= lr * vy; }
    else { x -= lr * 3 * x; y -= lr * 3 * y; }
    if (!isFinite(x) || Math.abs(x) > 6 || Math.abs(y) > 6) return true;
  }
  return false;
}
const critOf = (beta) => { for (let lr = 0.01; lr <= 1.5; lr += 0.005) if (deadBowl(+lr.toFixed(3), beta)) return +lr.toFixed(3); return null; };
near('m04 实测碗形 SGD 临界 lr≈0.67', critOf(0), 0.67, 0.006);
near('m04 实测碗形 β=0.9 临界 lr≈1.20', critOf(0.9), 1.20, 0.01);
says('m04 文中给出「减半不是抹平」', 'm04', /「减半」不是「抹平」/);
says('m04 文中给出 10/10 降到 5/10', 'm04', /10\/10 降到 5\/10/);
says('m04 文中给出 98% 而非 29%', 'm04', /98% 而非 29%/);
says('m04 文中给出损失 3.09 与 0.411', 'm04', /3\.09、右图是 0\.411/);
says('m04 文中给出稳定条件（strip 后 &lt; 变空格）', 'm04', /稳定条件是 lr·a 2\(1\+β\)/);
says('m04 文中给出 β=0.9 要到 lr≈1.20', 'm04', /β=0\.9 要到 lr≈1\.20 才发散/);
says('m04 文中给出换边 17 次', 'm04', /换边 17 次/);

/* 三方绑定：本文件上面的 L2/G2 是演示地形的【副本】。若有人改了演示而没改这里，
   near() 会拿旧副本复算并继续通过。所以再断言演示源码里的梯度定义仍是这些系数——
   内容文字、本文件复算、演示源码三者任一改动都会被抓到。 */
const demoSrc = fs.readFileSync(path.join(ROOT, 'assets/js/demos/m04-loss-terrain.js'), 'utf8');
const anchor = (label, re) => {
  n++;
  if (!re.test(demoSrc)) { fail++; console.log('  FAIL ' + label + '  ← 演示源码与复算用的地形不一致'); }
};
/* 计数式锚点：只要求「匹配到一次」的锚点是弱的——碗形与峡谷共用同一
   起点，改掉其中一处仍能通过。断言出现次数，才真正锁住「本脚本复算用的
   地形 == 演示里的地形」。 */
const anchorCount = (label, re, want) => {
  n++;
  const got = (demoSrc.match(re) || []).length;
  if (got !== want) { fail++; console.log('  FAIL ' + label + '  期望 ' + want + ' 处，实为 ' + got + ' 处'); }
};
anchor('演示碗形梯度仍是 ∇L=(3x,3y)', /grad:\s*\(x,\s*y\)\s*=>\s*\[\s*3\s*\*\s*x,\s*3\s*\*\s*y\s*\]/);
anchor('演示峡谷梯度仍是 ∇L=(3x,0.05y)', /grad:\s*\(x,\s*y\)\s*=>\s*\[\s*3\s*\*\s*x,\s*0\.05\s*\*\s*y\s*\]/);
anchor('演示峡谷损失仍是 1.5x²+0.025y²', /loss:\s*\(x,\s*y\)\s*=>\s*1\.5\s*\*\s*x\s*\*\s*x\s*\+\s*0\.025\s*\*\s*y\s*\*\s*y/);
anchor('演示步数上限仍是 200', /MAXSTEP\s*=\s*200/);
anchor('演示逃逸半径仍是 6', /ESC\s*=\s*6/);
anchorCount('演示碗形与峡谷起点都是 (-1.75,1.45)', /start:\s*\[\s*-1\.75,\s*1\.45\s*\]/g, 2);

/* ---- 元检查：每条 near() 复算出的数，必须真的出现在它声称所在的地方 ----
   ⚠️ 必须**在所有 near() 登记完之后**调用（文件末尾）。
   本文件一度把这段放在中途，结果后来新增的 31 条断言压根没被溯源检查——
   「48 条无悬空」听起来是绿的，实际是漏统计。这类「检查跑在登记之前」的
   顺序错误不会报错，只会安静地少查。 */
function checkProvenance() {
  const cache = {};
  const text = (id) => (cache[id] || (cache[id] = strip(rd(id))));
  const dcache = {};
  const demoText = (rel) => (dcache[rel] || (dcache[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  let dangling = 0;
  for (const t of needs) {
    /* 归属为演示读数的断言：数要在演示源码里出现（与 m04 的 anchor 同理） */
    if (t.demo) {
      const hay = demoText(t.demo);
      const hit = formsOf(t.want).find(s => numHit(hay, s)) || (t.alt || []).find(s => hay.includes(s));
      if (!hit) { dangling++; console.log('  FAIL 悬空断言: ' + t.label + ' 复算出 ' + t.want + '，但 ' + t.demo + ' 里搜不到'); }
      continue;
    }
    if (!t.file || !fs.existsSync(path.join(ROOT, 'content/modules', t.file + '.html'))) {
      dangling++; console.log('  FAIL 悬空: ' + t.label + ' 无法定位正文模块（label 里没有 mXX？）'); continue;
    }
    const body = text(t.file);
    /* 数值候选要独立成数；alt 是作者登记的正文原话（如 2³⁴、16 GiB），按字面找 */
    const hit = formsOf(t.want).find(s => numHit(body, s)) || (t.alt || []).find(s => body.includes(s));
    if (!hit) { dangling++; console.log('  FAIL 悬空断言: ' + t.label + ' 复算出 ' + t.want + '，但 ' + t.file + ' 正文里搜不到这个数'); }
  }
  /* 元检查不另计断言数：它检查的是每条 near() 的归属，不是新断言 */
  if (dangling) fail += dangling;
  else console.log('  ✓ ' + needs.length + ' 条复算断言的数值都能在正文/演示里找到（无悬空）');
  if (dangling) console.log('  （布尔/中间量断言请显式传 {bool:true} 豁免，别默默放宽检查）');
  /* 自证：登记的条数必须等于非 bool 的 near() 条数，防再次少统计 */
  const nonBool = nearCalls - boolCalls;
  if (needs.length !== nonBool) {
    fail++; console.log('  FAIL 元检查自身漏统计：near() 非 bool 共 ' + nonBool + ' 条，只登记了 ' + needs.length + ' 条');
  }
}

/* ---------------- 2026-10 专家复核修复后新增的锁 ----------------
   原则：只锁**读者看得见的数**。复核报告建议的几条里，
   1.17 / 0.042 / 1.87 只出现在 SVG 注释与推导里、正文没印，写成断言
   就是造悬空（那正是本文件刚修掉的缺陷），故不加。 */

/* m02 D17：真赌局与记分口径的对偶（正文印 0.04 bit 与 1.03 倍） */
near('m02 真赌局 G(f=q) = KL = 0.04', 0.5 * Math.log2(0.5 / 0.6) + 0.3 * Math.log2(0.3 / 0.2), 0.04, 0.005);
near('m02 每轮财富倍数 2^KL = 1.03', Math.pow(2, 0.04397), 1.03, 0.005);
says('m02 文中给出「1.03 倍」', 'm02', /1\.03 倍/);

/* m05 B2：手算表此前**一条断言都没有**，而它是核心教具。
   逐格复算 17 行链条，锁住「每行 = 上游 × 本行局部导数」这条自洽性。 */
const dLy = 0.24 - 1;                                  // ∂L/y = y − t = −0.76
near('m05 ∂L/∂y', dLy, -0.76, 0.005);
near('m05 ∂L/∂a₁ = ∂L/∂y × v₁', dLy * 0.8, -0.608, 0.001);
near('m05 ∂L/∂z₁ = ∂L/∂a₁ × ReLU′(0.3)', dLy * 0.8 * 1, -0.608, 0.001);
near('m05 ∂L/∂w₂₁ = ∂L/∂z₁ × x₂', dLy * 0.8 * 1 * 0.5, -0.304, 0.001);
near('m05 ∂L/∂a₂ = ∂L/∂y × v₂', dLy * 0.7, -0.532, 0.001);
near('m05 ∂L/∂z₂ = ∂L/∂a₂ × ReLU′(−0.5) → 死亡', dLy * 0.7 * 0, 0, 0, { bool: true });
const w11n = 0.5 - 0.5 * (dLy * 0.8 * 1 * 1.0);
const yNew = 0.8 * Math.max(0, w11n * 1.0 + (-0.4) * 0.5) + 0.7 * 0;
near('m05 更新后 w₁₁', w11n, 0.804, 0.001);
near('m05 更新后损失', 0.5 * (yNew - 1) * (yNew - 1), 0.134, 0.001);

/* m06 C8：hint 承诺的三个读数（正文没有，归属演示源码） */
const M06JS = 'assets/js/demos/m06-rnn-vanish.js';
near('m06 0.98¹⁰⁰ = 0.1326', Math.pow(0.98, 100), 0.1326, 0.0002, { demo: M06JS });
near('m06 跌破 1% 需 228 跳', Math.ceil(Math.log(0.01) / Math.log(0.98)), 228, 0, { demo: M06JS });
near('m06 λ=1.1 第 5 跳到 1.61', Math.pow(1.1, 5), 1.61, 0.005, { demo: M06JS });

/* m08 B3：自测题「约同预算」的前提（原 175B 版本差 1.87 倍，题面自假） */
near('m08 280B×0.3T 的 ND = 8.4e22', 280e9 * 0.3e12, 8.4e22, 1e20);
near('m08 70B×1.4T 的 ND = 9.8e22', 70e9 * 1.4e12, 9.8e22, 1e20);
near('m08 后者比前者多 17%', (70e9 * 1.4e12 / (280e9 * 0.3e12) - 1) * 100, 17, 0.5);
near('m08 1.4 万亿 ÷ 700 亿 = 20', 1.4e12 / 70e9, 20, 0);
near('m08 0.3 万亿 ÷ 2800 亿 = 1.07', 0.3e12 / 280e9, 1.07, 0.005);

/* m12 C4：纠错模型改成恒定提升后，hint 与契约注释里的整组读数
   （原实现被 clamp 钳平，等于现场演示了 myth 3 要破除的结论） */
const M12JS2 = 'assets/js/demos/m12-agent-timeline.js';
const pEff = (p) => (1 + p) / 2;                        // 1 − (1−p)(1−CATCH)，CATCH=0.5
const pct = (p, n) => Math.round(Math.pow(pEff(p), n) * 100);
near('m12 corr p=0.95 十步', pct(0.95, 10), 78, 0, { demo: M12JS2 });
near('m12 corr p=0.95 十五步', pct(0.95, 15), 68, 0, { demo: M12JS2 });
near('m12 corr p=0.95 二十步', pct(0.95, 20), 60, 0, { demo: M12JS2 });
near('m12 corr p=0.90 十步', pct(0.90, 10), 60, 0, { demo: M12JS2 });
near('m12 corr p=0.90 十五步', pct(0.90, 15), 46, 0, { demo: M12JS2 });
near('m12 corr p=0.90 跌破一半在第 14 步', Math.ceil(Math.log(0.5) / Math.log(pEff(0.90))), 14, 0, { demo: M12JS2 });
near('m12 corr p=0.99 十步（仍逐格下降，不再水平）', pct(0.99, 10), 95, 0, { demo: M12JS2 });
near('m12 corr p=0.99 二十步', pct(0.99, 20), 90, 0, { demo: M12JS2 });
/* 纠错后仍是指数：p=0.95 在 20 步内不跌破一半（旧实现第 2 步就钳平） */
near('m12 corr p=0.95 二十步内不跌破一半', Math.log(0.5) / Math.log(pEff(0.95)) > 20 ? 1 : 0, 1, 0, { bool: true });

/* m13 C5：区分度阈值的正确区间（原注释把 ≥0.25 说成 p∈[0.15,0.85]，
   那是阈值 0.51 的解；按它校阈值会改错画面） */
const M13JS = 'assets/js/demos/m13-bench-saturation.js';
near('m13 4p(1−p)≥0.25 的下界 0.067', (1 - Math.sqrt(0.75)) / 2, 0.067, 0.0005, { demo: M13JS });
near('m13 4p(1−p)≥0.25 的上界 0.933', (1 + Math.sqrt(0.75)) / 2, 0.933, 0.0005, { demo: M13JS });
near('m13 端点处区分度恰为 0.25', 4 * ((1 - Math.sqrt(0.75)) / 2) * (1 - (1 - Math.sqrt(0.75)) / 2), 0.25, 0.0005, { demo: M13JS });

/* 元检查放在**所有** near() 之后调用，并自证登记条数（见函数上方注释）。 */
checkProvenance();

console.log(fail
  ? 'verify-math: ' + fail + '/' + n + ' 条断言与内容不符，必须修'
  : 'verify-math: ' + n + ' 条可计算断言全部与内容一致');
process.exit(fail ? 1 : 0);
