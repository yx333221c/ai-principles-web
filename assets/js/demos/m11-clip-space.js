/* ==========================================================================
   m11-clip-space.js · 图文对齐的嵌入空间（DESIGN.md §4 M11 / §6.3）
   教学要点：
     ① 对比学习不是「标注」，而是「配对拉近、不配对推开」；删掉推开那一项，
        表示会「塌缩」——所有句子挤到同一个方向，谁也和谁分不开
     ② 零样本分类 = 把类别写成句子，再做检索
     ③ 温度 τ 决定「推得多狠」——与 M10 的采样温度是同一个数学角色
   几何设计：6 对图文按 60° 均匀分布在不同方向角上，图像在内圈、句子在外圈
   同一射线稍远处。于是「配对的余弦相似度 = cos(0°) = 1」而「相邻簇 =
   cos(60°) = 0.5」——这个 0.5 的落差正是让 softmax 读数清晰可读的原因
   （若把簇摆得方向相近，配对与近邻的余弦会同时接近 1，检索结果就糊成一片）。
   干扰句的两个终态（角度以中心为原点、屏幕 y 轴向下）：
     · 打开「推开不配对」→ DIS_T 落在两个空档方向 0° / 180°（半径 150）。
       默认查询「猫」在 −90°，与两个空档正好垂直：cos = ±0.063 → 干扰票 ≈0。
       几何上限：二维里只有 6 个簇，空档与最近的簇仍差 30°（cos = 0.866），
       所以「狗 / 沙滩 / 汽车 / 披萨」四档仍有残余（汽车 14.6% / 沙滩 18.9% / 披萨 22.5% / 狗 27.7%），而「狗」打开比关掉还高（27.7% vs 22.4%）——
       这是二维示意的天花板，不是对比学习无效。
     · 关掉它（等价于删掉 InfoNCE 的负样本项）→ 只剩吸引力，退化解是塌缩：
       8 个文本向量全部挤进 122.4°–125.2° 这条窄锥（CLUMP_*），半径逐档 40→166
       只为把标签摆开、不参与打分。方向几乎相同 → 余弦彼此相差不到 0.03 →
       八条读数全在 12.5% 上下：默认档「猫」配对句 11.0%、干扰项合计 27.7%、
       检索第一名变成「元素周期表」——六档查询无一命中。
     诚实性：塌缩只画在句子一侧（真实训练中图像一侧也会被一起拖过去）；
       这样画是为了让「读数变平」在画面上可读，不改变结论。
   诚实性：坐标是人工编排的二维示意，「训练」用插值模拟而非真实梯度下降。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* R_TXT 原为 140，与 R_IMG=118 在同一射线上只差 22px——两个标签都朝右展开，
     「沙滩」(到 +43) 与「一片海滩的照片」(从 +10 起) 落在同一小片区域，实测
     step=100 时叠印 9×8 与 19×8。拉开到 162（径向间距 44）后每一对在两个轴上
     至少有一个分离：
       cos>0（猫狗沙滩雪山…右侧三支）Δx=38.1，图像标签止于 +43、文本起于 +52 → x 分离
       |sin|>0（其余）Δy=44·|sin| ≥ 22 > 字高 12 → y 分离
     上限受右侧概率条（分隔线 x=458、条内文字 x=470）约束：最大 x_txt=225+162×0.866
     =365.3，标签从 375.3 起、止于 375.3+77=452.3 < 458，不侵入条区。 */
  const CX = 225, CY = 215, R_IMG = 118, R_TXT = 162;
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
  /* 干扰句的两个终态。半径不参与余弦（见画面底部说明），**只有方向角有用**：
     · DIS_T（打开「推开不配对」）：落在 6 个簇之间最大的两个空档 180° / 0°。
       二维里 6 个簇占满圆周，空档与最近的簇仍只差 30°（cos 0.866），
       所以只有与空档接近垂直的查询（猫 −90°、雪山 +90°）能把干扰票压到 ≈0，
       其余四档仍有残余（汽车 14.6% / 沙滩 18.9% / 披萨 22.5% / 狗 27.7%）——这是二维示意的天花板，写进 hint。
     · DIS_C（关掉它）：删掉负样本项只剩吸引力，退化解是**塌缩**——
       所有句子（含干扰句）挤进 122.4°–125.2° 的窄锥，半径逐档 40→166
       把标签推开，方向却几乎相同 → 八条读数全在 12.5% 上下。 */
  const ang2 = (deg) => deg * Math.PI / 180;
  const DIS_T = DISTRACT.map((t, i) => ({
    x: CX + 150 * Math.cos(ang2(i === 0 ? 180 : 0)),
    y: CY + 150 * Math.sin(ang2(i === 0 ? 180 : 0))
  }));
  /* 塌缩锥：以 120° 为基准，每个候选再加 (序号+N)×0.4° 的确定角差。
     这点散开是为了让 top-1 由几何决定、而不是由浮点噪声决定；
     八条余弦仍彼此相差不到 0.03，读数因此几乎相等。 */
  const CLUMP_RAY = 120, CLUMP_SPIN = 0.4;
  const CLUMP_R = [40, 58, 76, 94, 112, 130, 148, 166];
  const clump = (k) => ({
    x: CX + CLUMP_R[k] * Math.cos(ang2(CLUMP_RAY + (k + LABELS.length) * CLUMP_SPIN)),
    y: CY + CLUMP_R[k] * Math.sin(ang2(CLUMP_RAY + (k + LABELS.length) * CLUMP_SPIN))
  });
  const TXT_C = LABELS.map((p, i) => clump(i));
  const DIS_C = DISTRACT.map((t, i) => clump(N + i));

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
    /* step 是补间进度（网格散点 ↔ 极坐标收敛），不是构型选择：中途两个标签经过
       彼此是路径交叉的几何必然（实测 step=50 三处 CLASH，最小一处只重叠 5×2px），
       读者真正停下来读的是两端 —— 0% 的混乱态与 100% 的收敛态，两者都照常全检。
       声明给闸门 4 的 sweep（见 app.js runSweep 里 sweepTimeKeys 的注释）。 */
    sweepTimeKeys: ['step'],

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
        text: '左：6 张图（图像块）与 6 句话（圆点）的投影，虚线为配对关系' }));
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
        text: '绿点 = 与图配对的句子　红点 = 干扰句子（本不该靠近任何图）　图像块 = 图像　虚线 = 配对关系' }));
      svg.appendChild(DK.el('text', { x: 12, y: 424, class: 't-xs faint',
        text: '中心点 = 余弦相似度的原点：夹角越小越相似，与离中心多远无关（所以半径只为把标签摆开，不参与打分）' }));
    },

    draw(api) {
      const s = api.state;
      const t = s.step / 100;
      /* 开关 = 有没有负样本那一项。有 → 干扰句走向空档 DIS_T、句子走向各自簇；
         无 → 只剩吸引力，退化解是塌缩：句子与干扰句一起挤进同一条窄锥。
         两端都按 t 插值，所以步数 = 0 时两态完全重合（未训练谈不上推开不推开）。 */
      const push = s.push;

      const imgPos = TARGET.map((p, i) => lerp2({ x: START[i].ix, y: START[i].iy }, { x: p.ix, y: p.iy }, t));
      const txtPos = TARGET.map((p, i) => lerp2(
        { x: START[i].tx, y: START[i].ty },
        push ? { x: p.tx, y: p.ty } : TXT_C[i], t));
      const disPos = DIS_S.map((d, i) => lerp2(
        { x: d.x, y: d.y },
        push ? DIS_T[i] : DIS_C[i], t));

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
        /* 「但依然自信」只在第一名真的很高时成立：塌缩态第一名只有 14%，
           硬说「依然自信」就成了页面自己反驳自己，所以按读数分档。 */
        api._ro.set('hit', hit ? '命中'
          : (topP >= 0.5 ? '未命中（但依然自信）' : '未命中（八条读数挤在一起，谁也认不出）'));
        api._ro.set('p1', (topP * 100).toFixed(1) + '%');
        api._ro.set('distract', (disTotal * 100).toFixed(1) + '%');
      }
    },

    hint: '<strong>你能改什么：</strong>训练步数 0–100%（0 = 未训练，坐标按示意网格摆放、图与文交错混排；100 = 充分对齐）；查询图像（6 选 1，也可直接点图像块或按 Enter）；' +
      '温度 τ ∈ [0.02, 0.5]（对比学习的温度，与 M10 的采样温度<strong>数学角色相同</strong>：τ 小 = 只盯最像的负例，τ 大 = 逼模型把所有负例都推开）；' +
      '「推开不配对」开关（关掉 = 删掉 InfoNCE 的负样本项，只剩吸引力）。<br>' +
      '<strong>拨动它你会看到（先做实验一）：</strong>把训练步数拉回 0，逐条查询六张图。右侧概率条依然不低（默认档「猫」配对句 31.4%，最尖的条 64.9%），' +
      '可「是否命中配对」会告诉你第一名是「一片海滩的照片」——它在瞎猜。六张图里有三张点错。' +
      '<em>自信与正确是两件事，这个演示把它们的分离直接摊在你面前。</em>把步数拖到 100%，六张图全部命中，此时高置信才第一次有了内容。<br>' +
      '实验二：<strong>先把步数拖到 100%（步数为 0 时两态完全重合，这个开关在未训练时没有任何可观察的效果）</strong>，再用默认档「猫」关掉「推开不配对」。' +
      '所有句子——包括两句不相干的、也包括本来配对的——挤进同一条窄射线：这是只剩吸引力时的退化解（塌缩）。' +
      '（图像一侧仍画在原来的六条辐线上，只为方便对比；真实训练里它会被一起拖平。）' +
      '八条读数被压平到 11%–14%，' +
      '<strong>配对句从 98.4% 掉到 11.0%，干扰项合计抢走 27.7%，检索第一名变成「元素周期表」</strong>；逐档换查询，六张图<strong>全部点错</strong>。' +
      '只拉近、不推开学不出判别性。<br>' +
      '实验三：把开关打开、逐档换查询看残余干扰票——与空档垂直的两档（猫、雪山）压到 0.0%，汽车 14.6%、沙滩 18.9%、披萨 22.5% 仍有残余，' +
      '「狗」甚至升到 27.7%（比关掉时还高，但第一名仍是配对句）。原因在维度：二维平面上只有 6 个簇，<strong>没有任何方向能离所有簇都远</strong>' +
      '（空档与最近的簇仍差 30°，余弦 0.866）。这是<strong>二维示意的天花板</strong>，不是「推开没有用」——真实嵌入空间远不止二维，够让一个方向与所有配对簇都近似垂直。<br>' +
      '实验四：保持开关打开，τ 拉到 0.5 时条子整体变平（第一名从 98.4% 降到 46.8%），压到 0.02 时一票独大（100.0%），' +
      '但<strong>命中与否只由几何决定，τ 只改变你读到多少自信</strong>。' +
      '（数学理由：exp(cos/τ) 的排序与 τ 无关，softmax 是同一单调变换的像；把 τ 压到 0.02 再关掉开关，第一名照样是「元素周期表」。）<br>' +
      '<strong>对应机制段：</strong>第 ⑤ 步（配对拉近、不配对推开）、第 ⑥ 步（零样本分类就是检索）、公式 InfoNCE 的两项与 τ。' +
      '「自信但答错」这个现象在 M13 会以「校准」的名字再出现一次。'
  });
})(window.AIPrinciples);
