/* 最小 DOM 桩：验证 m02-entropy-bars 的 controls/build/draw/reset 不抛错，
   并检查 draw 是否堆积 DOM（契约 §2.2 第 6 条）。 */
'use strict';
const fs = require('fs');

function makeEl(isSvg) {
  const e = {
    _attrs: {}, children: [], style: {}, dataset: {}, _listeners: {}, _isSvg: !!isSvg,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    setAttribute(k, v) {
      e._attrs[k] = String(v);
      if (k === 'class') e.classList._s = new Set(String(v).split(/\s+/).filter(Boolean));
    },
    getAttribute(k) { return k in e._attrs ? e._attrs[k] : null; },
    removeAttribute(k) { delete e._attrs[k]; },
    appendChild(c) {
      if (!c) throw new Error('appendChild(null)');
      c._parent = e; e.children.push(c); return c;
    },
    removeChild(c) {
      const i = e.children.indexOf(c);
      if (i < 0) throw new Error('removeChild: 不是子节点');
      e.children.splice(i, 1); return c;
    },
    remove() { if (e._parent) e._parent.removeChild(e); },
    addEventListener(t, f) { (e._listeners[t] = e._listeners[t] || []).push(f); },
    removeEventListener() {},
    get firstChild() { return e.children[0] || null; },
    get childNodes() { return e.children; },
    get textContent() { return e._text || ''; },
    set textContent(v) { e._text = String(v); e.children = []; },
    set innerHTML(v) {
      e._html = String(v); e.children = []; e._text = '';
      const re = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g; let m;
      while ((m = re.exec(v))) {
        const c = makeEl(false); c.tagName = m[1]; c._text = m[2]; c._parent = e;
        e.children.push(c);
      }
    },
    get innerHTML() { return e._html || ''; },
    querySelector(sel) { return e.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const want = String(sel).replace(/^\./, '');
      const out = [];
      (function w(n) {
        n.children.forEach(c => {
          if (c.tagName === want || c.classList.contains(want) || (c.dataset && sel.startsWith('data-') && c.dataset[sel.slice(5)] != null)) out.push(c);
          w(c);
        });
      })(e);
      return out;
    },
    fire(t, ev) { (e._listeners[t] || []).forEach(f => f(ev || {})); }
  };
  Object.defineProperty(e, 'className', {
    get() { return [...e.classList._s].join(' '); },
    set(v) { e.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  return e;
}

const doc = {
  createElement: (t) => { const e = makeEl(false); e.tagName = t; return e; },
  createElementNS: (ns, t) => { const e = makeEl(true); e.tagName = t; return e; },
  createTextNode: (t) => ({ nodeType: 3, textContent: t }),
  body: makeEl(false),
  addEventListener() {}, querySelectorAll: () => []
};

global.document = doc;
const errors = [];
const realErr = console.error;
console.error = (...a) => { errors.push(a.join(' ')); realErr('  [console.error]', ...a); };
global.window = {
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}
};
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const AIP = {};
global.window.AIPrinciples = AIP;
AIP.demos = {};
AIP.registry = {};
AIP.register = (k, f) => { AIP.demos[k] = f; };

const run = (f) => new Function('window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame',
  fs.readFileSync(f, 'utf8'))(global.window, global.document, global.requestAnimationFrame, global.cancelAnimationFrame);
run('assets/js/demo-kit.js');
run('assets/js/demos/m02-entropy-bars.js');

if (!AIP.demos['m02-entropy-bars']) throw new Error('演示键未注册（应为 m02-entropy-bars）');
console.log('注册 OK：m02-entropy-bars');

/* 造 .demo 宿主（build.js 注入的标准结构） */
const host = makeEl(false);
host.classList.add('demo');
host.setAttribute('data-demo', 'm02-entropy-bars');
const canvas = makeEl(false); canvas.classList.add('demo__canvas');
const ctr = makeEl(false); ctr.classList.add('demo__controls');
host.appendChild(canvas); host.appendChild(ctr);

const inst = AIP.demos['m02-entropy-bars']().mount(host);
console.log('mount OK');

const svg = (function find(n) {
  for (const c of n.children) { if (c._isSvg && c.tagName === 'svg') return c; const r = find(c); if (r) return r; }
  return null;
})(host);
if (!svg) throw new Error('svg 未建立');

function countSvg(n) { let c = 0; (function w(x) { x.children.forEach(k => { if (k._isSvg) c++; w(k); }); })(n); return c; }
const n0 = countSvg(svg);
for (let i = 0; i < 40; i++) inst.api.draw();        // 同一状态重绘 40 次
const n1 = countSvg(svg);
console.log('SVG 节点：初始 ' + n0 + ' → 同状态重绘 40 次后 ' + n1 + (n1 === n0 ? '  ✅ 未堆积' : '  ❌ 堆积 ' + (n1 - n0)));
[1, 40, 100].forEach(v => { inst.update('p1', v); });
console.log('   （换状态时第 4 格柱数会变，那是等效选项数本身，不是泄漏）节点数 =', countSvg(svg));

/* 全状态遍历：边界值 + 每种 q + 开关 */
[1, 50, 100].forEach(v => ['p1', 'p2', 'p3'].forEach(k => inst.update(k, v)));
['match', 'hotA', 'hotB', 'hotC', 'skewA', 'skewB', 'skewC', 'uniform', '不存在的键'].forEach(q => inst.update('qmode', q));
[true, false].forEach(b => inst.update('showq', b));
console.log('全状态遍历 OK（含非法 qmode 回退）');

/* 读数条抽查 */
const roNodes = [];
(function w(n) { n.children.forEach(c => { if (c.dataset && c.dataset.k) roNodes.push(c); w(c); }); })(host);
const dump = () => roNodes.map(c => c.dataset.k + ':' + c.children[c.children.length - 1].textContent).join('  ');
const valOf = (str, k) => (str.match(new RegExp(k + ':([^ ]+)')) || [])[1];
const setAll = (a, b, c2, q) => { inst.update('p1', a); inst.update('p2', b); inst.update('p3', c2); inst.update('qmode', q); };
setAll(60, 20, 20, 'hotB');
console.log('\n默认态 p=.6/.2/.2, q=只出「茶」 → 期望 CE 2.32 / H 0.00 / KL 2.32 / perp 5.00 / hit 20.0%\n  ', dump());
setAll(60, 20, 20, 'uniform');
console.log('q=均匀 1/3            → 期望 CE 1.79 / H 1.58 / KL 0.21 / perp 3.47\n  ', dump());
setAll(33, 33, 33, 'uniform');
console.log('p=均匀, q=均匀        → 期望 KL 0.00 / perp 3.00（第 4 格正好 3 根柱）\n  ', dump());
setAll(60, 20, 20, 'match');
console.log('q=模型自己            → 期望 KL 0.00 / CE=H=1.37\n  ', dump());
setAll(98, 1, 1, 'hotC');
console.log('把「水」压到 1 票      → 期望 CE 6.64（惊讶度猛蹿）\n  ', dump());

/* 第 4 格等效柱数 */
function eqBars() {
  const g = svg.children[svg.children.length - 1];
  return g.children.filter(c => c.tagName === 'rect').length;
}
setAll(33, 33, 33, 'uniform'); console.log('   等效柱数（均匀 3 类，期望 3）=', eqBars());
setAll(60, 20, 20, 'hotB');   console.log('   等效柱数（perp 5.00，期望 5）=', eqBars());

/* 「换一例」= 同 seed 同结果（可复现） */
const swap = host.querySelectorAll('button').filter(b => /换一例/.test(b.textContent))[0];
setAll(60, 20, 20, 'hotB');
const before = dump();
swap.fire('click');
const after = dump();
console.log('\n换一例：CE ' + valOf(before, 'ce') + ' → ' + valOf(after, 'ce') + '（值确实变了：' + (before !== after) + '）');
inst.api.state.sample = 7; swap.fire('click'); const reproA = dump();
inst.api.state.sample = 7; swap.fire('click'); const reproB = dump();
console.log('同 seed(=8) 两次结果一致：', reproA === reproB, '|', reproA);
inst.reset();
console.log('reset 后 sample =', inst.api.state.sample === 1 ? '回到初值 1 ✅' : '❌ ' + inst.api.state.sample);

/* reset 必须还原全部初值 */
setAll(100, 1, 1, 'skewA'); inst.update('showq', false); inst.reset();
const st = inst.api.state;
console.log('\nreset →', JSON.stringify(st),
  (st.p1 === 60 && st.p2 === 20 && st.p3 === 20 && st.qmode === 'hotB' && st.showq === true && st.sample === 1) ? ' ✅ 全部回到初值' : ' ❌ 未回到初值');

/* 每个控件都挂了 key（契约 §2.2 第 1 条 + reset 依赖） */
const grid = host.querySelectorAll('.demo__ctrlgrid')[0];
const keyed = grid.children.map(c => c._dkKey || null);
console.log('控件 key 列表：', JSON.stringify(keyed), '| 未挂 key 的：', keyed.filter(k => !k).length);

/* hint 三要素 + 魔法数字交代 */
const srcTxt = fs.readFileSync('assets/js/demos/m02-entropy-bars.js', 'utf8');
console.log('\nhint 三要素：', ['你能改什么', '拨动它你会看到', '对应机制段'].map(n => n + (srcTxt.includes(n) ? '✓' : '✗')).join(' '));
console.log('归一化说明：', /归一化/.test(srcTxt) ? '✓' : '✗',
  '| 票数区间 [1,100]：', /\[1, 100\]/.test(srcTxt) ? '✓' : '✗',
  '| DK.rng(seed)：', /DK\.rng\(seed\)/.test(srcTxt) ? '✓' : '✗');
const svgText = (function w(n) { return n.children.map(c => (c.textContent || '') + ' ' + w(c)).join(' '); })(svg);
console.log('画布顶部「示意数据」标注：', /示意数据/.test(svgText) ? '✓' : '✗');
console.log('SVG 内无硬编码颜色：', /#[0-9a-fA-F]{3,8}\b/.test(srcTxt) ? '❌ 有 hex' : '✓');

inst.pause(); inst.resume(); inst.destroy();
console.log('\npause / resume / destroy OK');
console.log('draw 全程抛错次数：', errors.length, errors.length ? errors.slice(0, 3).join(' || ') : '✅ 零错误');
