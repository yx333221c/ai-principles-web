/* 一次性：用 DOM 桩直接驱动 m04 演示的真实代码路径，验证 hint 里每个数字。
   不重新实现仿真——加载真实文件、捕获 spec、调用真实的 build/controls/draw。 */
'use strict';
const path = require('path');

/* ---- 最小 DOM / DK 桩 ---- */
function node(tag, attrs) {
  const n = { tag, attrs: attrs || {}, children: [], style: {}, textContent: '', dataset: {} };
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.getAttribute = (k) => n.attrs[k];
  n.appendChild = (c) => { n.children.push(c); return c; };
  n.addEventListener = (t, f) => { (n._h = n._h || {})[t] = f; };
  n.querySelector = () => null;
  return n;
}
const readLog = {};
const DK = {
  el: (tag, attrs) => node(tag, attrs),
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  fmt: (v, d) => (v == null || !isFinite(v)) ? String(v) : v.toFixed(d == null ? 2 : d),
  heatFill: (t) => 'heat(' + t.toFixed(2) + ')',
  rng: (s) => { let x = (s >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; },
  range: (o) => { const n = node('input'); n._o = o; n._kind = 'range'; return n; },
  select: (o) => { const n = node('select'); n._o = o; n._kind = 'select'; return n; },
  toggle: (o) => { const n = node('button'); n._o = o; n._kind = 'toggle'; return n; },
  button: (label, fn) => { const n = node('button'); n._label = label; n._fn = fn; n._kind = 'button'; return n; },
  readout: (items) => {
    const box = node('div'); box._vals = {};
    box.set = (k, v) => { box._vals[k] = v; readLog[k] = v; };
    return box;
  },
  define: (key, spec) => { DK._spec = spec; DK._key = key; }
};
global.window = { AIPrinciples: { DK, register() {} } };
global.document = { createElement: (t) => node(t) };

require(path.resolve(__dirname, '../assets/js/demos/m04-loss-terrain.js'));
const spec = DK._spec;
console.log('loaded spec for', DK._key, '\n');

/* ---- 组装 api，跑真实 build + controls ---- */
const svg = node('svg');
const holder = node('div');
const api = {
  state: JSON.parse(JSON.stringify(spec.state)),
  host: node('div'), ctr: node('div'),
  draw() { spec.draw(api); },
  animate(fn) { api._animFn = fn; }
};
spec.build(svg, api);
spec.controls(holder, api);

const ctrls = {};
holder.children.forEach(c => { if (c._o && c._o.key) ctrls[c._o.key] = c; });
const stepBtn = holder.children.find(c => c._kind === 'button' && c._label === '单步');
console.log('控件 keys:', Object.keys(ctrls).join(', '), '| 单步按钮:', !!stepBtn, '\n');

function set(key, v) {
  if (!ctrls[key]) throw new Error('无控件 ' + key);
  ctrls[key]._o.on(v);
}
function run(steps) {
  for (let i = 0; i < steps; i++) { stepBtn._fn(); if (api._sim.dead) break; }
}
function reset(terrain, opt, lr, beta) {
  set('terrain', terrain); set('opt', opt); set('lr', lr); set('beta', beta);
}

let fail = 0;
const check = (label, cond, detail) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (detail ? '  → ' + detail : ''));
  if (!cond) fail++;
};

console.log('== hint 断言 ①：碗形 lr=0.67 在第 124 步弹飞；0.665 安全 ==');
reset('bowl', 'sgd', 0.67, 0.9);
run(200);
check('lr=0.670 发散', api._sim.dead, '第 ' + api._sim.step + ' 步');
reset('bowl', 'sgd', 0.665, 0.9);
run(200);
check('lr=0.665 不发散', !api._sim.dead, 'L=' + api._sim.losses[api._sim.losses.length - 1].toExponential(2));
reset('bowl', 'sgd', 0.10, 0.9); run(200);
check('lr=0.10 收敛到极小', !api._sim.dead && api._sim.losses[api._sim.losses.length - 1] < 1e-4,
  'L=' + api._sim.losses[api._sim.losses.length - 1].toExponential(2));

console.log('\n== hint 断言 ②：峡谷（横陡 a=3 / 纵平 a=0.05）lr=0.30 ==');
reset('canyon', 'sgd', 0.30, 0);
run(200);
check('SGD β=0 横向 1 步到位', Math.abs(api._sim.x) < 1e-6, 'x=' + api._sim.x.toExponential(2));
check('SGD β=0 纵向 200 步仍剩 y≈0.07', Math.abs(api._sim.y - 0.0706) < 0.01, 'y=' + api._sim.y.toFixed(4));
check('SGD β=0 损失≈1.2e-4', Math.abs(api._sim.losses[api._sim.losses.length-1] - 1.24e-4) < 2e-5,
  'L=' + api._sim.losses[api._sim.losses.length-1].toExponential(2));
reset('canyon', 'mom', 0.30, 0.90);
run(200);
/* 注意：demo 的 losses[] 为画对数轴把下限夹在 1e-6，不能用来读真实损失；
   这里用地形函数直接复算真值。 */
const Ltrue = (x,y) => 1.5*x*x + 0.025*y*y;
const lt = Ltrue(api._sim.x, api._sim.y);
check('动量 β=0.90 收敛（|x|,|y| < 1e-4）', Math.abs(api._sim.x) < 1e-4 && Math.abs(api._sim.y) < 1e-4,
  'x=' + api._sim.x.toExponential(1) + ' y=' + api._sim.y.toExponential(1));
check('动量 β=0.90 真实损失≈2.8e-9（hint 的数字）', Math.abs(lt - 2.8e-9) < 6e-10,
  'L=' + lt.toExponential(2));
check('losses[] 确实被夹在 1e-6（证明读数条需要单独格式化）',
  api._sim.losses[api._sim.losses.length-1] === 1e-6,
  'clamped=' + api._sim.losses[api._sim.losses.length-1]);

console.log('\n== hint 断言 ③：β=0.98 不弹飞、但收不下去（末 40 步仍换边 17 次）==');
reset('canyon', 'mom', 0.50, 0.98);
run(200);
check('β=0.98 不发散（动量放宽稳定域）', !api._sim.dead, 'x=' + api._sim.x.toFixed(4));
const tail = api._sim.trail.slice(-40).map(p => p[0]);
let flips = 0; for (let i = 1; i < tail.length; i++) if (Math.sign(tail[i]) !== Math.sign(tail[i-1])) flips++;
const amp = Math.max(...tail) - Math.min(...tail);
check('末 40 步横向换边 17 次（不是静止）', flips === 17, 'flips=' + flips);
check('末 40 步摆幅 ≈0.82（hint 说 ±0.4 范围内）', Math.abs(amp - 0.819) < 0.05, 'amp=' + amp.toFixed(3));
check('β=0.98 损失卡在 1e-2 量级', api._sim.losses[api._sim.losses.length-1] > 1e-3 &&
      api._sim.losses[api._sim.losses.length-1] < 1e-1, 'L=' + api._sim.losses[api._sim.losses.length-1].toExponential(2));
reset('canyon', 'mom', 0.50, 0.90);
run(200);
const lt9 = 1.5*api._sim.x*api._sim.x + 0.025*api._sim.y*api._sim.y;
check('β=0.90 同 lr 收敛到 1.5e-9（hint 的对照数字）', Math.abs(lt9 - 1.52e-9) < 3e-10, 'L=' + lt9.toExponential(2));
// 动量确实比 SGD 更晚发散（用与 demo 相同的更新式独立复算）
function runT(terr,lr,beta){
  const G={bowl:(x,y)=>[3*x,3*y],canyon:(x,y)=>[3*x,0.05*y]}[terr];
  let x=-1.75,y=1.45,vx=0,vy=0;
  for(let i=0;i<200;i++){const[gx,gy]=G(x,y);
    if(beta>0){vx=beta*vx+gx;vy=beta*vy+gy;x-=lr*vx;y-=lr*vy;}else{x-=lr*gx;y-=lr*gy;}
    if(!isFinite(x)||Math.abs(x)>6||Math.abs(y)>6) return true;}
  return false;
}
let sgdCrit=null, momCrit=null;
for(let lr=0.01;lr<=1.5;lr+=0.005){ if(runT('canyon',+lr.toFixed(3),0)){sgdCrit=+lr.toFixed(3);break;} }
for(let lr=0.01;lr<=1.5;lr+=0.005){ if(runT('canyon',+lr.toFixed(3),0.98)){momCrit=+lr.toFixed(3);break;} }
check('动量把临界 lr 从 '+sgdCrit+' 放宽到 '+momCrit, momCrit > sgdCrit + 0.3,
  '⇒ hint「不会弹飞（放宽到 ≈1.2）」成立');

console.log('\n== hint 断言 ③：鞍点正中央梯度恒为 0、永不自己动；轻推后才滑向谷底 ==');
reset('saddle', 'sgd', 0.10, 0);
run(200);
check('起点在山脊正中央', api._sim.x === 0 && api._sim.y === 0, 'x=' + api._sim.x + ' y=' + api._sim.y);
check('跑满 200 步仍不动', api._sim.x === 0, 'x=' + api._sim.x);
const Lstuck = api._sim.losses[api._sim.losses.length - 1];
check('损失停在 6（不是谷底）', Math.abs(Lstuck - 6) < 1e-9, 'L=' + Lstuck);
const gS = api._sim; // 梯度应为 0
check('梯度恒为 0', gS.x === 0 && gS.y === 0, 'grad=' + (Math.hypot(-4.5*gS.x+2.1*gS.x**3, 9*gS.y)));
// 轻推一把
const nudge = holder.children.find(c => c._kind === 'button' && /轻推/.test(c._label));
check('存在「轻推一把（噪声）」按钮', !!nudge);
nudge._fn();
const xAfterNudge = api._sim.x;
check('轻推后离开原点', xAfterNudge !== 0, 'x=' + xAfterNudge.toFixed(4));
run(200);
const Lslide = api._sim.losses[api._sim.losses.length - 1];
check('轻推后能滑向谷底 3.589', Math.abs(Lslide - 3.589) < 0.02, '终点 L=' + Lslide.toFixed(3) + ' x=' + api._sim.x.toFixed(3));
console.log('  谷底理论值 3.589；卡住时 6.000；轻推前一步都不动 ⇒ hint ③ 成立');

console.log('\n== 读数条与 draw 不抛错 ==');
reset('bowl', 'adam', 0.30, 0.9); run(30);
check('Adam 可跑', !api._sim.dead, 'L=' + api._sim.losses[api._sim.losses.length - 1].toExponential(2));
reset('saddle', 'sgd', 0.10, 0); run(50);
check('鞍点 draw 后读数齐全', ['loss', 'grad', 'step', 'crit', 'state'].every(k => readLog[k] != null),
  JSON.stringify(readLog));

console.log('\n' + (fail ? 'FAIL ' + fail + ' 项（hint 与代码不一致，必须改）' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
