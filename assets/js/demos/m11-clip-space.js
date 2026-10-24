/* ==========================================================================
   m11-clip-space.js · 图文对齐的嵌入空间（DESIGN.md §4 M11 / §6.3）
   教学要点：
     ① 对比学习不是「标注」，而是「配对拉近、不配对推开」
     ② 零样本分类 = 把类别写成句子，再做检索
     ③ 温度 τ 决定「推得多狠」——与 M10 的采样温度是同一个数学角色
   几何设计：6 对图文按 60° 均匀分布在不同方向角上，图像在内圈、句子在外圈
   同一射线稍远处。于是「配对的余弦相似度 = cos(0°) = 1」而「相邻簇 =
   cos(60°) = 0.5」——这个 0.5 的落差正是让 softmax 读数清晰可读的原因
   （若把簇摆得方向相近，配对与近邻的余弦会同时接近 1，检索结果就糊成一片）。
   诚实性：坐标是人工编排的二维示意，「训练」用插值模拟而非真实梯度下降。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  const CX = 225, CY = 215, R_IMG = 118, R_TXT = 140;
  const LABELS = [
    { img: '猫',   txt: '一只猫的照片' },
    { img: '狗',   txt: '一只狗的照片' },
    { img: '沙滩', txt: '一片海滩的照片' },
    { img: '雪山', txt: '一座雪山的照片' },
    { img: '汽车', txt: '一辆汽车的照片' },
    { img: '披萨', txt: '一张披萨的照片' }
  ];
  const DISTRACT = ['一首交响乐', '元素周期表'];
  const N = LABELS.length;

  /** 第 i 对的方向角：从正上方起，每 60° 一组 */
  const ang = (i) => (-90 + i * 60) * Math.PI / 180;
  const TARGET = LABELS.map((p, i) => {
    const a = ang(i);
    return {
      ix: CX + R_IMG * Math.cos(a), iy: CY + R_IMG * Math.sin(a),
      tx: CX + R_TXT * Math.cos(a), ty: CY + R_TXT * Math.sin(a)
    };
  });
  /* 干扰句收敛到两个簇之间的方向、更外圈：训练后被挤到边缘 */
  const DIS_T = DISTRACT.map((t, i) => {
    const a = ang(i === 0 ? 0 : 3) + (i === 0 ? Math.PI / 6 : -Math.PI / 6);
    return { x: CX + 176 * Math.cos(a), y: CY + 176 * Math.sin(a) };
  });

  const rnd = DK.rng(11);
  /* 未训练态用网格槽位而不是极坐标抖动：
     收敛态靠 60° 角分隔保证不碰撞，但 ±150px 的随机抖动会把不同射线的点
     甩到一起（标签宽约 77px，远超角向余量）。网格列距 104px 稳定容得下标签。
     只在 y 上抖动（行距 80px、字高 12px，余量大）；x 不抖以免压到右列标签。
     图与文交错排布，视觉上仍是「混在一起、尚未对齐」。 */
  const GRID = { x0: 46, dx: 104, y0: 66, dy: 80 };
  const slot = (n) => ({
    x: GRID.x0 + (n % 4) * GRID.dx,
    y: GRID.y0 + Math.floor(n / 4) * GRID.dy + (rnd() - .5) * 30
  });
  const START = TARGET.map((p, i) => {
    const gi = slot(i * 2), ti = slot(i * 2 + 1);
    return { ix: gi.x, iy: gi.y, tx: ti.x, ty: ti.y };
  });
  const DIS_S = DISTRACT.map((t, i) => slot(12 + i));

  const lerp2 = (a, b, t) => ({ x: DK.lerp(a.x, b.x, t), y: DK.lerp(a.y, b.y, t) });
  const cos = (ax, ay, bx, by) => (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);

  DK.define('m11-clip-space', {
    title: '图文对齐的嵌入空间',
    viewBox: [700, 436],   // 底部两行图例，最后一行基线 424 + 降部需留白
    state: { step: 0, query: 0, tau: 0.10, push: true },

    controls(holder, api) {
      holder.appendChild(DK.range({
        key: 'step', label: '训练步数', min: 0, max: 100, value: 0,
        fmt: v => v + '%',
        on(v) { api.state.step = v; api.draw(); }
      }));
      holder.appendChild(DK.select({
        key: 'query', label: '查询图像', value: '0',
        options: LABELS.map((p, i) => ({ value: String(i), label: p.img })),
        on(v) { api.state.query = +v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'tau', label: '温度 τ', min: 0.02, max: 0.5, step: 0.01, value: 0.10,
        fmt: v => v.toFixed(2),
        on(v) { api.state.tau = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'push', label: '推开不配对（对比项）', value: true,
        on(v) { api.state.push = v; api.draw(); }
      }));
      const ro = DK.readout([
        ['top1', '检索第一名', ''],
        ['hit', '是否命中配对', ''],
        ['p1', '它有多自信', ''],
        ['distract', '干扰项抢走']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      svg.appendChild(DK.el('text', { x: 12, y: 20, class: 't-sm muted',
        text: '左：6 张图（方块）与 6 句话（圆点）的投影，虚线为配对关系' }));
      svg.appendChild(DK.el('text', { x: 470, y: 20, class: 't-sm muted',
        text: '右：查询图与每句话的相似度' }));
      svg.appendChild(DK.el('text', { x: 12, y: 36, class: 't-xs faint',
        text: '示意数据：坐标为人工编排，「训练」用插值模拟而非真实梯度下降。' }));

      /* 参考圈与中心——余弦相似度以中心为原点计算。
         中心点不写「原点」二字：它落在图中央，与网格槽位的标签必然挤在一起，
         改由底部图例说明，信息不丢、冲突根除。 */
      svg.appendChild(DK.el('circle', { cx: CX, cy: CY, r: R_IMG, class: 'grid', 'stroke-dasharray': '2 5' }));
      svg.appendChild(DK.el('circle', { cx: CX, cy: CY, r: 3, fill: 'var(--c-fg-faint)' }));

      api.links = DK.el('g'); svg.appendChild(api.links);
      api.nodes = DK.el('g'); svg.appendChild(api.nodes);

      api.linkEls = LABELS.map(() => {
        const l = DK.el('line', { class: 'grid', 'stroke-dasharray': '3 3' });
        api.links.appendChild(l); return l;
      });
      api.qLine = DK.el('line', { stroke: 'var(--c-warn)', 'stroke-width': 2 });
      api.nodes.appendChild(api.qLine);

      api.imgEls = LABELS.map((p, i) => {
        const g = DK.el('g', { style: 'cursor:pointer', role: 'button',
          'aria-label': '用这张图作为查询：' + p.img, tabindex: '0' });
        const r = DK.el('rect', { width: 15, height: 15, rx: 2, fill: 'var(--c-accent)' });
        const t = DK.el('text', { class: 't-xs', x: 19, y: 12, text: p.img });
        g.appendChild(r); g.appendChild(t);
        const pick = () => { api.state.query = i; api.draw(); };
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pick(); });
        api.nodes.appendChild(g);
        return { g, r, t };
      });
      api.txtEls = LABELS.map((p) => {
        const g = DK.el('g');
        const c = DK.el('circle', { r: 6, fill: 'var(--c-ok)' });
        const t = DK.el('text', { class: 't-xs', x: 10, y: 4, text: p.txt });
        g.appendChild(c); g.appendChild(t);
        api.nodes.appendChild(g);
        return { g, c, t };
      });
      api.disEls = DISTRACT.map((t) => {
        const g = DK.el('g');
        const c = DK.el('circle', { r: 6, fill: 'var(--c-err)' });
        const lab = DK.el('text', { class: 't-xs', x: 10, y: 4, text: t });
        g.appendChild(c); g.appendChild(lab);
        api.nodes.appendChild(g);
        return { g, c, lab };
      });

      /* 右侧概率条 */
      svg.appendChild(DK.el('line', { x1: 458, y1: 44, x2: 458, y2: 260, class: 'grid' }));
      svg.appendChild(DK.el('text', { x: 470, y: 56, class: 't-sm muted',
        text: 'softmax(余弦相似度 / τ)' }));
      api.barEls = LABELS.map((p, i) => {
        const y = 66 + i * 27;
        const g = DK.el('g');
        g.appendChild(DK.el('text', { x: 470, y: y + 9, class: 't-xs', text: p.txt }));
        const bg = DK.el('rect', { x: 470, y: y + 13, width: 216, height: 7, rx: 2, fill: 'var(--c-bg-sunken)' });
        const fg = DK.el('rect', { x: 470, y: y + 13, width: 0, height: 7, rx: 2 });
        const pv = DK.el('text', { x: 686, y: y + 9, class: 't-xs muted', 'text-anchor': 'end' });
        g.appendChild(bg); g.appendChild(fg); g.appendChild(pv);
        svg.appendChild(g);
        return { fg, pv, g };
      });
      /* 干扰项条 */
      api.disBarEls = DISTRACT.map((t, i) => {
        const y = 66 + (N + i) * 27;
        const g = DK.el('g');
        g.appendChild(DK.el('text', { x: 470, y: y + 9, class: 't-xs', fill: 'var(--c-err)', text: t + '（干扰）' }));
        const bg = DK.el('rect', { x: 470, y: y + 13, width: 216, height: 7, rx: 2, fill: 'var(--c-bg-sunken)' });
        const fg = DK.el('rect', { x: 470, y: y + 13, width: 0, height: 7, rx: 2, fill: 'var(--c-err)' });
        const pv = DK.el('text', { x: 686, y: y + 9, class: 't-xs muted', 'text-anchor': 'end' });
        g.appendChild(bg); g.appendChild(fg); g.appendChild(pv);
        svg.appendChild(g);
        return { fg, pv, g };
      });
      svg.appendChild(DK.el('text', { x: 12, y: 412, class: 't-xs faint',
        text: '绿点 = 与图配对的句子　红点 = 干扰句子（本不该靠近任何图）　方块 = 图像　虚线 = 配对关系' }));
      svg.appendChild(DK.el('text', { x: 12, y: 424, class: 't-xs faint',
        text: '中心点 = 余弦相似度的原点：两点夹角越小越相似，与离中心多远无关' }));
    },

    draw(api) {
      const s = api.state;
      const t = s.step / 100;
      const pushT = s.push ? t : 0;

      const imgPos = TARGET.map((p, i) => lerp2({ x: START[i].ix, y: START[i].iy }, { x: p.ix, y: p.iy }, t));
      const txtPos = TARGET.map((p, i) => lerp2({ x: START[i].tx, y: START[i].ty }, { x: p.tx, y: p.ty }, t));
      const disPos = DIS_T.map((d, i) => lerp2({ x: DIS_S[i].x, y: DIS_S[i].y }, d, pushT));

      imgPos.forEach((p, i) => api.imgEls[i].g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')'));
      txtPos.forEach((p, i) => api.txtEls[i].g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')'));
      disPos.forEach((p, i) => api.disEls[i].g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')'));

      LABELS.forEach((p, i) => {
        const a = imgPos[i], b = txtPos[i], l = api.linkEls[i];
        l.setAttribute('x1', (a.x + 7).toFixed(1)); l.setAttribute('y1', (a.y + 7).toFixed(1));
        l.setAttribute('x2', b.x.toFixed(1)); l.setAttribute('y2', b.y.toFixed(1));
        l.setAttribute('stroke', 'var(--c-line-strong)');
        l.setAttribute('opacity', (0.3 + 0.5 * (1 - t)).toFixed(2));
      });

      const q = imgPos[s.query];
      api.imgEls.forEach((n, i) => {
        const on = i === s.query;
        n.r.setAttribute('fill', on ? 'var(--c-warn)' : 'var(--c-accent)');
        n.t.setAttribute('font-weight', on ? 700 : 400);
      });
      const qt = txtPos[s.query];
      api.qLine.setAttribute('x1', (q.x + 7).toFixed(1)); api.qLine.setAttribute('y1', (q.y + 7).toFixed(1));
      api.qLine.setAttribute('x2', qt.x.toFixed(1)); api.qLine.setAttribute('y2', qt.y.toFixed(1));
      api.qLine.setAttribute('opacity', t > 0.02 ? 1 : 0.3);

      /* 余弦相似度：以图心为原点 */
      const qv = { x: q.x + 7 - CX, y: q.y + 7 - CY };
      const sims = txtPos.map(p => cos(qv.x, qv.y, p.x - CX, p.y - CY));
      const disSims = disPos.map(p => cos(qv.x, qv.y, p.x - CX, p.y - CY));
      const all = sims.concat(disSims);
      /* 数值稳定：先减最大值再取指数 */
      const mx = Math.max(...all);
      const ex = all.map(v => Math.exp((v - mx) / s.tau));
      const sum = ex.reduce((a, b) => a + b, 0) || 1;
      const probs = ex.map(v => v / sum);

      const ranked = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
      const [topP, topI] = ranked[0];

      api.barEls.forEach((b, i) => {
        const p = probs[i];
        b.fg.setAttribute('width', Math.max(1, 216 * p).toFixed(1));
        b.fg.setAttribute('fill', DK.heatFill(p > 0.5 ? 1 : p * 2));
        b.pv.textContent = (p * 100).toFixed(p < 0.01 ? 2 : 0) + '%';
        b.g.setAttribute('opacity', i === s.query ? 1 : 0.8);
      });
      let disTotal = 0;
      api.disBarEls.forEach((b, i) => {
        const p = probs[N + i];
        disTotal += p;
        b.fg.setAttribute('width', Math.max(1, 216 * p).toFixed(1));
        b.pv.textContent = (p * 100).toFixed(p < 0.01 ? 2 : 0) + '%';
      });

      if (api._ro) {
        const hit = topI === s.query;
        api._ro.set('top1', topI < N ? LABELS[topI].txt : '干扰项「' + DISTRACT[topI - N] + '」');
        api._ro.set('hit', hit ? '命中' : '未命中（但依然自信）');
        api._ro.set('p1', (topP * 100).toFixed(1) + '%');
        api._ro.set('distract', (disTotal * 100).toFixed(1) + '%');
      }
    },

    hint: '<strong>你能改什么：</strong>训练步数 0–100%（0 = 随机初始化，100 = 充分对齐）；查询图像（6 选 1，也可直接点方块或按 Enter）；' +
      '温度 τ ∈ [0.02, 0.5]（对比学习的温度，与 M10 的采样温度<strong>数学角色相同</strong>：τ 小 = 只盯最像的负例，τ 大 = 逼模型把所有负例都推开）；' +
      '「推开不配对」开关（等价于删掉 InfoNCE 的第二项）。<br>' +
      '<strong>拨动它你会看到（先做一个实验）：</strong>把训练步数拉回 0，然后逐条查询六张图。' +
      '你会发现右侧的<strong>概率条依然很高</strong>——softmax 总会给出一个尖锐的分布，可「是否命中配对」这一栏会告诉你它其实在瞎猜。' +
      '<em>自信与正确是两件事，这个演示把它们的分离直接摊在你面前。</em>再拖到 100%，命中变成稳定全对，此时高置信才第一次有了内容。<br>' +
      '继续观察：① 关掉「推开不配对」，红点漂进图像堆里开始抢票，而且<strong>配对句自己的概率也一起掉</strong>——只拉近、不推开学不出判别性；' +
      '② τ 拉到 0.5 时所有条变平，压到 0.02 时一票独大，但<strong>命中与否只由几何决定，τ 只改变你读到多少自信</strong>。<br>' +
      '<strong>对应机制段：</strong>第 ⑤ 步（配对拉近、不配对推开）、第 ⑥ 步（零样本分类就是检索）、公式 InfoNCE 的两项与 τ。' +
      '「自信但答错」这个现象在 M13 会以「校准」的名字再出现一次。'
  });
})(window.AIPrinciples);
