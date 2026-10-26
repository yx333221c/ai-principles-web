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
const formsOf = (w) => {
  const out = new Set();
  const add = (v) => { const s = String(v); if (s && s !== 'NaN' && s !== 'Infinity') out.add(s); };
  add(w);
  /* 正文常把数四舍五入后写出来：逐个精度都试 */
  for (let d = 0; d <= 4; d++) add(+Number(w).toFixed(d));
  /* 百分数：0.29 → 29 */
  if (Math.abs(w) < 1) for (let d = 0; d <= 2; d++) add(+(w * 100).toFixed(d));
  /* 科学计数法：正文写 2.9×10⁻⁵，断言里是 2.9e-5 → 尾数要能对上 */
  const ex = String(Number(w).toExponential()).match(/^([-\d.]+)e(-?\d+)$/);
  if (ex) {
    const mant = Number(ex[1]), e10 = Number(ex[2]);
    for (let d = 0; d <= 3; d++) add(+mant.toFixed(d));
    /* 也接受 1.8e-2 这种原样写法 */
    add(mant + 'e' + e10);
  }
  return [...out];
};
const near = (label, got, want, tol, opts) => {
  n++;
  const o = opts || {};
  const pass = Math.abs(got - want) <= (tol == null ? Math.abs(want) * 0.02 : tol);
  if (!pass) { fail++; console.log('  FAIL ' + label + '  算得 ' + got.toPrecision(4) + '，文中 ' + want); }
  if (!o.bool) {
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
near('m13 N=100 p=0.95 标准误', Math.sqrt(0.95 * 0.05 / 100), 0.0218, 0.0005);
near('m13 N=500 p=0.95 标准误', Math.sqrt(0.95 * 0.05 / 500), 0.0097, 0.0005);
near('m13 区分度 4p(1−p) 在 p=0.5 取最大', 4 * 0.5 * 0.5, 1, 0);
near('m13 p=0.95 时区分度仅 0.19', 4 * 0.95 * 0.05, 0.19, 0.005);

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
near('m04 β=0.98 摆幅约 ±0.4', (Math.max(...t98.xs.slice(-40)) - Math.min(...t98.xs.slice(-40))) / 2, 0.41, 0.03);
near('m04 β=0.98 损失卡在 1.8e-2', t98.L, 1.82e-2, 2e-3);
near('m04 β=0.90 同 lr 收敛到 1.5e-9', t90.L, 1.52e-9, 2e-10);
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

/* ---- 元检查：每条 near() 复算出的数，必须真的出现在它声称所在的地方 ---- */
{
  const cache = {};
  const text = (id) => (cache[id] || (cache[id] = strip(rd(id))));
  const dcache = {};
  const demoText = (rel) => (dcache[rel] || (dcache[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  let dangling = 0;
  for (const t of needs) {
    /* 归属为演示读数的断言：数要在演示源码里出现（与 m04 的 anchor 同理） */
    if (t.demo) {
      const hay = demoText(t.demo);
      const hit = formsOf(t.want).find(s => hay.includes(s));
      if (!hit) { dangling++; console.log('  FAIL 悬空断言: ' + t.label + ' 复算出 ' + t.want + '，但 ' + t.demo + ' 里搜不到'); }
      continue;
    }
    if (!t.file || !fs.existsSync(path.join(ROOT, 'content/modules', t.file + '.html'))) {
      dangling++; console.log('  FAIL 悬空: ' + t.label + ' 无法定位正文模块（label 里没有 mXX？）'); continue;
    }
    const body = text(t.file);
    /* alt：正文用上标记法写（如 2³⁴ 而非 17179869184），显式登记等价写法 */
    const hit = formsOf(t.want).find(s => body.includes(s)) || (t.alt || []).find(s => body.includes(s));
    if (!hit) { dangling++; console.log('  FAIL 悬空断言: ' + t.label + ' 复算出 ' + t.want + '，但 ' + t.file + ' 正文里搜不到这个数'); }
  }
  /* 元检查不另计断言数：它检查的是上面每条 near() 的归属，不是新断言 */
  if (dangling) fail += dangling;
  else console.log('  ✓ ' + needs.length + ' 条复算断言的数值都能在正文/演示里找到（无悬空）');
  if (dangling) console.log('  （布尔/中间量断言请显式传 {bool:true} 豁免，别默默放宽检查）');
}

console.log(fail
  ? 'verify-math: ' + fail + '/' + n + ' 条断言与内容不符，必须修'
  : 'verify-math: ' + n + ' 条可计算断言全部与内容一致');
process.exit(fail ? 1 : 0);
