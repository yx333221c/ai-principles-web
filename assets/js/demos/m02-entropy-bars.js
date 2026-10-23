/* ==========================================================================
   m02-entropy-bars.js · 惊喜度与熵（DESIGN.md §4 表 M02「主可视化」）
   四格从左到右就是机制段那条算式：
     p → −log₂p → 按真实频率 q 加权平均 → 2^CE 还原成等效选项数
   数据诚实性：三个滑块给的是**未归一化票数**，画面显示「票数 ÷ 总票数」；
   全部是教学用的合成分布，不是任何真实模型的输出（画布顶部已注明）。
   「换一例」用 DK.rng(seed) 生成，同一 seed 永远给同一组票数（可复现）。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* 三个类别沿用机制段手算表格里的名字，读者可以逐格核数 */
  const CLS = ['咖啡', '茶', '水'];
  const COLOR = ['var(--c-accent)', 'var(--c-warn)', 'var(--c-ok)'];

  /* 「世界的真实分布 q」：one-hot 对应机制段第一遍手算，偏斜与均匀对应第二遍 */
  const QMODE = {
    match: { label: 'q = 模型自己（完全押中）', get: (p) => p.slice() },
    hotA: { label: '只出「咖啡」', get: () => [1, 0, 0] },
    hotB: { label: '只出「茶」', get: () => [0, 1, 0] },
    hotC: { label: '只出「水」', get: () => [0, 0, 1] },
    skewA: { label: '世界偏咖啡 0.8', get: () => [0.8, 0.1, 0.1] },
    skewB: { label: '世界偏茶 0.8', get: () => [0.1, 0.8, 0.1] },
    skewC: { label: '世界偏水 0.8', get: () => [0.1, 0.1, 0.8] },
    uniform: { label: '世界均匀 1/3', get: () => [1 / 3, 1 / 3, 1 / 3] }
  };
  const QKEYS = Object.keys(QMODE);

  /* 画布几何：逻辑坐标，DK 按容器等比缩放 */
  const BASE = 300, PXH = BASE - 56;          // 柱区可用高度 244
  const BITMAX = 8.4, PBB = PXH / BITMAX;     // 每比特换算成多少像素
  const COL = [[14, 148], [172, 140], [322, 140], [472, 218]];

  const surprise = (x) => (x > 0 ? -Math.log2(x) : 0);   // q=0 的格权重为 0，不贡献
  const norm = (s) => {
    const t = s.p1 + s.p2 + s.p3 || 1;
    return [s.p1 / t, s.p2 / t, s.p3 / t];
  };

  DK.define('m02-entropy-bars', {
    title: '惊喜度与熵：从份额到等效选项数',
    viewBox: [700, 400],
    state: { p1: 60, p2: 20, p3: 20, qmode: 'hotB', showq: true, sample: 1 },

    controls(holder, api) {
      api._wraps = [];
      /* 滑块是「票数」而不是概率：归一化这件事必须在 hint 里交代 */
      [1, 2, 3].forEach((i) => {
        const w = DK.range({
          key: 'p' + i, label: CLS[i - 1] + ' 票数',
          min: 1, max: 100, step: 1, value: api.state['p' + i],
          fmt: () => '→ p ' + DK.fmt(norm(api.state)[i - 1], 3),
          on(v) { api.state['p' + i] = v; api._repaint(); api.draw(); }
        });
        api._wraps.push(w);
        holder.appendChild(w);
      });
      holder.appendChild(DK.select({
        key: 'qmode', label: '世界的真实分布 q', value: api.state.qmode,
        options: QKEYS.map((k) => ({ value: k, label: QMODE[k].label })),
        on(v) { api.state.qmode = String(v); api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'showq', label: '叠上真实频率 q', value: api.state.showq,
        on(v) { api.state.showq = !!v; api.draw(); }
      }));
      const swapLabel = (n) => '换一例（第 ' + n + ' 例）';
      const swapBtn = DK.button(swapLabel(api.state.sample), () => {
        api.state.sample = api.state.sample % 999 + 1;
        const r = DK.rng(api.state.sample);
        api.state.p1 = 1 + Math.floor(r() * 99);
        api.state.p2 = 1 + Math.floor(r() * 99);
        api.state.p3 = 1 + Math.floor(r() * 99);
        swapBtn.textContent = swapLabel(api.state.sample);   // 让 seed 可见：同一例号必得同一组票数
        api._repaint(); api.draw();
      });
      /* DK.button 不带 key，这里手动挂上，reset 才能把例号与标签一起还原（契约 §2.2） */
      swapBtn._dkKey = 'sample';
      swapBtn._dkRestore = (st) => { swapBtn.textContent = swapLabel(st.sample); };
      holder.appendChild(swapBtn);

      const ro = DK.readout([
        ['ce', '交叉熵 H(q,p) / bit', ''],
        ['hq', '熵 H(q) 地板 / bit', ''],
        ['kl', 'KL(q‖p) / bit', ''],
        ['perp', '困惑度 2^CE / 选项', ''],
        ['hit', '等效蒙对率', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);

      /* 三个 output 一起刷新：改一个票数，另外两格的份额也跟着缩 */
      api._repaint = () => api._wraps.forEach((w) => w._dkRestore && w._dkRestore(api.state));
    },

    build(svg, api) {
      svg.appendChild(DK.el('text', { x: 12, y: 16, class: 't-xs faint',
        text: '示意数据：合成的概率分布，不是任何真实模型的输出 · 纵轴单位一律比特（以 2 为底取对数）' }));

      ['模型的份额 p', '每类的惊讶度 −log₂p', '按 q 加权后的平均', '困惑度还原成等效选项'].forEach((t, i) => {
        svg.appendChild(DK.el('text', { x: COL[i][0], y: 42, class: 't-sm muted', text: t }));
      });

      /* 比特刻度：虚线网格横穿第 2、3 格，刻度数字放在第 2 格左侧 */
      [2, 4, 6, 8].forEach((b) => {
        const y = BASE - b * PBB;
        svg.appendChild(DK.el('line', { x1: COL[1][0], y1: y, x2: COL[2][0] + COL[2][1], y2: y,
          class: 'grid', 'stroke-dasharray': '3 3' }));
        svg.appendChild(DK.el('text', { x: COL[1][0] - 4, y: y + 3, class: 't-xs faint',
          'text-anchor': 'end', text: String(b) }));
      });
      COL.forEach((c) => {
        svg.appendChild(DK.el('line', { x1: c[0], y1: BASE, x2: c[0] + c[1], y2: BASE, class: 'grid' }));
      });
      svg.appendChild(DK.el('text', { x: 12, y: 372, class: 't-xs faint',
        text: '实色柱 = 模型的份额 p ｜ 虚线框 = 世界的真实频率 q ｜ 第 3 格堆积柱的每一段 = q × 该类惊讶度' }));
      svg.appendChild(DK.el('text', { x: 12, y: 388, class: 't-xs faint',
        text: '第 4 格的柱子根数就是困惑度：它把比特换回「几个等可能选项」，每根一模一样高。' }));

      /* --- 第 1 格：p 柱 + q 虚线框（节点建一次，draw 只改属性） --- */
      const gP = DK.el('g');
      api.barP = []; api.ghostP = []; api.valP = [];
      const w1 = 34, gap1 = (COL[0][1] - 3 * w1) / 4;
      for (let i = 0; i < 3; i++) {
        const x = COL[0][0] + gap1 + i * (w1 + gap1);
        api.barP[i] = DK.el('rect', { x: x, y: BASE, width: w1, height: 0, rx: 3, fill: COLOR[i] });
        api.ghostP[i] = DK.el('rect', { x: x - 3, y: BASE, width: w1 + 6, height: 0, rx: 3,
          fill: 'none', stroke: 'var(--c-line-strong)', 'stroke-width': 1.4, 'stroke-dasharray': '3 2' });
        api.valP[i] = DK.el('text', { x: x + w1 / 2, y: BASE, class: 't-xs', 'text-anchor': 'middle' });
        gP.appendChild(api.barP[i]); gP.appendChild(api.ghostP[i]); gP.appendChild(api.valP[i]);
        svg.appendChild(DK.el('text', { x: x + w1 / 2, y: BASE + 14, class: 't-sm',
          'text-anchor': 'middle', text: CLS[i] }));
      }
      svg.appendChild(gP);

      /* --- 第 2 格：惊讶度柱 --- */
      const gS = DK.el('g');
      api.barS = []; api.valS = [];
      const w2 = 30, gap2 = (COL[1][1] - 3 * w2) / 4;
      for (let i = 0; i < 3; i++) {
        const x = COL[1][0] + gap2 + i * (w2 + gap2);
        api.barS[i] = DK.el('rect', { x: x, y: BASE, width: w2, height: 0, rx: 3, fill: COLOR[i] });
        api.valS[i] = DK.el('text', { x: x + w2 / 2, y: BASE, class: 't-xs', 'text-anchor': 'middle' });
        gS.appendChild(api.barS[i]); gS.appendChild(api.valS[i]);
        svg.appendChild(DK.el('text', { x: x + w2 / 2, y: BASE + 14, class: 't-sm',
          'text-anchor': 'middle', text: CLS[i] }));
      }
      svg.appendChild(gS);

      /* --- 第 3 格：左=熵（地板），右=交叉熵（堆积），中间量出 KL --- */
      const cxA = COL[2][0] + 8, cxB = COL[2][0] + 78, cw = 44;
      api.floorRect = DK.el('rect', { x: cxA, y: BASE, width: cw, height: 0, rx: 2,
        fill: 'var(--c-bg-sunken)', stroke: 'var(--c-line-strong)', 'stroke-dasharray': '4 3' });
      api.segs = [];
      const gC = DK.el('g');
      gC.appendChild(api.floorRect);
      for (let i = 0; i < 3; i++) {
        api.segs[i] = DK.el('rect', { x: cxB, y: BASE, width: cw, height: 0, fill: COLOR[i],
          stroke: 'var(--c-bg-elev)', 'stroke-width': 1 });
        gC.appendChild(api.segs[i]);
      }
      api.klLine = DK.el('line', { x1: cxA + cw, y1: BASE, x2: cxB, y2: BASE,
        stroke: 'var(--c-err)', 'stroke-width': 1.4, 'stroke-dasharray': '2 2' });
      api.ceText = DK.el('text', { x: cxB + cw / 2, y: BASE, class: 't-sm accent', 'text-anchor': 'middle' });
      gC.appendChild(api.klLine); gC.appendChild(api.ceText);
      svg.appendChild(gC);
      svg.appendChild(DK.el('text', { x: cxA + cw / 2, y: BASE + 14, class: 't-xs muted',
        'text-anchor': 'middle', text: '熵 H(q)' }));
      svg.appendChild(DK.el('text', { x: cxB + cw / 2, y: BASE + 14, class: 't-xs muted',
        'text-anchor': 'middle', text: '交叉熵' }));
      api.klText = DK.el('text', { x: COL[2][0], y: BASE + 30, class: 't-xs bad', text: '' });

      /* --- 第 4 格：等效选项数（根数随困惑度变，每次先清空该分组） --- */
      api.gD = DK.el('g');
      svg.appendChild(api.gD);
    },

    draw(api) {
      const s = api.state;
      const p = norm(s);
      const q = QMODE[s.qmode] ? QMODE[s.qmode].get(p) : QMODE.match.get(p);
      const sur = p.map(surprise);
      const hq = q.reduce((a, v, i) => a + (v > 0 ? v * surprise(v) : 0), 0);
      const ce = q.reduce((a, v, i) => a + v * sur[i], 0);
      const kl = Math.max(0, ce - hq);
      const perp = Math.pow(2, ce);

      /* 第 1 格 */
      for (let i = 0; i < 3; i++) {
        const hp = p[i] * PXH, hq2 = q[i] * PXH;
        api.barP[i].setAttribute('y', BASE - hp);
        api.barP[i].setAttribute('height', hp);
        api.valP[i].setAttribute('y', BASE - hp - 4);
        api.valP[i].textContent = DK.fmt(p[i], 2);
        api.ghostP[i].setAttribute('y', BASE - hq2);
        api.ghostP[i].setAttribute('height', hq2);
        api.ghostP[i].setAttribute('visibility', s.showq ? 'visible' : 'hidden');
      }
      /* 第 2 格：真实频率高的那几格描边并加亮——它们才是罚单的主要来源 */
      for (let i = 0; i < 3; i++) {
        const hs = Math.min(PXH, sur[i] * PBB);
        api.barS[i].setAttribute('y', BASE - hs);
        api.barS[i].setAttribute('height', hs);
        api.barS[i].setAttribute('stroke', q[i] > 0.001 ? 'var(--c-fg)' : 'none');
        api.barS[i].setAttribute('stroke-width', q[i] > 0.001 ? 1.6 : 0);
        api.barS[i].setAttribute('opacity', q[i] > 0.001 ? 1 : 0.4);
        api.valS[i].setAttribute('y', BASE - hs - 4);
        api.valS[i].textContent = DK.fmt(sur[i], 2);
      }
      /* 第 3 格：堆积柱 = 交叉熵；虚线柱 = 熵（任何模型都压不下去的地板） */
      let acc = 0;
      for (let i = 0; i < 3; i++) {
        const hh = q[i] * sur[i] * PBB;
        api.segs[i].setAttribute('y', BASE - acc - hh);
        api.segs[i].setAttribute('height', hh);
        acc += hh;
      }
      const hFloor = s.showq ? Math.min(PXH, hq * PBB) : 0;
      api.floorRect.setAttribute('y', BASE - hFloor);
      api.floorRect.setAttribute('height', hFloor);
      const yCe = BASE - Math.min(PXH, ce * PBB);
      api.klLine.setAttribute('y1', hFloor < 1 ? BASE - 2 : BASE - hFloor);
      api.klLine.setAttribute('y2', yCe);
      api.ceText.setAttribute('y', yCe - 6);
      api.ceText.textContent = DK.fmt(ce, 2) + ' bit';
      api.klText.textContent = s.showq
        ? '红线段 = KL(q‖p) = ' + DK.fmt(kl, 2) + ' bit（多花的部分，永远 ≥ 0）'
        : '关掉时只报交叉熵；打开才能看见它比地板 H(q) 高出一段 KL';

      /* 第 4 格：把交叉熵还原成「几根一样高的柱」 */
      const g = api.gD;
      while (g.firstChild) g.removeChild(g.firstChild);
      const shown = Math.min(Math.max(1, Math.round(perp)), 16);
      const bw = Math.max(4, (COL[3][1] - 6 - (shown - 1) * 4) / shown);
      const hEq = Math.min(PXH, ce * PBB);
      for (let i = 0; i < shown; i++) {
        g.appendChild(DK.el('rect', { x: COL[3][0] + 3 + i * (bw + 4), y: BASE - hEq,
          width: bw, height: hEq, rx: 2, fill: 'var(--c-heat-2)' }));
      }
      g.appendChild(DK.el('text', { x: COL[3][0], y: BASE - hEq - 10, class: 't-sm accent',
        text: '困惑度 ' + DK.fmt(perp, perp >= 100 ? 0 : 2) + ' 个选项'
          + (perp > 16 ? '（只画前 16 根）' : '') }));
      g.appendChild(DK.el('text', { x: COL[3][0], y: BASE + 14, class: 't-xs muted',
        text: '每根 = 1/' + DK.fmt(perp, 1) + '，惊讶度 ' + DK.fmt(ce, 2) + ' bit' }));
      g.appendChild(DK.el('text', { x: COL[3][0], y: BASE + 30, class: 't-xs faint',
        text: '蒙对率 ' + DK.fmt(100 / perp, 1) + '%（是意外的换算，不是准确率）' }));

      /* 读数条 */
      if (api._ro) {
        api._ro.set('ce', DK.fmt(ce, 2));
        api._ro.set('hq', DK.fmt(hq, 2));
        api._ro.set('kl', DK.fmt(kl, 2));
        api._ro.set('perp', DK.fmt(perp, perp >= 100 ? 0 : 2));
        api._ro.set('hit', DK.fmt(100 / perp, 1) + '%');
      }
    },

    hint: '<strong>你能改什么：</strong>三个「票数」滑块，各自 ∈ [1, 100] 的整数，物理含义是「模型给这一类投了多少票」。' +
      '<strong>它们不是概率</strong>：画面显示的 p 是「这一格票数 ÷ 三格总票数」，所以三个 p 之和永远是 1 —— ' +
      '你把「咖啡」从 20 拉到 60，另外两格的 p 会自动缩水，这不是故障，是归一化（机制段第 ① 步）。' +
      '「世界的真实分布 q」下拉框 ∈ 8 种设定：q = 模型自己 ／ 只出某一类（one-hot，就是手算第一遍）／ ' +
      '「世界偏向某一类 0.8 ／ 世界均匀 1/3；「叠上真实频率 q」开关控制虚线框与地板柱；' +
      '「换一例」按钮上的<strong>例号就是随机种子</strong>（∈ [1, 999]，循环递增）：它用 DK.rng(例号) 取三组票数，' +
      '所以同一个例号在任何机器、任何时候都给出同一组数，报出例号就等于报出了这组数（教学可复现）。「重置」回到第 1 例。<br>' +
      '<strong>拨动它你会看到：</strong>① 三格票数拉成一样高时，第 4 格正好出现 3 根等效柱（困惑度 3.00）；' +
      '② 把真实标签那一格的票数压到 1，它在第 2 格的惊讶度柱会猛蹿——越自信的错，罚得越重；' +
      '③ q 选「q = 模型自己」时 KL = 0，虚线地板柱与堆积柱等高，换成其他任何 q 之后，堆积柱只在地板柱之上多加一段，那一段就是 KL，永不为负；' +
      '④ q 选「只出某一类」时地板柱塌成 0，交叉熵全部是 KL——因为必然发生的事没有自身的意外；' +
      '⑤ 把该类的票数一路拉高，困惑度会从很大平滑降到 1.00（等于只剩一个选项），而蒙对率同步升到 100%。<br>' +
      '<strong>对应机制段：</strong>第 ① 步（输出的是分布不是答案）、第 ② 步（惊讶度 = −log₂p）、' +
      '第 ③ 步（按频率加权平均 = 熵，即地板价）、第 ④ 步（交叉熵 = 熵 + KL）、第 ⑥ 步（困惑度 = 2^CE = 等效均匀选项数）。'
  });
})(window.AIPrinciples);
