/* 离线冒烟测试：给 demo 套一层最小 DOM stub，跑 mount/controls/build/draw/交互全路径 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

class ClassList {
  constructor() { this._s = new Set(); }
  add(c) { this._s.add(c); } remove(c) { this._s.delete(c); }
  contains(c) { return this._s.has(c); }
  toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }
}
class Node {
  constructor(tag) { this.tagName = tag; this.childNodes = []; this.attributes = {}; this.style = {}; this.dataset = {}; this.listeners = {}; this._text = ''; this.classList = new ClassList(); }
  get className() { return [...this.classList._s].join(' '); }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  appendChild(n) { n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) { const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); return n; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = v; }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener() {}
  set textContent(v) { this._text = String(v); this.childNodes = []; }
  get textContent() { return this._text + this.childNodes.map(c => c.textContent).join(''); }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; if (/<b>/.test(v)) this.appendChild(new Node('b')); }
  get innerHTML() { return this._html || ''; }
  remove() {}
  matchesClass(sel) { return sel.startsWith('.') ? this.classList.contains(sel.slice(1)) : this.tagName === sel; }
  querySelectorAll(sel) { const out = []; const walk = (n) => n.childNodes.forEach(c => { if (c.matchesClass && c.matchesClass(sel)) out.push(c); walk(c); }); walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  fire(t) { (this.listeners[t] || []).forEach(f => f({ target: this })); return this; }
  click() { return this.fire('click'); }
}
global.document = {
  createElement(t) { return new Node(t); },
  createTextNode(t) { const n = new Node('#text'); n._text = t; return n; },
  createElementNS(ns, t) { return new Node(t); }
};
global.window = { matchMedia: () => ({ matches: false }) };
global.cancelAnimationFrame = () => {};
global.requestAnimationFrame = (fn) => { fn(); return 1; };

const AIP = { register(key, f) { AIP.demos = AIP.demos || {}; AIP.demos[key] = f; } };
global.window.AIPrinciples = AIP;
new Function('window', 'document', 'console', fs.readFileSync(path.join(ROOT, 'assets/js/demo-kit.js'), 'utf8'))(global.window, global.document, console);
new Function('window', 'document', 'console', fs.readFileSync(path.join(ROOT, 'assets/js/demos/m01-shannon-game.js'), 'utf8'))(global.window, global.document, console);

const key = 'm01-shannon-game';
if (!AIP.demos || !AIP.demos[key]) { console.log('FAIL: 未注册 ' + key); process.exit(1); }
console.log('OK  注册键 =', key);

const host = new Node('div'); host.className = 'demo';
const canvas = new Node('div'); canvas.className = 'demo__canvas';
const ctr = new Node('div'); ctr.className = 'demo__controls';
host.appendChild(canvas); host.appendChild(ctr);
host.querySelector = function (sel) {
  if (sel === '.demo__canvas') return canvas;
  if (sel === '.demo__controls') return ctr;
  if (sel === '.demo__readout') return this.querySelector('div.demo__readout');
  return Node.prototype.querySelectorAll.call(this, sel)[0] || null;
};

const inst = AIP.demos[key]().mount(host);
console.log('OK  mount 通过；控件数 =', ctr.querySelectorAll('.demo__field').length,
  '| SVG 静态节点 =', canvas.childNodes[0].childNodes.length);

function dump(tag) {
  const s = inst.api.state;
  console.log('    ' + tag + ': idx=' + s.idx + '/' + s.sequenceLen +
    ' you=' + s.youBits.toFixed(1) + ' model=' + s.modelBits.toFixed(2) +
    ' floor=' + s.floorBits.toFixed(2) + ' hits=' + s.hits +
    ' 压缩率=' + (s.idx ? (2 * s.idx / s.modelBits).toFixed(2) : '—'));
}

/* 收集所有按钮 */
function collect(node, tag) { const out = []; (function w(n) { n.childNodes.forEach(c => { if (c.tagName === tag) out.push(c); w(c); }); })(node); return out; }
const guessBtns = collect(ctr, 'button').filter(b => ['A', 'B', 'C', 'D'].includes(b.textContent));
const autoBtn = collect(ctr, 'button').find(b => b.textContent.includes('让模型替我'));
console.log('OK  押注按钮 =', guessBtns.map(b => b.textContent).join(''), '| 自动 =', !!autoBtn);

/* 一局：混合押注（先押 A，再按模型 argmax） */
dump('initial');
guessBtns[0].click(); dump('after 1 guess(A)');
autoBtn.click(); dump('after autoplay');
console.log('OK  结束后按钮 disabled =', guessBtns.map(b => !!b.disabled).join(','));

/* 全参数扫描 + 重绘，确保任意组合不抛异常 */
const selType = ctr.querySelectorAll('.demo__field').map(f => f.querySelector('select')).filter(Boolean);
const ranges = ctr.querySelectorAll('.demo__field').map(f => f.querySelector('input')).filter(Boolean);
for (let tp = 0; tp < 3; tp++) {
  for (let mc = 0; mc < 3; mc++) {
    selType[0].value = String(tp); selType[0].fire('change');
    selType[1].value = String(mc); selType[1].fire('change');
    inst.api.draw();
  }
}
ranges.forEach(r => { [r.min, r.max].forEach(v => { r.value = v; r.fire('input'); }); });
console.log('OK  参数扫描（3×3 + 长度/种子极值）无异常');

/* reset 路径 */
guessBtns[0].click();
inst.reset();
dump('after reset');
const st = inst.api.state;
if (st.idx !== 0 || st.youBits !== 0 || st.seqType !== 0 || st.modelClass !== 1 || st.sequenceLen !== 36 || st.seed !== 7) {
  console.log('FAIL: reset 未还原全部 state', JSON.stringify(st)); process.exit(1);
}
console.log('OK  reset 还原全部参数');

/* 可复现性：同参数两次生成必得同序列 */
function seqOf() { inst.api.state.sequenceLen = 24; inst.api.state.seed = 11; inst.api.state.seqType = 1;
  const before = JSON.stringify(inst.api._seq); inst.reset(); return before; }
const a1 = seqOf(); const a2 = seqOf();
console.log('OK  同 seed 同序列 =', a1 === a2, '| 长度 24 =', JSON.parse(a1).length);

/* 读数条 */
const ro = host.querySelectorAll('div.demo__readout')[0] || host.querySelector('.demo__readout');
console.log('OK  readout 存在 =', !!ro, '| stats =', ro ? ro.querySelectorAll('.demo__stat').length : 0);

/* 数值验证 hint 里的断言 */
const P = [
  [[.03, .91, .03, .03], [.03, .03, .91, .03], [.03, .03, .03, .91], [.91, .03, .03, .03]],
  [[.10, .55, .25, .10], [.35, .10, .45, .10], [.20, .30, .10, .40], [.45, .20, .25, .05]],
  [[.25, .25, .25, .25], [.25, .25, .25, .25], [.25, .25, .25, .25], [.25, .25, .25, .25]]
];
const stat = (M) => { let v = [.25, .25, .25, .25]; for (let i = 0; i < 300; i++) { const nv = [0, 0, 0, 0]; for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) nv[j] += v[k] * M[k][j]; v = nv; } return v; };
const H = (row) => row.reduce((s, p) => p > 0 ? s - p * Math.log2(p) : s, 0);
P.forEach((M, i) => { const pi = stat(M); const h = pi.reduce((s, p, j) => s + p * H(M[j]), 0);
  console.log('    type' + i + ' 平稳=' + pi.map(x => x.toFixed(3)).join('/') + ' H=' + h.toFixed(3) + ' bit → 压缩率 ' + (2 / h).toFixed(2) + ' 倍'); });

const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
const gen = (M, len, seed) => { const r = rng(seed), pi = stat(M); const pick = (pr) => { let u = r(), a = 0; for (let j = 0; j < 4; j++) { a += pr[j]; if (u < a) return j; } return 3; }; const q = [pick(pi)]; for (let t = 1; t < len; t++) q.push(pick(M[q[t - 1]])); return q; };
const est = (hist, upto, order) => { const PAR = 1.2; const parent = order === 0 ? [.25, .25, .25, .25] : est(hist, upto, order - 1); const c = [0, 0, 0, 0]; if (upto >= order) { for (let t = order; t < upto; t++) { let m = true; for (let b = 1; b <= order; b++) if (hist[t - b] !== hist[upto - b]) { m = false; break; } if (m) c[hist[t]]++; } } const tot = c[0] + c[1] + c[2] + c[3]; const o = c.map((x, j) => (x + PAR * parent[j]) / (tot + PAR)); const s = o.reduce((a, b) => a + b, 0); return o.map(x => x / s); };
P.forEach((M, i) => {
  const q = gen(M, 60, 7);
  const c1 = [], c2 = [];
  for (let t = 0; t < 60; t++) { c1.push(-Math.log2(Math.max(est(q, t, 1)[q[t]], 1e-12))); c2.push(-Math.log2(Math.max(est(q, t, 2)[q[t]], 1e-12))); }
  const cum = (a, n) => a.slice(0, n).reduce((x, y) => x + y, 0);
  console.log('    type' + i + ' order1 vs order2: 前12 ' + cum(c1, 12).toFixed(1) + '/' + cum(c2, 12).toFixed(1) +
    ' | 前36 ' + cum(c1, 36).toFixed(1) + '/' + cum(c2, 36).toFixed(1) +
    ' | 前60 ' + cum(c1, 60).toFixed(1) + '/' + cum(c2, 60).toFixed(1));
});
console.log('SMOKE TEST DONE');
