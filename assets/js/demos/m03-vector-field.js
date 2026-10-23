/* ==========================================================================
   m03-vector-field.js · 演示：向量与相似度 + 矩阵=空间变换（DESIGN.md §4 M03）
   左半：二维平面上三支向量（猫 / 狗 / 汽车），实时读数点积、余弦、夹角、距离，
         并画出「投影」这一几何解释；猫与狗的端点可拖，也可用滑块改。
   右半：单位圆在 2×2 矩阵作用下的像（椭圆），以及方向不变的特征方向。

   诚实性：画面上的坐标是为教学挑选的**示意数据**（二维投影），
   不是任何真实模型的嵌入输出；真实嵌入是数百到上万维、画不出来的。
   背景散点用 DK.rng(固定 seed) 生成，保证每次打开、每次重置都是同一张图。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  const VB = [700, 400];
  const L = { ox: 140, oy: 232, s: 48 };   // 左半：数据坐标 → 画布
  const R = { ox: 505, oy: 210, s: 44 };   // 右半
  const NAMES = { cat: '猫', dog: '狗', car: '汽车' };
  const COL = { cat: 'var(--c-accent)', dog: 'var(--c-warn)', car: 'var(--c-line-strong)' };
  const r2 = (v) => Math.round(v * 100) / 100;
  const rad = (d) => d * Math.PI / 180;
  const pol = (a, len) => [len * Math.cos(rad(a)), len * Math.sin(rad(a))];

  function arrow(g, x0, y0, x1, y1, color, w) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy) || 1;
    const ux = dx / n, uy = dy / n, px = -uy, py = ux, k = 9;
    g.appendChild(DK.el('line', { x1: r2(x0), y1: r2(y0), x2: r2(x1), y2: r2(y1),
      stroke: color, 'stroke-width': w || 2.4, 'stroke-linecap': 'round' }));
    g.appendChild(DK.el('path', {
      d: 'M' + r2(x1) + ',' + r2(y1) +
        ' L' + r2(x1 - k * ux + 4 * px) + ',' + r2(y1 - k * uy + 4 * py) +
        ' L' + r2(x1 - k * ux - 4 * px) + ',' + r2(y1 - k * uy - 4 * py) + ' Z', fill: color }));
  }
  /** 数据坐标下 2×2 矩阵的作用 */
  function mp(M, x, y) { return [M.a * x + M.b * y, M.c * x + M.d * y]; }
  /** 实特征值与特征方向 */
  function eigen(M) {
    const tr = M.a + M.d, det = M.a * M.d - M.b * M.c, disc = tr * tr / 4 - det;
    if (disc < -1e-9) return { kind: 'none', lam: [], dirs: [] };
    const q = Math.sqrt(Math.max(disc, 0)), l1 = tr / 2 + q, l2 = tr / 2 - q;
    const dir = (lam) => {
      const v1 = [M.b, lam - M.a], v2 = [lam - M.d, M.c];
      const n1 = Math.hypot(v1[0], v1[1]), n2 = Math.hypot(v2[0], v2[1]);
      if (Math.max(n1, n2) < 1e-6) return null;          // 纯各向缩放：任意方向都是
      const v = n1 >= n2 ? v1 : v2, nn = Math.max(n1, n2);
      return [v[0] / nn, v[1] / nn];
    };
    return { kind: Math.abs(q) < 1e-9 ? 'double' : 'real', lam: [l1, l2], dirs: [dir(l1), dir(l2)] };
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
      api._sl = {};                        // key → 滑块节点（拖拽后用来同步显示）
      const slider = (key, label, min, max, step, dec, unit) => {
        const f = DK.range({
          key: key, label: label, min: min, max: max, step: step, value: api.state[key],
          unit: unit || '', fmt: (v) => v.toFixed(dec),
          on(v) { api.state[key] = v; api.draw(); }
        });
        api._sl[key] = f;
        holder.appendChild(f);
        return f;
      };
      slider('catA', '猫 的方向', 0, 359, 1, 0, '°');
      slider('catL', '猫 的长度', 0.4, 2.6, 0.1, 1);
      slider('dogA', '狗 的方向', 0, 359, 1, 0, '°');
      slider('dogL', '狗 的长度', 0.4, 2.6, 0.1, 1);
      slider('a', 'a 横轴→横向拉伸', -2, 2, 0.1, 1);
      slider('b', 'b 竖轴→横向剪切', -2, 2, 0.1, 1);
      slider('c', 'c 横轴→竖向剪切', -2, 2, 0.1, 1);
      slider('d', 'd 竖轴→竖向拉伸', -2, 2, 0.1, 1);

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
        ['det', 'det 面积倍数', ''], ['eig', '特征值 λ₁/λ₂', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      api._svg = svg;
      const M = { ox: L.ox, oy: L.oy }, Rx = R.ox, Ry = R.oy;

      svg.appendChild(DK.el('text', { x: 12, y: 18, class: 't-sm muted',
        text: '示意数据（二维投影）· 真实嵌入是 512–12288 维，方向只能算，画不出来' }));
      svg.appendChild(DK.el('text', { x: 12, y: 32, class: 't-xs faint',
        text: '拖「猫」「狗」的箭头端点，或用下方滑块；「汽车」是固定参照' }));

      /* ---- 左半底：坐标轴 + 长度圈 + 其他词元的示意散点 ---- */
      const gL0 = DK.el('g');
      gL0.appendChild(DK.el('text', { x: 12, y: 52, class: 't-sm faint', text: '① 方向就是相似度' }));
      gL0.appendChild(DK.el('line', { x1: M.ox - 132, y1: M.oy, x2: M.ox + 132, y2: M.oy, class: 'grid' }));
      gL0.appendChild(DK.el('line', { x1: M.ox, y1: M.oy - 132, x2: M.ox, y2: M.oy + 116, class: 'grid' }));
      [1, 2].forEach((r) => gL0.appendChild(DK.el('circle', {
        cx: M.ox, cy: M.oy, r: r * L.s, class: 'grid grid--dash', fill: 'none', opacity: .7 })));
      gL0.appendChild(DK.el('text', { x: M.ox + L.s + 3, y: M.oy + 12, class: 't-xs faint', text: '长 1' }));
      gL0.appendChild(DK.el('text', { x: M.ox + 2 * L.s + 3, y: M.oy + 12, class: 't-xs faint', text: '长 2' }));
      const rnd = DK.rng(20261003);                 // 固定 seed：散点每次一模一样
      for (let i = 0; i < 9; i++) {                // 动物群：贴着猫狗方向的松散一团
        gL0.appendChild(DK.el('circle', { cx: r2(M.ox + (0.2 + rnd() * 2.1) * L.s),
          cy: r2(M.oy - (0.1 + rnd() * 1.5) * L.s), r: 2.2, fill: 'var(--c-fg-faint)', opacity: .45 }));
      }
      for (let i = 0; i < 7; i++) {                // 机械群：另一个方向上的一团
        gL0.appendChild(DK.el('circle', { cx: r2(M.ox - (0.8 + rnd() * 1.5) * L.s),
          cy: r2(M.oy - (1.0 + rnd() * 0.8) * L.s), r: 2.2, fill: 'var(--c-fg-faint)', opacity: .45 }));
      }
      gL0.appendChild(DK.el('text', { x: 12, y: 386, class: 't-xs faint',
        text: '淡点 = 同一张地图上的其他词元（位置示意，非真实模型输出）' }));
      svg.appendChild(gL0);

      api.gL = DK.el('g');
      svg.appendChild(api.gL);

      /* ---- 右半底 ---- */
      svg.appendChild(DK.el('line', { x1: 352, y1: 44, x2: 352, y2: 392, class: 'grid grid--dash', opacity: .8 }));
      const gR0 = DK.el('g');
      gR0.appendChild(DK.el('text', { x: 366, y: 52, class: 't-sm faint', text: '② 矩阵把整张平面搬走' }));
      gR0.appendChild(DK.el('line', { x1: Rx - 128, y1: Ry, x2: Rx + 128, y2: Ry, class: 'grid' }));
      gR0.appendChild(DK.el('line', { x1: Rx, y1: Ry - 122, x2: Rx, y2: Ry + 122, class: 'grid' }));
      gR0.appendChild(DK.el('circle', { cx: Rx, cy: Ry, r: R.s, class: 'grid grid--dash', fill: 'none' }));
      gR0.appendChild(DK.el('text', { x: Rx + R.s + 4, y: Ry - 4, class: 't-xs faint', text: '单位圆' }));
      gR0.appendChild(DK.el('text', { x: 366, y: 386, class: 't-xs faint',
        text: '橙虚线 = 特征方向（搬完仍落在自己那条直线上）' }));
      svg.appendChild(gR0);

      api.gG = DK.el('g');   // 变形后的网格（可用开关关掉）
      api.gR = DK.el('g');   // 椭圆 / 基向量落点 / 特征方向 / 搬动后的向量
      svg.appendChild(api.gG);
      svg.appendChild(api.gR);

      /* ---- 拖拽手柄（键盘操作请走滑块，两者状态互通）---- */
      api._handles = {};
      ['cat', 'dog'].forEach((k) => {
        const h = DK.el('circle', { r: 8, fill: 'var(--c-bg-elev)', stroke: COL[k],
          'stroke-width': 2, style: 'cursor:grab' });
        h.setAttribute('role', 'img');
        h.setAttribute('aria-label', NAMES[k] + ' 向量的端点，可拖动');
        api.on(h, 'pointerdown', (ev) => {
          ev.preventDefault();
          try { h.setPointerCapture(ev.pointerId); } catch (e) { /* 环境不支持则忽略 */ }
          api._drag = k;
          h.setAttribute('stroke-width', 3);
        });
        svg.appendChild(h);
        api._handles[k] = h;
      });
      const setSlider = (key, val) => {
        const f = api._sl[key]; if (!f) return;
        const inp = f.querySelector('input'); if (!inp) return;
        inp.value = String(val);
        const out = f.querySelector('output');
        if (out) out.textContent = Number(val).toFixed(key.endsWith('A') ? 0 : 1);
      };
      api.on(svg, 'pointermove', (ev) => {
        if (!api._drag) return;
        const box = api._svg.getBoundingClientRect();
        if (!box.width) return;
        const x = ((ev.clientX - box.left) / box.width * VB[0] - L.ox) / L.s;
        const y = -((ev.clientY - box.top) / box.height * VB[1] - L.oy) / L.s;
        const len = DK.clamp(Math.hypot(x, y), 0.4, 2.6);
        let ang = Math.atan2(y, x) * 180 / Math.PI;
        if (ang < 0) ang += 360;
        const k = api._drag;
        api.state[k + 'A'] = Math.round(ang);
        api.state[k + 'L'] = Math.round(len * 10) / 10;
        setSlider(k + 'A', api.state[k + 'A']);       // 滑块与拖拽保持一致
        setSlider(k + 'L', api.state[k + 'L']);
        api.draw();
      });
      const endDrag = () => {
        api._drag = null;
        ['cat', 'dog'].forEach((k) => api._handles[k] && api._handles[k].setAttribute('stroke-width', 2));
      };
      api.on(svg, 'pointerup', endDrag);
      api.on(svg, 'pointerleave', endDrag);
    },

    draw(api) {
      const s = api.state;
      const V = { cat: pol(s.catA, s.catL), dog: pol(s.dogA, s.dogL), car: pol(s.carA, s.carL) };
      const P = (k) => [L.ox + V[k][0] * L.s, L.oy - V[k][1] * L.s];
      const A = s.pair === 'dc' ? 'dog' : 'cat';
      const B = s.pair === 'cc' ? 'car' : (s.pair === 'dc' ? 'car' : 'dog');

      /* ---------- 左半 ---------- */
      const g = api.gL;
      while (g.firstChild) g.removeChild(g.firstChild);

      ['cat', 'dog', 'car'].forEach((k) => {
        const on = (k === A || k === B);
        const p = P(k), v = V[k];
        arrow(g, L.ox, L.oy, p[0], p[1], COL[k], on ? 3 : 1.8);
        if (k === 'car') g.appendChild(DK.el('circle', { cx: r2(p[0]), cy: r2(p[1]), r: 4,
          fill: 'none', stroke: COL.car, 'stroke-width': 2 }));
        g.appendChild(DK.el('text', { x: r2(p[0] + (v[0] >= 0 ? 8 : -8)), y: r2(p[1] - 8),
          class: on ? 't-sm' : 't-sm faint', 'text-anchor': v[0] >= 0 ? 'start' : 'end',
          text: NAMES[k] + ' · 长 ' + DK.fmt(Math.hypot(v[0], v[1]), 1) }));
      });

      const a = V[A], b = V[B];
      const dot = a[0] * b[0] + a[1] * b[1];
      const na = Math.hypot(a[0], a[1]), nb = Math.hypot(b[0], b[1]) || 1e-9;
      const cos = dot / (na * nb);
      const ang = Math.acos(DK.clamp(cos, -1, 1)) * 180 / Math.PI;
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const pa = P(A), pb = P(B);

      // 投影（机制段第 ② 步：点积 = 投影长度 × 被投到的那支的长度）
      const ux = b[0] / nb, uy = b[1] / nb, proj = dot / nb;
      const foot = [L.ox + proj * ux * L.s, L.oy - proj * uy * L.s];
      g.appendChild(DK.el('line', { x1: r2(pa[0]), y1: r2(pa[1]), x2: r2(foot[0]), y2: r2(foot[1]),
        stroke: 'var(--c-fg-faint)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
      g.appendChild(DK.el('line', { x1: L.ox, y1: L.oy, x2: r2(foot[0]), y2: r2(foot[1]),
        stroke: 'var(--c-ok)', 'stroke-width': 4, opacity: .85, 'stroke-linecap': 'round' }));
      g.appendChild(DK.el('text', { x: r2(foot[0] + 5), y: r2(foot[1] + 14), class: 't-xs good',
        text: '投影 ' + DK.fmt(proj, 2) + ' × 长 ' + DK.fmt(nb, 1) }));

      // 夹角弧（走较小的那一侧）
      let a0 = Math.atan2(a[1], a[0]) * 180 / Math.PI, a1 = Math.atan2(b[1], b[0]) * 180 / Math.PI;
      let delta = ((a1 - a0) % 360 + 360) % 360;
      if (delta > 180) { const t = a0; a0 = a1; a1 = t; delta = 360 - delta; }
      const rr = 30;
      g.appendChild(DK.el('path', {
        d: 'M' + r2(L.ox + rr * Math.cos(rad(a0))) + ',' + r2(L.oy - rr * Math.sin(rad(a0))) +
          ' A' + rr + ',' + rr + ' 0 0 0 ' + r2(L.ox + rr * Math.cos(rad(a1))) + ',' + r2(L.oy - rr * Math.sin(rad(a1))),
        fill: 'none', stroke: 'var(--c-accent)', 'stroke-width': 1.6 }));
      g.appendChild(DK.el('text', { x: r2(L.ox + 40 * Math.cos(rad(a0 + delta / 2))),
        y: r2(L.oy - 40 * Math.sin(rad(a0 + delta / 2)) + 3), class: 't-xs accent',
        text: DK.fmt(ang, 0) + '°' }));

      // 端点连线 = 欧氏距离
      g.appendChild(DK.el('line', { x1: r2(pa[0]), y1: r2(pa[1]), x2: r2(pb[0]), y2: r2(pb[1]),
        stroke: 'var(--c-fg-faint)', 'stroke-width': 1.2, 'stroke-dasharray': '2 4' }));
      g.appendChild(DK.el('text', { x: r2((pa[0] + pb[0]) / 2 + 5), y: r2((pa[1] + pb[1]) / 2),
        class: 't-xs muted', text: '距离 ' + DK.fmt(dist, 2) }));

      api._handles.cat.setAttribute('cx', r2(P('cat')[0]));
      api._handles.cat.setAttribute('cy', r2(P('cat')[1]));
      api._handles.dog.setAttribute('cx', r2(P('dog')[0]));
      api._handles.dog.setAttribute('cy', r2(P('dog')[1]));

      /* ---------- 右半 ---------- */
      const Mat = { a: s.a, b: s.b, c: s.c, d: s.d };
      const gp = api.gG;
      while (gp.firstChild) gp.removeChild(gp.firstChild);
      if (s.grid) {
        for (let i = -2; i <= 2; i++) {
          const vert = [], horz = [];
          for (let t = -2; t <= 2.001; t += 0.5) {
            const pv = mp(Mat, i, t), ph = mp(Mat, t, i);
            vert.push(r2(R.ox + pv[0] * R.s) + ',' + r2(R.oy - pv[1] * R.s));
            horz.push(r2(R.ox + ph[0] * R.s) + ',' + r2(R.oy - ph[1] * R.s));
          }
          const op = i === 0 ? .95 : .7;
          gp.appendChild(DK.el('polyline', { points: vert.join(' '), fill: 'none',
            stroke: 'var(--c-line)', 'stroke-width': 1, opacity: op }));
          gp.appendChild(DK.el('polyline', { points: horz.join(' '), fill: 'none',
            stroke: 'var(--c-line)', 'stroke-width': 1, opacity: op }));
        }
      }

      const gr = api.gR;
      while (gr.firstChild) gr.removeChild(gr.firstChild);
      const e = eigen(Mat), det = Mat.a * Mat.d - Mat.b * Mat.c;

      if (Math.abs(det) < 1e-3) {
        // 退化：平面被压扁成一条线
        const un = Math.hypot(Mat.a, Mat.c) || Math.hypot(Mat.b, Mat.d) || 1;
        const ux2 = Math.hypot(Mat.a, Mat.c) > 1e-6 ? [Mat.a / un, Mat.c / un] : [Mat.b / un, Mat.d / un];
        const k = 2.1 * R.s;
        gr.appendChild(DK.el('line', { x1: r2(R.ox - ux2[0] * k), y1: r2(R.oy + ux2[1] * k),
          x2: r2(R.ox + ux2[0] * k), y2: r2(R.oy - ux2[1] * k),
          stroke: 'var(--c-err)', 'stroke-width': 3 }));
        gr.appendChild(DK.el('text', { x: 366, y: 368, class: 't-xs bad',
          text: 'det≈0：整张平面被压扁成一条线' }));
      } else {
        const pts = [];
        for (let t = 0; t <= 6.29; t += 0.09) {
          const xy = mp(Mat, Math.cos(t), Math.sin(t));
          pts.push(r2(R.ox + xy[0] * R.s) + ',' + r2(R.oy - xy[1] * R.s));
        }
        gr.appendChild(DK.el('polygon', { points: pts.join(' '), fill: 'var(--c-accent)',
          'fill-opacity': .1, stroke: 'var(--c-accent)', 'stroke-width': 2.2 }));
      }

      // 两条基向量的落点 = 矩阵的两列（机制段第 ⑤ 步）
      const e1 = [R.ox + Mat.a * R.s, R.oy - Mat.c * R.s];
      const e2 = [R.ox + Mat.b * R.s, R.oy - Mat.d * R.s];
      arrow(gr, R.ox, R.oy, e1[0], e1[1], 'var(--c-warn)', 2.6);
      arrow(gr, R.ox, R.oy, e2[0], e2[1], 'var(--c-ok)', 2.6);
      gr.appendChild(DK.el('text', { x: r2(e1[0] + 6), y: r2(e1[1] - 5), class: 't-xs warm', text: 'e₁→(a,c)' }));
      gr.appendChild(DK.el('text', { x: r2(e2[0] + 6), y: r2(e2[1] + 12), class: 't-xs good', text: 'e₂→(b,d)' }));

      if (s.eig) {
        if (e.kind === 'none') {
          gr.appendChild(DK.el('text', { x: 366, y: 352, class: 't-xs bad',
            text: '无实特征方向：这次搬动含旋转，平面里没有直线能保住方向' }));
        } else if (!e.dirs[0] && !e.dirs[1]) {
          gr.appendChild(DK.el('text', { x: 366, y: 352, class: 't-xs muted',
            text: '纯各向缩放：任何方向都不变，λ = ' + DK.fmt(e.lam[0], 2) }));
        } else {
          e.dirs.forEach((dd, i) => {
            if (!dd) return;
            const k = 1.8 * R.s;
            gr.appendChild(DK.el('line', {
              x1: r2(R.ox - dd[0] * k), y1: r2(R.oy + dd[1] * k),
              x2: r2(R.ox + dd[0] * k), y2: r2(R.oy - dd[1] * k),
              stroke: 'var(--c-warn)', 'stroke-width': 1.6, 'stroke-dasharray': '6 4', opacity: .9 }));
            gr.appendChild(DK.el('text', { x: r2(R.ox + dd[0] * k * 0.8) + 3, y: r2(R.oy - dd[1] * k * 0.8) - 4,
              class: 't-xs warm', text: 'λ' + (i + 1) + '=' + DK.fmt(e.lam[i], 2) }));
          });
        }
      }

      // 左半那两支向量被同一次搬动送去的新方向（把两半联系起来）
      [A, B].forEach((k) => {
        const xy = mp(Mat, V[k][0], V[k][1]);
        const n = Math.hypot(xy[0], xy[1]);
        if (n < 1e-6) return;
        const sc = Math.min(1, 2.7 / n), tx = R.ox + xy[0] * sc * R.s, ty = R.oy - xy[1] * sc * R.s;
        gr.appendChild(DK.el('line', { x1: R.ox, y1: R.oy, x2: r2(tx), y2: r2(ty),
          stroke: COL[k], 'stroke-width': 1.8, 'stroke-dasharray': '5 4', opacity: .9 }));
      });

      /* ---------- 读数 ---------- */
      const ro = api._ro;
      if (ro) {
        ro.set('pair', NAMES[A] + ' / ' + NAMES[B]);
        ro.set('dot', DK.fmt(dot, 2));
        ro.set('cos', DK.fmt(cos, 3));
        ro.set('ang', DK.fmt(ang, 0) + '°');
        ro.set('dist', DK.fmt(dist, 2));
        ro.set('det', DK.fmt(det, 2));
        ro.set('eig', e.kind === 'none' ? '无实数解'
          : (e.kind === 'double' ? DK.fmt(e.lam[0], 2) + '（重根）'
            : DK.fmt(e.lam[0], 2) + ' / ' + DK.fmt(e.lam[1], 2)));
      }
    },

    hint: '<strong>你能改什么：</strong>左半「猫/狗 的方向」0–359°（箭头指向哪，含义就偏哪）、' +
      '「猫/狗 的长度」0.4–2.6 单位（同一方向上有多强）；也可直接拖端点，滑块会跟着走。' +
      '「汽车」固定当参照。右半 a、b、c、d ∈ [−2.0, 2.0] 是矩阵 M = [[a b],[c d]] 的四个元素：' +
      'a、d 是横轴与竖轴各自朝向自己的拉伸倍数，b、c 是剪切项（b 把竖轴扳向横向，c 把横轴扳向竖向）。' +
      '「对比哪一对」在猫/狗、猫/汽车、狗/汽车间切换读数；两个开关只影响右半显示。<br>' +
      '<strong>拨动它你会看到：</strong>方向差到 90° 时点积归 0、绿色投影塌成一个点，越过 90° 点积转负；' +
      '把长度调大一倍，点积翻倍而余弦读数一动不动——除掉长度之后只剩方向。' +
      '右半：a=1,d=1,b=0,c=0 时圆仍是圆；a=−1,d=1,b=c=0 是沿横轴翻转，λ 读作 −1 与 1（特征值小于 1 是压短，负值是扳向反向）；' +
      'a=0,d=0,b=−1,c=1 是纯旋转 90°，橙色特征方向标记整条消失；把 det 调到 0，椭圆塌成一条线。<br>' +
      '<strong>对应机制段：</strong>投影与点积 = 第 ② 步；除掉长度得余弦、以及欧氏距离那条公式 = 第 ③ 步；' +
      '矩阵=整张空间的线性搬动 = 第 ④ 步；读列看基向量落点 = 第 ⑤ 步；' +
      '方向不变的特征向量与被拉伸的倍数 = 第 ⑥ 步；「汽车」离动物群很远、而坐标没人规定 = 第 ⑦ 步。'
  });
})(window.AIPrinciples);
