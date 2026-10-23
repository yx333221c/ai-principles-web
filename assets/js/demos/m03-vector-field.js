/* ==========================================================================
   m03-vector-field.js · 演示：向量与相似度 + 矩阵=空间变换（DESIGN.md §4 M03）
   左半：二维平面上三支向量（猫 / 狗 / 汽车），实时读数点积、余弦、夹角、距离，
         并画出「投影」这一几何解释；猫与狗的端点可拖，也可用滑块改。
   右半：单位圆在 2×2 矩阵作用下的像（椭圆），以及方向不变的特征方向。

   诚实性：画面上的坐标是为教学挑选的**示意数据**（二维投影），
   不是任何真实模型的嵌入输出；真实嵌入是数百到上万维、无法直接画出的。
   背景散点用 DK.rng(固定 seed) 生成，保证每次打开、每次重置都是同一张图。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  const VB = [700, 400];
  const L = { ox: 140, oy: 232, s: 48 };   // 左半：数据坐标 → 画布
  const R = { ox: 505, oy: 210, s: 44 };   // 右半
  const n2 = (v) => Math.round(v * 100) / 100;
  const rad = (d) => d * Math.PI / 180;
  const pol = (a, len) => [len * Math.cos(rad(a)), len * Math.sin(rad(a))];

  /* 词名与固定参照（汽车不可拖：给读者一个不动的比较对象） */
  const NAMES = { cat: '猫', dog: '狗', car: '汽车' };

  function mkPoint(g, x, y, color, r) {
    return g.appendChild(DK.el('circle', { cx: n2(x), cy: n2(y), r: r || 2.2, fill: color, opacity: .5 }));
  }
  function arrow(g, x0, y0, x1, y1, color, w) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy) || 1;
    const ux = dx / n, uy = dy / n, px = -uy, py = ux, k = 9;
    g.appendChild(DK.el('line', { x1: n2(x0), y1: n2(y0), x2: n2(x1), y2: n2(y1), stroke: color, 'stroke-width': w || 2.4, 'stroke-linecap': 'round' }));
    g.appendChild(DK.el('path', {
      d: 'M' + n2(x1) + ',' + n2(y1) + ' L' + n2(x1 - k * ux + 4 * px) + ',' + n2(y1 - k * uy + 4 * py) +
        ' L' + n2(x1 - k * ux - 4 * px) + ',' + n2(y1 - k * uy - 4 * py) + ' Z', fill: color
    }));
  }
  /** 数据坐标下的 2×2 作用 */
  function mp(M, x, y) { return [M.a * x + M.b * y, M.c * x + M.d * y]; }
  /** 实特征值与特征方向；返回 {lam:[..], dirs:[[x,y]|null,…], kind} */
  function eigen(M) {
    const tr = M.a + M.d, det = M.a * M.d - M.b * M.c, disc = tr * tr / 4 - det;
    if (disc < -1e-9) return { kind: 'none', lam: [], dirs: [] };
    const q = Math.sqrt(Math.max(disc, 0)), l1 = tr / 2 + q, l2 = tr / 2 - q;
    const dir = (lam) => {
      const v1 = [M.b, lam - M.a], v2 = [lam - M.d, M.c];
      const n1 = Math.hypot(v1[0], v1[1]), n2v = Math.hypot(v2[0], v2[1]);
      if (Math.max(n1, n2v) < 1e-6) return null;          // 纯各向缩放：任意方向
      const v = n1 >= n2v ? v1 : v2, nn = Math.max(n1, n2v);
      return [v[0] / nn, v[1] / nn];
    };
    return { kind: Math.abs(q) < 1e-9 ? 'double' : 'real', lam: [l1, l2], dirs: [dir(l1), dir(l2)], det: det };
  }

  DK.define('m03-vector-field', {
    title: '向量与相似度：量方向，再搬空间',
    viewBox: VB,
    state: {
      catA: 20, catL: 2.2, dogA: 45, dogL: 1.5, carA: 126, carL: 2.4,
      a: 1.4, b: 0.3, c: 0.2, d: 0.9,
      pair: 'cd', eig: true, grid: true
    },

    controls(holder, api) {
      const num = (key, label, min, max, step, unit, on) => {
        const f = DK.range({ key: key, label: label, min: min, max: max, step: step,
          value: api.state[key], unit: unit || '', fmt: v => v.toFixed(step < 1 ? 1 : 0),
          on: on });
        api._field = api._field || {}; api._field[key] = f;
        holder.appendChild(f);
        return f;
      };

      num('dogA', '狗 的方向', 0, 359, 1, '°', (v) => { api.state.dogA = v; api.draw(); });
      num('dogL', '狗 的长度', 0.4, 2.6, 0.1, '', (v) => { api.state.dogL = v; api.draw(); });

      const mlab = { a: 'a（横轴→横向拉伸）', b: 'b（竖轴→横向剪切）', c: 'c（横轴→竖向剪切）', d: 'd（竖轴→竖向拉伸）' };
      ['a', 'b', 'c', 'd'].forEach((k) => num(k, mlab[k], -2, 2, 0.1, '', (v) => { api.state[k] = v; api.draw(); }));

      holder.appendChild(DK.select({
        key: 'pair', label: '对比哪一对', value: api.state.pair,
        options: [
          { value: 'cd', label: '猫 / 狗' },
          { value: 'cc', label: '猫 / 汽车' },
          { value: 'dc', label: '狗 / 汽车' }
        ],
        on(v) { api.state.pair = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({ key: 'eig', label: '特征方向', value: api.state.eig,
        on(v) { api.state.eig = v; api.draw(); } }));
      holder.appendChild(DK.toggle({ key: 'grid', label: '变形网格', value: api.state.grid,
        on(v) { api.state.grid = v; api.draw(); } }));

      const ro = DK.readout([
        ['pair', '对比', ''], ['dot', '点积', ''], ['cos', '余弦相似度', ''],
        ['ang', '夹角', ''], ['dist', '欧氏距离', ''],
        ['det', 'det（面积倍数）', ''], ['eig', '特征值 λ₁ / λ₂', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      api._svg = svg;
      const M = { ox: L.ox, oy: L.oy }, Rx = R.ox, Ry = R.oy;

      svg.appendChild(DK.el('text', { x: 12, y: 18, class: 't-sm muted',
        text: '示意数据（二维投影）· 真实嵌入是 512–12288 维，方向只能算、画不出来' }));
      svg.appendChild(DK.el('text', { x: 12, y: 32, class: 't-xs faint',
        text: '拖动「猫」「狗」箭头的端点，或用下方滑块；「汽车」是固定参照' }));

      /* ---- 左半：静态底 ---- */
      const gL0 = DK.el('g');
      gL0.appendChild(DK.el('text', { x: 12, y: 52, class: 't-sm faint', text: '① 方向就是相似度' }));
      gL0.appendChild(DK.el('line', { x1: M.ox - 132, y1: M.oy, x2: M.ox + 132, y2: M.oy, class: 'grid' }));
      gL0.appendChild(DK.el('line', { x1: M.ox, y1: M.oy - 132, x2: M.ox, y2: M.oy + 118, class: 'grid' }));
      [1, 2].forEach((r) => gL0.appendChild(DK.el('circle', {
        cx: M.ox, cy: M.oy, r: r * L.s, class: 'grid grid--dash', fill: 'none', opacity: .7 })));
      gL0.appendChild(DK.el('text', { x: M.ox + L.s + 3, y: M.oy + 11, class: 't-xs faint', text: '长度 1' }));
      gL0.appendChild(DK.el('text', { x: M.ox + 2 * L.s + 3, y: M.oy + 11, class: 't-xs faint', text: '2' }));
      /* 背景散点：其他词元的示意位置（两团：动物群 / 机械群），固定 seed */
      const rnd = DK.rng(20261003);
      for (let i = 0; i < 9; i++) {
        mkPoint(gL0, M.ox + (0.3 + rnd() * 2.0) * L.s * (rnd() > .25 ? 1 : -0.1) - 0.2 * L.s,
          M.oy - (rnd() * 1.7 + 0.1) * L.s, 'var(--c-fg-faint)', 2);
      }
      for (let i = 0; i < 7; i++) {
        mkPoint(gL0, M.ox - (0.7 + rnd() * 1.6) * L.s, M.oy - (1.1 + rnd() * 0.8) * L.s,
          'var(--c-fg-faint)', 2);
      }
      gL0.appendChild(DK.el('text', { x: 12, y: 372, class: 't-xs faint',
        text: '淡点 = 同一张地图上的其他词元（位置为示意，非真实模型输出）' }));
      svg.appendChild(gL0);

      api.gL = DK.el('g');
      svg.appendChild(api.gL);

      /* ---- 分隔 + 右半静态底 ---- */
      svg.appendChild(DK.el('line', { x1: 352, y1: 44, x2: 352, y2: 384, class: 'grid grid--dash', opacity: .8 }));
      const gR0 = DK.el('g');
      gR0.appendChild(DK.el('text', { x: 366, y: 52, class: 't-sm faint', text: '② 矩阵把整张平面搬走' }));
      gR0.appendChild(DK.el('line', { x1: Rx - 128, y1: Ry, x2: Rx + 128, y2: Ry, class: 'grid' }));
      gR0.appendChild(DK.el('line', { x1: Rx, y1: Ry - 122, x2: Rx, y2: Ry + 122, class: 'grid' }));
      gR0.appendChild(DK.el('circle', { cx: Rx, cy: Ry, r: R.s, class: 'grid grid--dash', fill: 'none' }));
      gR0.appendChild(DK.el('text', { x: Rx + R.s + 4, y: Ry - 4, class: 't-xs faint', text: '单位圆' }));
      gR0.appendChild(DK.el('text', { x: 366, y: 380, class: 't-xs faint',
        text: '橙虚线 = 特征方向；矩阵不对称时它并不与椭圆长轴重合' }));
      svg.appendChild(gR0);

      api.gG = DK.el('g');   // 变形网格（可关）
      api.gR = DK.el('g');   // 椭圆 / 基向量 / 特征方向 / 变换后的向量
      svg.appendChild(api.gG);
      svg.appendChild(api.gR);

      /* ---- 拖拽手柄（键盘请用滑块）---- */
      api._handles = {};
      ['cat', 'dog'].forEach((k) => {
        const h = DK.el('circle', { r: 8, fill: 'var(--c-bg-elev)', stroke: 'var(--c-accent)',
          'stroke-width': 2, style: 'cursor:grab', 'aria-hidden': 'true' });
        api.on(h, 'pointerdown', (ev) => {
          ev.preventDefault();
          try { h.setPointerCapture(ev.pointerId); } catch (e) { /* 某些环境不支持，忽略 */ }
          api._drag = k;
          h.setAttribute('stroke-width', 3);
        });
        api.svg = null;                          // 见下方 _svg 说明：避免误用
        api._svg.appendChild(h);
        api._handles[k] = h;
      });
      api.on(api._svg, 'pointermove', (ev) => {
        if (!api._drag) return;
        const r = api._svg.getBoundingClientRect();
        if (!r.width) return;
        const sx = (ev.clientX - r.left) / r.width * VB[0];
        const sy = (ev.clientY - r.top) / r.height * VB[1];
        const x = (sx - M.ox) / L.s, y = -(sy - M.oy) / L.s;
        const len = DK.clamp(Math.hypot(x, y), 0.4, 2.6);
        let ang = Math.atan2(y, x) * 180 / Math.PI; if (ang < 0) ang += 360;
        const k = api._drag;
        api.state[k + 'A'] = k === 'cat' ? n2(ang) : Math.round(ang);
        api.state[k + 'L'] = n2(len);
        // 把「狗」的两个滑块同步到拖拽结果（派发 input，滑块与读数一起更新）
        const f = api._field && api._field[k === 'cat' ? 'none' : 'dogA'];
        if (k === 'dog' && f) {
          const inp = f.querySelector('input');
          inp.value = String(Math.round(ang));
          inp.dispatchEvent(new Event('input'));   // 触发 on() → 已在 state，draw 一次
        }
        api.draw();
      });
      api.on(api._svg, 'pointerup', () => {
        api._drag = null;
        ['cat', 'dog'].forEach((k) => api._handles[k].setAttribute('stroke-width', 2));
      });
      api.on(api._svg, 'pointerleave', () => { api._drag = null; });
    },

    draw(api) {
      const s = api.state;
      const V = {
        cat: pol(s.catA, s.catL), dog: pol(s.dogA, s.dogL), car: pol(s.carA, s.carL)
      };
      const P = (k) => [L.ox + V[k][0] * L.s, L.oy - V[k][1] * L.s];
      const COL = { cat: 'var(--c-accent)', dog: 'var(--c-warn)', car: 'var(--c-line-strong)' };
      const other = s.pair === 'cd' ? 'car' : s.pair === 'cc' ? 'dog' : 'cat';
      const keys = [other === 'dog' ? 'cat' : 'dog', other];
      const A = s.pair === 'dc' ? 'dog' : 'cat';
      const B = s.pair === 'cc' ? 'car' : (s.pair === 'dc' ? 'car' : 'dog');

      /* ---------- 左半 ---------- */
      const g = api.gL;
      while (g.firstChild) g.removeChild(g.firstChild);

      // 非选中那一支画细、画淡
      [V.cat, V.dog, V.car].forEach((v, i) => {
        const k = ['cat', 'dog', 'car'][i];
        const on = (k === A || k === B);
        const p = P(k);
        arrow(g, L.ox, L.oy, p[0], p[1], COL[k], on ? 3 : 1.8);
        if (k === 'car') {
          g.appendChild(DK.el('circle', { cx: n2(p[0]), cy: n2(p[1]), r: 4, fill: 'none',
            stroke: COL.car, 'stroke-width': 2 }));
        }
        g.appendChild(DK.el('text', { x: n2(p[0] + (v[0] >= 0 ? 8 : -8)), y: n2(p[1] - 8),
          class: on ? 't-sm' : 't-sm faint', 'text-anchor': v[0] >= 0 ? 'start' : 'end',
          text: NAMES[k] + ' ' + DK.fmt(Math.hypot(v[0], v[1]), 1) + '单位' }));
      });

      const a = V[A], b = V[B];
      const dot = a[0] * b[0] + a[1] * b[1];
      const na = Math.hypot(a[0], a[1]), nb = Math.hypot(b[0], b[1]);
      const cos = dot / (na * nb);
      const ang = Math.acos(DK.clamp(cos, -1, 1)) * 180 / Math.PI;
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);

      // 投影：a 投到 b 的方向上（机制段第 ② 步的几何解释）
      const ux = b[0] / nb, uy = b[1] / nb, proj = dot / nb;
      const foot = [L.ox + proj * ux * L.s, L.oy - proj * uy * L.s];
      const pa = P(A), pb = P(B);
      g.appendChild(DK.el('line', { x1: n2(pa[0]), y1: n2(pa[1]), x2: n2(foot[0]), y2: n2(foot[1]),
        stroke: 'var(--c-fg-faint)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
      g.appendChild(DK.el('line', { x1: L.ox, y1: L.oy, x2: n2(foot[0]), y2: n2(foot[1]),
        stroke: 'var(--c-ok)', 'stroke-width': 4, opacity: .85, 'stroke-linecap': 'round' }));
      g.appendChild(DK.el('text', { x: n2(foot[0] + 4), y: n2(foot[1] + 14), class: 't-xs good',
        text: '投影 ' + DK.fmt(proj, 2) }));

      // 夹角弧（走较小的那一侧）
      let a0 = Math.atan2(a[1], a[0]) * 180 / Math.PI, a1 = Math.atan2(b[1], b[0]) * 180 / Math.PI;
      let delta = ((a1 - a0) % 360 + 360) % 360;
      if (delta > 180) { const t = a0; a0 = a1; a1 = t; delta = 360 - delta; }
      const rr = 30;
      g.appendChild(DK.el('path', {
        d: 'M' + n2(L.ox + rr * Math.cos(rad(a0))) + ',' + n2(L.oy - rr * Math.sin(rad(a0))) +
          ' A' + rr + ',' + rr + ' 0 ' + (delta > 180 ? 1 : 0) + ' 0 ' +
          n2(L.ox + rr * Math.cos(rad(a1))) + ',' + n2(L.oy - rr * Math.sin(rad(a1))),
        fill: 'none', stroke: 'var(--c-accent)', 'stroke-width': 1.6 }));
      g.appendChild(DK.el('text', { x: n2(L.ox + 38 * Math.cos(rad(a0 + delta / 2))),
        y: n2(L.oy - 38 * Math.sin(rad(a0 + delta / 2)) + 3), class: 't-xs accent',
        text: DK.fmt(ang, 0) + '°' }));

      // 两端点连线 = 欧氏距离
      g.appendChild(DK.el('line', { x1: n2(pa[0]), y1: n2(pa[1]), x2: n2(pb[0]), y2: n2(pb[1]),
        stroke: 'var(--c-fg-faint)', 'stroke-width': 1.2, 'stroke-dasharray': '2 4' }));
      g.appendChild(DK.el('text', { x: n2((pa[0] + pb[0]) / 2 + 5), y: n2((pa[1] + pb[1]) / 2),
        class: 't-xs muted', text: '距离 ' + DK.fmt(dist, 2) }));

      api._handles.cat.setAttribute('cx', n2(P('cat')[0]));
      api._handles.cat.setAttribute('cy', n2(P('cat')[1]));
      api._handles.dog.setAttribute('cx', n2(P('dog')[0]));
      api._handles.dog.setAttribute('cy', n2(P('dog')[1]));

      /* ---------- 右半 ---------- */
      const Mx = { a: s.a, b: s.b, c: s.c, d: s.d };
      const gp = api.gG;
      while (gp.firstChild) gp.removeChild(gp.firstChild);
      if (s.grid) {
        for (let i = -2; i <= 2; i++) {
          [[i, 'v'], [i, 'h']].forEach((pair) => {
            const pts = [];
            for (let t = -2; t <= 2.001; t += 0.5) {
              const xy = pair[1] === 'v' ? mp(Mx, pair[0], t) : mp(Mx, t, pair[0]);
              pts.push(n2(R.ox + xy[0] * R.s) + ',' + n2(R.oy - xy[1] * R.s));
            }
            gp.appendChild(DK.el('polyline', { points: pts.join(' '), fill: 'none',
              stroke: 'var(--c-line)', 'stroke-width': 1, opacity: pair[0] === 0 ? .95 : .75 }));
          });
        }
      }

      const gr = api.gR;
      while (gr.firstChild) gr.removeChild(gr.firstChild);
      const e = eigen(Mx), det = Mx.a * Mx.d - Mx.b * Mx.c;

      // 单位圆的像
      if (Math.abs(det) < 1e-3) {
        const u = [Mx.a, Mx.c], un = Math.hypot(u[0], u[1]) || 1;
        const v = [Mx.b, Mx.d];
        const ext = Math.max(Math.abs(v[0] * un + v[1] * u[0] / un * 0), 0);
        const p0 = [R.ox - u[0] / un * 2.1 * R.s, R.oy + u[1] / un * 2.1 * R.s];
        const p1 = [R.ox + u[0] / un * 2.1 * R.s, R.oy - u[1] / un * 2.1 * R.s];
        gr.appendChild(DK.el('line', { x1: n2(p0[0]), y1: n2(p0[1]), x2: n2(p1[0]), y2: n2(p1[1]),
          stroke: 'var(--c-err)', 'stroke-width': 3 }));
        gr.appendChild(DK.el('text', { x: 366, y: 366, class: 't-xs bad',
          text: 'det≈0：整张平面被压扁成一条线（面积倍数 ' + DK.fmt(det, 2) + '）' }));
      } else {
        const pts = [];
        for (let t = 0; t <= 6.29; t += 0.09) {
          const xy = mp(Mx, Math.cos(t), Math.sin(t));
          pts.push(n2(R.ox + xy[0] * R.s) + ',' + n2(R.oy - xy[1] * R.s));
        }
        gr.appendChild(DK.el('polygon', { points: pts.join(' '), fill: 'var(--c-accent)',
          'fill-opacity': .1, stroke: 'var(--c-accent)', 'stroke-width': 2.2 }));
      }

      // 两条基向量的落点 = 矩阵的两列（机制段第 ⑤ 步）
      const e1 = [R.ox + Mx.a * R.s, R.oy - Mx.c * R.s];
      const e2 = [R.ox + Mx.b * R.s, R.oy - Mx.d * R.s];
      arrow(gr, R.ox, R.oy, e1[0], e1[1], 'var(--c-warn)', 2.6);
      arrow(gr, R.ox, R.oy, e2[0], e2[1], 'var(--c-ok)', 2.6);
      gr.appendChild(DK.el('text', { x: n2(e1[0] + 6), y: n2(e1[1] - 5), class: 't-xs warm', text: 'e₁→(a,c)' }));
      gr.appendChild(DK.el('text', { x: n2(e2[0] + 6), y: n2(e2[1] + 12), class: 't-xs good', text: 'e₂→(b,d)' }));

      // 特征方向
      if (s.eig) {
        if (e.kind === 'none') {
          gr.appendChild(DK.el('text', { x: 366, y: 366, class: 't-xs bad',
            text: '没有实特征方向：这次搬动含旋转，二维里每条直线都被扳向别处' }));
        } else if (!e.dirs[0] && !e.dirs[1]) {
          gr.appendChild(DK.el('text', { x: 366, y: 366, class: 't-xs muted',
            text: '纯各向缩放：任何方向都不变（λ = ' + DK.fmt(e.lam[0], 2) + '）' }));
        } else {
          e.dirs.forEach((dd, i) => {
            if (!dd) return;
            const k = 1.85 * R.s;
            gr.appendChild(DK.el('line', {
              x1: n2(R.ox - dd[0] * k), y1: n2(R.oy + dd[1] * k),
              x2: n2(R.ox + dd[0] * k), y2: n2(R.oy - dd[1] * k),
              stroke: 'var(--c-warn)', 'stroke-width': 1.6, 'stroke-dasharray': '6 4', opacity: .9 }));
            gr.appendChild(DK.el('text', { x: n2(R.ox + dd[0] * k * 0.86) + 4, y: n2(R.oy - dd[1] * k * 0.86) - 3,
              class: 't-xs warm', text: 'λ' + (i + 1) + '=' + DK.fmt(e.lam[i], 2) }));
          });
        }
      }

      // 被选中的两支向量也一起搬动（把两半联系起来）
      [A, B].forEach((k) => {
        const xy = mp(Mx, V[k][0], V[k][1]);
        const n = Math.hypot(xy[0], xy[1]);
        if (n < 1e-6) return;
        const sc = Math.min(1, 2.7 / n), tx = R.ox + xy[0] * sc * R.s, ty = R.oy - xy[1] * sc * R.s;
        gr.appendChild(DK.el('line', { x1: R.ox, y1: R.oy, x2: n2(tx), y2: n2(ty),
          stroke: COL[k], 'stroke-width': 1.8, 'stroke-dasharray': '5 4', opacity: .9 }));
      });
      gr.appendChild(DK.el('text', { x: 366, y: 68, class: 't-xs faint',
        text: '虚线 = 左半那两支向量被 M 搬去的新方向' }));

      /* ---------- 读数 ---------- */
      const ro = api._ro;
      if (ro) {
        ro.set('pair', NAMES[A] + ' / ' + NAMES[B]);
        ro.set('dot', DK.fmt(dot, 2));
        ro.set('cos', DK.fmt(cos, 3));
        ro.set('ang', DK.fmt(ang, 0) + '°');
        ro.set('dist', DK.fmt(dist, 2));
        ro.set('det', DK.fmt(det, 2));
        ro.set('eig', e.kind === 'none' ? '无实数解' :
          (e.kind === 'double' ? DK.fmt(e.lam[0], 2) + '（重根）' :
            DK.fmt(e.lam[0], 2) + ' / ' + DK.fmt(e.lam[1], 2)));
      }
    },

    hint: '<strong>你能改什么：</strong>左半「狗 的方向」0–359°（箭头指向哪，含义就偏哪）、' +
      '「狗 的长度」0.4–2.6 单位（同方向上有多强；也可直接拖「猫」「狗」的端点，「汽车」固定当参照）。' +
      '右半 a/b/c/d ∈ [−2.0, 2.0] 是矩阵 M = [[a b],[c d]] 的四个元素：' +
      'a、d 分别是横轴、竖轴原地的拉伸倍数，b、c 是剪切项（b 把竖轴扳向横向，c 把横轴扳向竖向）。' +
      '「对比哪一对」在三种组合间切换；两个开关只影响右半显示。<br>' +
      '<strong>拨动它你会看到：</strong>「狗 的方向」转到与猫相差 90° 时点积归 0、投影塌成一个点；越过 90° 点积转负（反向）。' +
      '把「狗 的长度」拉大一倍：点积翻倍，而余弦读数一动不动——这就是「除掉长度只剩方向」。' +
      '右半：a=d=1、b=c=0 时圆还是圆；调成 a=−1、d=1、b=c=0（沿横轴翻转）λ 变成 −1 与 1；' +
      '调成 a=d=0、b=−1、c=1（纯旋转 90°）特征方向标记整条消失，因为平面里没有任何直线能保住方向；' +
      '把 det 调到 0，椭圆塌成一条线——面积倍数归零，空间被压扁。<br>' +
      '<strong>对应机制段：</strong>投影与点积 = 第 ② 步；除掉长度得余弦 = 第 ③ 步（含欧氏距离那条公式）；' +
      '矩阵=整张空间的线性搬动 = 第 ④ 步；看列读基向量落点 = 第 ⑤ 步；' +
      '方向不变的特征向量与被拉伸的倍数 = 第 ⑥ 步；「汽车」离动物群很远而坐标没人规定 = 第 ⑦ 步。'
  });
})(window.AIPrinciples);
