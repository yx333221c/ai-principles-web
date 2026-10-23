/* ==========================================================================
   m05-microcalc.js · 旗舰演示：微积分计算器（DESIGN.md §6.4 D-M05 / §6.2 档 C）
   一个**固定**的 3-1-1 计算图：3 个输入 → 加权求和 z₁ → 激活 a₁ → z₂ → 输出 y → 损失 L。
   读者亲手给权重与一个输入，先看值怎么一路算到损失（前向 6 帧），
   再看梯度按拓扑逆序一格一格倒着点亮（反向 6 帧），
   把「责任分摊」显式成可以逐个点开的数字，而不是公式。

   诚实性声明：图上每个数都是**当前这个小网络此刻真实算出来的**（不是预录的示范值），
   但训练任务（把输出推向 t=+1）与输入取值是**教学用的合成示意**，
   不是任何真实模型或数据集的输出——画布顶部第 1 行与 hint 都写明了这一点。

   契约（docs/authoring-contract.md §2.2 / DESIGN.md §6.3）：
     mount / update / reset / destroy / pause / resume / frames{total, seek}
   动画只走 api.animate(fn)，因此 prefers-reduced-motion 下自动降级（见 play()）。
   颜色只用 var(--c-…) 与 demo-svg 已有类，不硬编码；draw() 不新建 DOM。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* ---------------- 固定量：读者不许改，改了这张图就不成立了 ---------------- */
  const X2 = 0.6, X3 = -1.1;          // 两个固定输入（画在节点里）
  const V1 = 1.0, B2 = -0.5;          // 输出层的固定权重与偏置
  const TARGET = 1.0;                 // 训练目标
  const LR = 0.5;                     // 学习率：只用于第 13 帧「下一步该拧到哪」（M04）
  const DOM = [-3, 3];                // 滑块与两条曲线共用同一区间，避免误导
  const YLO = -2, YHI = 3;            // A 面板纵轴范围

  /* ---------------- 激活函数：值和局部导数都给出来，才能讲「闸门」 ---------------- */
  const ACTS = {
    relu: {
      name: 'ReLU', f: function (z) { return z > 0 ? z : 0; },
      d: function (z) { return z > 0 ? 1 : 0; },
      note: 'φ′ 只有 1 或 0：加权输入为负 → 这一环把梯度整条掐断，下游权重一起归零（第 ④ 步「死亡」）'
    },
    sigmoid: {
      name: 'Sigmoid', f: function (z) { return 1 / (1 + Math.exp(-z)); },
      d: function (z) { const s = 1 / (1 + Math.exp(-z)); return s * (1 - s); },
      note: '两层 Sigmoid 把 y 锁在 0.38–0.62：够不到虚线 t=1，损失降不到 0；且 φ′ ≤ 0.25，连乘即衰减（第 ④ 步「饱和」）'
    },
    tanh: {
      name: 'Tanh', f: function (z) { return Math.tanh(z); },
      d: function (z) { const t = Math.tanh(z); return 1 - t * t; },
      note: 'Tanh 以 0 为中心、范围 −1…1，但两端同样躺平：|z| 一大 φ′→0，梯度在链上被逐环削小（第 ④ 步「饱和」）'
    },
    none: {
      name: '无（纯线性）', f: function (z) { return z; }, d: function () { return 1; },
      note: 'φ′ ≡ 1：链上乘不进任何非 1 的因子，于是 z₁ 与 z₂ 的梯度数字完全相同；A、B 两图都塌成直线（第 ②③ 步）'
    }
  };
  const ACT_ORDER = ['relu', 'sigmoid', 'tanh', 'none'];

  /* ---------------- 一次前向 + 一次反向（全部现算） ---------------- */
  function compute(p) {
    const A = ACTS[p.act] || ACTS.relu;
    const z1 = p.w1 * p.x1 + p.w2 * X2 + p.w3 * X3;
    const a1 = A.f(z1);
    const z2 = V1 * a1 + B2;
    const y = A.f(z2);
    const L = 0.5 * (y - TARGET) * (y - TARGET);
    /* 反向：每个节点只做一种运算 —— 「上游梯度 × 本节点局部导数」 */
    const gy = y - TARGET;                    // ∂L/∂y
    const gz2 = gy * A.d(z2);                 // ∂L/∂z₂
    const ga1 = gz2 * V1;                     // ∂L/∂a₁（局部导数就是固定的 v₁）
    const gz1 = ga1 * A.d(z1);                // ∂L/∂z₁
    return {
      z1: z1, a1: a1, z2: z2, y: y, L: L, A: A,
      gy: gy, gz2: gz2, ga1: ga1, gz1: gz1,
      gw1: gz1 * p.x1, gw2: gz1 * X2, gw3: gz1 * X3, gx1: gz1 * p.w1,
      d1: A.d(z1), d2: A.d(z2)
    };
  }

  /* ---------------- 计算图的形状（build 建一次，draw 只改属性） ---------------- */
  /* fw = 该节点的值在第几帧出现；bw = 梯度在第几帧倒着回到它 */
  const NODE_DEF = [
    { k: 'x1', label: 'x₁ 输入', x: 12, y: 40, w: 94, h: 40, fw: 1, bw: 12, g: 'gx1', val: 'x1', kind: 'in' },
    { k: 'x2', label: 'x₂ 输入', x: 12, y: 84, w: 94, h: 40, fw: 1, bw: -1, val: 'fix2', kind: 'in' },
    { k: 'x3', label: 'x₃ 输入', x: 12, y: 128, w: 94, h: 40, fw: 1, bw: -1, val: 'fix3', kind: 'in' },
    { k: 'w1', label: 'w₁ 权重', x: 12, y: 176, w: 94, h: 40, fw: 1, bw: 11, g: 'gw1', val: 'w1', kind: 'p' },
    { k: 'w2', label: 'w₂ 权重', x: 12, y: 220, w: 94, h: 40, fw: 1, bw: 11, g: 'gw2', val: 'w2', kind: 'p' },
    { k: 'w3', label: 'w₃ 权重', x: 12, y: 264, w: 94, h: 40, fw: 1, bw: 11, g: 'gw3', val: 'w3', kind: 'p' },
    { k: 'z1', label: 'z₁ 加权和', x: 176, y: 126, w: 88, h: 44, fw: 2, bw: 11, g: 'gz1', val: 'z1', kind: 'mid' },
    { k: 'a1', label: 'a₁ 激活 φ', x: 292, y: 126, w: 88, h: 44, fw: 3, bw: 10, g: 'ga1', val: 'a1', kind: 'mid' },
    { k: 'z2', label: 'z₂ 加权和', x: 408, y: 126, w: 88, h: 44, fw: 4, bw: 9, g: 'gz2', val: 'z2', kind: 'mid' },
    { k: 'y', label: 'y 输出 φ', x: 524, y: 126, w: 88, h: 44, fw: 5, bw: 8, g: 'gy', val: 'y', kind: 'mid' },
    { k: 'L', label: 'L 损失', x: 524, y: 206, w: 88, h: 44, fw: 6, bw: 7, g: 'one', val: 'L', kind: 'loss' },
    { k: 't', label: 't 目标', x: 408, y: 212, w: 88, h: 32, fw: 0, bw: -1, val: 'fixT', kind: 'fix' }
  ];
  /* 每条边的编号与它所代表的那次局部求导 */
  const EDGE_DEF = [
    { a: 'x1', b: 'z1', fw: 2, bw: 12, lbl: '×w₁' },
    { a: 'x2', b: 'z1', fw: 2, bw: 12, lbl: '×w₂' },
    { a: 'x3', b: 'z1', fw: 2, bw: 12, lbl: '×w₃' },
    { a: 'w1', b: 'z1', fw: 2, bw: 11, lbl: '×x₁' },
    { a: 'w2', b: 'z1', fw: 2, bw: 11, lbl: '×x₂' },
    { a: 'w3', b: 'z1', fw: 2, bw: 11, lbl: '×x₃' },
    { a: 'z1', b: 'a1', fw: 3, bw: 10, lbl: 'φ′(z₁)' },
    { a: 'a1', b: 'z2', fw: 4, bw: 9, lbl: '×v₁' },
    { a: 'z2', b: 'y', fw: 5, bw: 8, lbl: 'φ′(z₂)' },
    { a: 'y', b: 'L', fw: 6, bw: 7, lbl: '' },
    { a: 't', b: 'L', fw: 6, bw: 7, lbl: '' }
  ];
  /* 帧号 → 这一帧只在做的一件事 */
  const FRAME_TXT = [
    '还没开始。下面用「前向计算 / 反向传播」两个按钮，或用 ◀ ▶ 一帧一帧走。',
    '前向 ①：三个输入 x₁ x₂ x₃ 与三个权重 w₁ w₂ w₃ 就位——它们是这张图的全部源头。',
    '前向 ②：z₁ = w₁x₁ + w₂x₂ + w₃x₃。一次加权求和，六个因子汇成一个数。',
    '前向 ③：a₁ = φ(z₁)，第一个非线性开关。z₁ → a₁ 这一步叫「折弯」。',
    '前向 ④：z₂ = v₁·a₁ + b₂（v₁=1.0、b₂=−0.5 固定），第二个线性环节。',
    '前向 ⑤：y = φ(z₂)，第二个开关。到这里预测值已经出来了。',
    '前向 ⑥：L = ½(y − t)²，跟目标 t=1 比一比。前向结束，反向要从这里起步。',
    '反向 ⑦：∂L/∂L = 1。损失对自己当然完全负责——整条链的起点。',
    '反向 ⑧：∂L/∂y = y − t。一次减法，还不需要乘法。',
    '反向 ⑨：∂L/∂z₂ = ∂L/∂y × φ′(z₂)。第一次「乘上本节点的局部导数」。',
    '反向 ⑩：∂L/∂a₁ = ∂L/∂z₂ × v₁。这里的局部导数就是那个固定权重 v₁。',
    '反向 ⑪：∂L/∂z₁ = ∂L/∂a₁ × φ′(z₁)；顺手得到 ∂L/∂w₁ = ∂L/∂z₁ × x₁（w₂ w₃ 同理）。',
    '反向 ⑫：∂L/∂x₁ = ∂L/∂z₁ × w₁。输入也收到自己的梯度——梯度下降用不到它，链式法则一视同仁。',
    '更新 ⑬：w ← w − η·∂L/∂w（η=0.5，M04）。B 面板那个空心圈就是 w₁ 建议拧到的位置；下一步是重新前向。'
  ];
  const TOTAL = 13;

  DK.define('m05-microcalc', {
    title: '微积分计算器：手搭 3-1-1 网络，看梯度一格一格倒着流',
    viewBox: [700, 480],
    state: { w1: 1.2, w2: 0.5, w3: -0.8, x1: 1.0, act: 'relu', f: 6 },

    /* ---------------- 控件（每个都挂 key，reset 才还原得了） ---------------- */
    controls: function (holder, api) {
      const weight = function (key, label) {
        return DK.range({
          key: key, label: label, min: DOM[0], max: DOM[1], step: 0.05,
          value: api.state[key], fmt: function (v) { return DK.fmt(v, 2); },
          on: function (v) { api.state[key] = v; api.draw(); }
        });
      };
      holder.appendChild(weight('w1', '权重 w₁（乘 x₁）∈ [−3,3]'));
      holder.appendChild(weight('w2', '权重 w₂（乘 x₂）∈ [−3,3]'));
      holder.appendChild(weight('w3', '权重 w₃（乘 x₃）∈ [−3,3]'));
      holder.appendChild(weight('x1', '输入 x₁ ∈ [−3,3]'));
      holder.appendChild(DK.select({
        key: 'act', label: '激活函数 φ（两处同一个）', value: api.state.act,
        options: ACT_ORDER.map(function (k) { return { value: k, label: ACTS[k].name }; }),
        on: function (v) { api.state.act = String(v); api.draw(); }
      }));
      holder.appendChild(DK.button('前向计算', function () { api.state.f = 0; play(api, 6); }));
      holder.appendChild(DK.button('反向传播', function () { play(api, TOTAL); }));
      holder.appendChild(DK.button('▶ 逐帧播放（全流程）', function () { api.state.f = 0; play(api, TOTAL); }));
      holder.appendChild(DK.button('◀ 上一帧', function () {
        api.playing = false; api.state.f = DK.clamp(api.state.f - 1, 0, TOTAL); api.draw(); }));
      holder.appendChild(DK.button('下一帧 ▶', function () {
        api.playing = false; api.state.f = DK.clamp(api.state.f + 1, 0, TOTAL); api.draw(); }));

      const ro = DK.readout([
        ['act', '激活函数', '—'],
        ['y', '输出 y', '—'],
        ['L', '损失 L', '—'],
        ['gw1', '∂L/∂w₁', '—'],
        ['gw2', '∂L/∂w₂', '—'],
        ['gw3', '∂L/∂w₃', '—'],
        ['next', 'w₁ 下一步', '—'],
        ['frame', '帧', '—']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    /* ---------------- 静态元素：只建一次 ---------------- */
    build: function (svg, api) {
      api.nodes = {};
      api.edges = [];
      api.panels = {};

      const defs = DK.el('defs');
      defs.appendChild(DK.el('marker', {
        id: 'dkm05-fwd', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto'
      }, [DK.el('path', { d: 'M0 0 L8 4 L0 8 z', fill: 'var(--c-fg-muted)' })]));
      defs.appendChild(DK.el('marker', {
        id: 'dkm05-bwd', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto'
      }, [DK.el('path', { d: 'M0 0 L8 4 L0 8 z', fill: 'var(--c-warn)' })]));
      svg.appendChild(defs);

      /* 顶部只有 y=14 / y=27 两行空间（节点从 y=40 起），且 viewBox 宽 700：
         每行必须短到 57 个中文字以内，否则会被静默裁掉。 */
      svg.appendChild(DK.el('text', {
        x: 12, y: 14, class: 't-sm muted',
        text: '示意数据：3-1-1 小网络；数字按你的滑块现算，非真实模型输出。'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 27, class: 't-xs faint',
        text: '格内上=前向值 下=梯度 ∂L/∂node；色深=|梯度|；橙虚线=梯度正穿过该边'
      }));

      /* 边（先画，节点盖住线端） */
      const gEdges = DK.el('g');
      EDGE_DEF.forEach(function (e) {
        const pt = anchor(nodeById(e.a), nodeById(e.b));
        const line = DK.el('line', {
          x1: pt.x1, y1: pt.y1, x2: pt.x2, y2: pt.y2,
          stroke: 'var(--c-line-strong)', 'stroke-width': 1.4, opacity: 0.25
        });
        gEdges.appendChild(line);
        let lbl = null;
        if (e.lbl) {
          lbl = DK.el('text', {
            x: (pt.x1 + pt.x2) / 2, y: (pt.y1 + pt.y2) / 2 - 4,
            class: 't-xs faint', 'text-anchor': 'middle', opacity: 0.3, text: e.lbl
          });
          gEdges.appendChild(lbl);
        }
        api.edges.push({ def: e, line: line, lbl: lbl });
      });
      svg.appendChild(gEdges);

      /* 节点：标签 / 值 / 梯度，三行文本一次建好 */
      NODE_DEF.forEach(function (n) {
        const g = DK.el('g');
        const rect = DK.el('rect', {
          x: n.x, y: n.y, width: n.w, height: n.h, rx: 5, class: 'box', 'stroke-width': 1.3
        });
        if (n.kind === 'p') rect.style.fill = 'var(--c-bg-sunken)';
        if (n.kind === 'fix') rect.style.fill = 'var(--c-bg-sunken)';
        g.appendChild(rect);
        const lab = DK.el('text', { x: n.x + 5, y: n.y + 12, class: 't-xs muted', text: n.label });
        const val = DK.el('text', { x: n.x + 5, y: n.y + 25, class: 't-sm', text: '' });
        const grad = DK.el('text', { x: n.x + 5, y: n.y + 36, class: 't-xs faint', text: '' });
        g.appendChild(lab); g.appendChild(val); g.appendChild(grad);
        svg.appendChild(g);
        api.nodes[n.k] = { def: n, g: g, rect: rect, lab: lab, val: val, grad: grad };
      });

      /* 帧说明 + 当前激活函数的一句话注记 */
      api.cap = DK.el('text', { x: 12, y: 322, class: 't-sm', text: '' });
      svg.appendChild(api.cap);
      api.note = DK.el('text', { x: 12, y: 336, class: 't-xs warm', text: '' });
      svg.appendChild(api.note);

      /* 两个小面板 */
      const PA = { x: 12, y: 350, w: 322, h: 82 };
      const PB = { x: 366, y: 350, w: 322, h: 82 };
      api.PA = PA; api.PB = PB;
      defs.appendChild(DK.el('clipPath', { id: 'dkm05-clipA' },
        [DK.el('rect', { x: PA.x + 30, y: PA.y, width: PA.w - 34, height: PA.h })]));
      defs.appendChild(DK.el('clipPath', { id: 'dkm05-clipB' },
        [DK.el('rect', { x: PB.x + 34, y: PB.y - 2, width: PB.w - 38, height: PA.h + 4 })]));
      buildPanel(svg, api, PA, 'A', 'A 响应曲线 y(x₁)：折弯 = 非线性买到的东西',
        '输入 x₁ →', 30, 'clipA');
      buildPanel(svg, api, PB, 'B', 'B 梯度曲线 ∂L/∂w₁(w₁)：正负 = 该往哪拧',
        '权重 w₁ →', 34, 'clipB');

      svg.appendChild(DK.el('text', {
        x: 12, y: 476, class: 't-xs faint',
        text: '两条曲线由本演示实时扫描：A 让 x₁ 扫过 −3…+3（其余不变），B 让 w₁ 扫过 −3…+3（其余不变）；B 的纵轴按当前曲线自动缩放。'
      }));
    },

    /* ---------------- 每次状态变化：只改属性与文本，不新建 DOM ---------------- */
    draw: function (api) {
      const s = api.state;
      const p = { w1: s.w1, w2: s.w2, w3: s.w3, x1: s.x1, act: s.act };
      const c = compute(p);
      const f = s.f;
      /* 标尺：本轮最大的 |梯度|（∂L/∂L = 1 也计入，标尺不会因数值微小而失真） */
      const gmax = Math.max(1, Math.abs(c.gy), Math.abs(c.gz2), Math.abs(c.ga1),
        Math.abs(c.gz1), Math.abs(c.gw1), Math.abs(c.gw2), Math.abs(c.gw3), Math.abs(c.gx1));

      NODE_DEF.forEach(function (n) {
        const nd = api.nodes[n.k];
        const shown = f >= n.fw;
        nd.g.style.opacity = shown ? 1 : 0.45;
        /* 值那一行 */
        if (!shown && n.fw >= 2) {
          nd.val.textContent = '（还没算到）';
        } else if (n.val === 'x1') nd.val.textContent = 'x₁ = ' + DK.fmt(s.x1, 2);
        else if (n.val === 'w1' || n.val === 'w2' || n.val === 'w3') nd.val.textContent = n.k + ' = ' + DK.fmt(s[n.val], 2);
        else if (n.val === 'fix2') nd.val.textContent = 'x₂ = ' + DK.fmt(X2, 2);
        else if (n.val === 'fix3') nd.val.textContent = 'x₃ = ' + DK.fmt(X3, 2);
        else if (n.val === 'fixT') nd.val.textContent = 't = ' + DK.fmt(TARGET, 1);
        else nd.val.textContent = n.val + ' = ' + DK.fmt(c[n.val], 3);
        /* 梯度那一行 + 热力底色 */
        if (n.bw > 0 && f >= n.bw) {
          const g = n.g === 'one' ? 1 : c[n.g];
          nd.grad.textContent = '∂L/∂' + n.k + ' ' + DK.fmt(g, 3);
          nd.grad.setAttribute('class', 't-xs warm');
          nd.rect.style.fill = DK.heatFill(Math.abs(g) / gmax);
          nd.rect.style.stroke = 'var(--c-warn)';
        } else {
          nd.grad.textContent = (n.bw > 0 && shown) ? '（梯度还没回来）' : '';
          nd.grad.setAttribute('class', 't-xs faint');
          nd.rect.style.fill = (n.kind === 'p' || n.kind === 'fix') ? 'var(--c-bg-sunken)' : '';
          nd.rect.style.stroke = '';
        }
      });

      /* 边：前向亮起 → 反向时改成橙色虚线并倒着指 */
      api.edges.forEach(function (e) {
        const fwOn = f >= e.def.fw, bwd = f >= e.def.bw;
        e.line.style.opacity = fwOn ? 1 : 0.22;
        e.line.setAttribute('stroke', bwd ? 'var(--c-warn)' : 'var(--c-line-strong)');
        e.line.setAttribute('stroke-width', bwd ? 2 : 1.4);
        e.line.setAttribute('stroke-dasharray', bwd ? '5 4' : 'none');
        e.line.setAttribute('marker-end', bwd ? 'url(#dkm05-bwd)' : 'url(#dkm05-fwd)');
        if (e.lbl) {
          e.lbl.style.opacity = bwd ? 1 : (fwOn ? 0.65 : 0.25);
          e.lbl.setAttribute('class', bwd ? 't-xs warm' : 't-xs faint');
        }
      });

      api.cap.textContent = '第 ' + f + ' / ' + TOTAL + ' 帧 · ' + FRAME_TXT[f];
      api.note.textContent = '当前 φ = ' + ACTS[s.act].name + '：' + ACTS[s.act].note;

      /* --- A 面板：输出 y 随输入 x₁ 的形状 --- */
      const PA = api.PA, ia = api.panels.A;
      const mapA = function (v) { return PA.y + PA.h - (DK.clamp(v, YLO - 1, YHI + 1) - YLO) / (YHI - YLO) * PA.h; };
      const xaOf = function (v) { return PA.x + 30 + (v - DOM[0]) / (DOM[1] - DOM[0]) * (PA.w - 34); };
      let dA = '', lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= 72; i++) {
        const xv = DOM[0] + (DOM[1] - DOM[0]) * i / 72;
        const yv = compute({ w1: s.w1, w2: s.w2, w3: s.w3, x1: xv, act: s.act }).y;
        if (yv < lo) lo = yv;
        if (yv > hi) hi = yv;
        dA += (i ? 'L' : 'M') + xaOf(xv).toFixed(1) + ',' + mapA(yv).toFixed(1);
      }
      ia.curve.setAttribute('d', dA);
      ia.zero.setAttribute('y1', mapA(0)); ia.zero.setAttribute('y2', mapA(0));
      ia.tline.setAttribute('y1', mapA(TARGET)); ia.tline.setAttribute('y2', mapA(TARGET));
      ia.head.setAttribute('x1', xaOf(s.x1)); ia.head.setAttribute('x2', xaOf(s.x1));
      ia.dot.setAttribute('cx', xaOf(s.x1)); ia.dot.setAttribute('cy', mapA(c.y));
      ia.dot.style.opacity = f >= 5 ? 1 : 0.25;
      ia.sub.textContent = 'y 值域：' + DK.fmt(isFinite(lo) ? lo : 0, 2) + ' … ' +
        DK.fmt(isFinite(hi) ? hi : 0, 2) + '（虚线 = 目标 t=1）';
      ia.scale.textContent = '折点 = φ′ 跳变或趋 0 的地方（第 ③⑤ 步）';

      /* --- B 面板：∂L/∂w₁ 随 w₁ 的形状（自动纵向缩放） --- */
      const PB = api.PB, ib = api.panels.B;
      let m = 0.05;
      const gs = [];
      for (let i = 0; i <= 72; i++) {
        const wv = DOM[0] + (DOM[1] - DOM[0]) * i / 72;
        const gv = compute({ w1: wv, w2: s.w2, w3: s.w3, x1: s.x1, act: s.act }).gw1;
        gs.push(gv); if (Math.abs(gv) > m) m = Math.abs(gv);
      }
      const xbOf = function (v) { return PB.x + 34 + (v - DOM[0]) / (DOM[1] - DOM[0]) * (PB.w - 38); };
      const mapB = function (v) { return PB.y + PA.h / 2 - DK.clamp(v, -m, m) / m * (PA.h / 2 - 3); };
      let dB = '';
      for (let i = 0; i <= 72; i++) {
        const wv = DOM[0] + (DOM[1] - DOM[0]) * i / 72;
        dB += (i ? 'L' : 'M') + xbOf(wv).toFixed(1) + ',' + mapB(gs[i]).toFixed(1);
      }
      ib.curve.setAttribute('d', dB);
      ib.zero.setAttribute('y1', mapB(0)); ib.zero.setAttribute('y2', mapB(0));
      ib.head.setAttribute('x1', xbOf(s.w1)); ib.head.setAttribute('x2', xbOf(s.w1));
      ib.dot.setAttribute('cx', xbOf(s.w1)); ib.dot.setAttribute('cy', mapB(c.gw1));
      ib.dot.style.opacity = f >= 11 ? 1 : 0.25;
      const nextW = s.w1 - LR * c.gw1;
      ib.ghost.style.opacity = f >= TOTAL ? 1 : 0;
      ib.ghost.setAttribute('cx', xbOf(DK.clamp(nextW, DOM[0], DOM[1])));
      ib.ghost.setAttribute('cy', mapB(0));
      ib.scale.textContent = '纵轴 ±' + DK.fmt(m, 2);
      ib.sub.textContent = '梯度曲线是直线 = 纯线性（第 ② 步）；贴零的一段 = 闸门关了（第 ④ 步）';
      ib.note2.textContent = Math.abs(c.gw1) < 1e-6
        ? '当前 ∂L/∂w₁ = 0 → 这个旋钮本轮一动不动'
        : '当前 ∂L/∂w₁ ' + DK.fmt(c.gw1, 3) + ' → 往' + (c.gw1 > 0 ? '小' : '大') + '拧';

      /* --- 读数条 --- */
      if (api._ro) {
        api._ro.set('act', ACTS[s.act].name);
        api._ro.set('y', DK.fmt(c.y, 3));
        api._ro.set('L', DK.fmt(c.L, 4));
        api._ro.set('gw1', f >= 11 ? DK.fmt(c.gw1, 4) : '—');
        api._ro.set('gw2', f >= 11 ? DK.fmt(c.gw2, 4) : '—');
        api._ro.set('gw3', f >= 11 ? DK.fmt(c.gw3, 4) : '—');
        api._ro.set('next', f >= TOTAL ? DK.fmt(nextW, 3) : '—');
        api._ro.set('frame', f + '/' + TOTAL + ' ' + (f >= 7 ? '反向' : (f >= 1 ? '前向' : '未算')));
      }
    },

    onReset: function (api) { api.playing = false; },

    /* ---------------- C 类动画契约：逐帧可 seek（DESIGN.md §6.3） ---------------- */
    frames: function (api) {
      return {
        total: TOTAL,
        seek: function (i) { api.playing = false; api.state.f = DK.clamp(Math.round(+i) || 0, 0, TOTAL); api.draw(); }
      };
    },

    hint: '<strong>你能改什么：</strong>' +
      '三个权重 <code>w₁ / w₂ / w₃ ∈ [−3, 3]</code>，步长 0.05——它们分别是乘在 x₁ / x₂ / x₃ 上的系数，' +
      '就是这个网络<b>全部</b>可训练的旋钮（v₁=1.0、b₂=−0.5 固定，只为留出「上游那一层」）；' +
      '一个输入 <code>x₁ ∈ [−3, 3]</code>（喂进去的那个数；x₂=0.60、x₃=−1.10 固定）；' +
      '<code>φ ∈ {ReLU, Sigmoid, Tanh, 无}</code>（同一个开关用在 z₁ 与 z₂ 两处）。' +
      '按钮「前向计算」走第 1–6 帧，「反向传播」走第 7–13 帧，◀ ▶ 可一帧一帧看；' +
      '学习率 η=0.5 固定，只用于第 13 帧的「下一步」。<br>' +
      '<strong>拨动它你会看到：</strong>① 拖任一个权重，A 面板那条 <code>y(x₁)</code> 曲线立刻变形；' +
      '换到 Sigmoid，y 被压在 0.38–0.62，永远碰不到虚线 t=1，损失降不到 0。' +
      '② <b>把激活函数切成「无」，再点反向传播，看梯度为什么变成一条直线</b>：' +
      'φ′≡1，链式法则里乘不进任何非 1 的因子，于是 z₁ 与 z₂ 两格的梯度数字一模一样，' +
      'B 面板的 <code>∂L/∂w₁</code> 成了斜率恒定的直线（损失只是 w₁ 的二次函数），' +
      'A 面板的响应也塌回一条直线——两层线性塌成一层，深度白买。' +
      '③ 梯度大小只由「上游梯度 × 局部导数」决定：把 x₁ 拖到 0，w₁ 的梯度贴在 0 上，这个旋钮一轮都不动；' +
      '用 ReLU 时把 <code>w₁x₁+w₂x₂+w₃x₃</code> 拖成负数，z₁ 那格变冷色、w₁ w₂ w₃ 三格同时归零（负半轴死亡）。' +
      '④ 第 13 帧 B 面板的空心圈是 <code>w₁ − η·∂L/∂w₁</code> 的落点：梯度越陡，圈离当前点越远。<br>' +
      '<strong>对应机制段：</strong>第 ①② 步（一行加权求和 = 一个神经元，排成层）、' +
      '第 ②③ 步（无激活时层可合并：A、B 两图同时塌成直线）、第 ③ 步（折线与台阶从哪来）、' +
      '第 ④ 步（Sigmoid 饱和与 ReLU 死亡，直接体现在颜色深浅与贴零平段）、' +
      '第 ⑤⑥ 步（前向 = 帧 1–6，反向 = 帧 7–13，每帧只做一次「上游梯度 × 本节点局部导数」）、' +
      '第 ⑦⑧ 步（自动微分的接线与 M04 的更新式，就是第 13 帧那个空心圈）。'
  });

  /* ================= 内部助手（不导出） ================= */
  function nodeById(k) {
    for (let i = 0; i < NODE_DEF.length; i++) if (NODE_DEF[i].k === k) return NODE_DEF[i];
    return null;
  }
  /** 连线端点：从 a 靠 b 一侧的边连到 b 靠 a 一侧的边 */
  function anchor(a, b) {
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
      const right = bcx > acx;
      return {
        x1: right ? a.x + a.w : a.x, y1: DK.clamp(acy, a.y + 6, a.y + a.h - 6),
        x2: right ? b.x : b.x + b.w, y2: DK.clamp(bcy, b.y + 6, b.y + b.h - 6)
      };
    }
    const down = bcy > acy;
    return {
      x1: DK.clamp(acx, a.x + 6, a.x + a.w - 6), y1: down ? a.y + a.h : a.y,
      x2: DK.clamp(bcx, b.x + 6, b.x + b.w - 6), y2: down ? b.y : b.y + b.h
    };
  }
  /** 面板骨架：坐标框 + 一次建好的曲线 / 标记；draw 里只改 d 与坐标 */
  function buildPanel(svg, api, P, id, title, xlab, padL, clip) {
    const g = DK.el('g');
    g.appendChild(DK.el('text', { x: P.x, y: P.y - 8, class: 't-sm', text: title }));
    g.appendChild(DK.el('line', { x1: P.x + padL, y1: P.y + P.h, x2: P.x + P.w, y2: P.y + P.h,
      stroke: 'var(--c-line-strong)', 'stroke-width': 1 }));
    g.appendChild(DK.el('line', { x1: P.x + padL, y1: P.y, x2: P.x + padL, y2: P.y + P.h,
      stroke: 'var(--c-line-strong)', 'stroke-width': 1 }));
    g.appendChild(DK.el('text', { x: P.x + P.w, y: P.y + P.h + 11, class: 't-xs faint',
      'text-anchor': 'end', text: xlab + ' −3 … +3' }));
    const gg = DK.el('g', { 'clip-path': 'url(#dkm05-' + clip + ')' });
    const zero = DK.el('line', { stroke: 'var(--c-line-strong)', 'stroke-width': 1,
      'stroke-dasharray': '3 3', x1: P.x + padL, x2: P.x + P.w });
    const tline = id === 'A' ? DK.el('line', { stroke: 'var(--c-fg-faint)', 'stroke-width': 1.2,
      'stroke-dasharray': '4 3', x1: P.x + padL, x2: P.x + P.w }) : null;
    const curve = DK.el('path', { class: 'curve', d: '' });
    const head = DK.el('line', { stroke: 'var(--c-accent)', 'stroke-width': 1,
      'stroke-dasharray': '2 3', y1: P.y, y2: P.y + P.h });
    const dot = DK.el('circle', { r: 4, fill: 'var(--c-accent)', stroke: 'var(--c-bg-elev)', 'stroke-width': 1.2 });
    const ghost = id === 'B' ? DK.el('circle', { r: 5, fill: 'none', stroke: 'var(--c-ok)',
      'stroke-width': 2, opacity: 0 }) : null;
    gg.appendChild(zero);
    if (tline) gg.appendChild(tline);
    gg.appendChild(curve); gg.appendChild(head); gg.appendChild(dot);
    if (ghost) gg.appendChild(ghost);
    g.appendChild(gg);
    const sub = DK.el('text', { x: P.x, y: P.y + P.h + 24, class: 't-xs muted', text: '' });
    const scale = DK.el('text', { x: P.x + P.w, y: P.y + P.h + 24, class: 't-xs faint',
      'text-anchor': 'end', text: '' });
    const note2 = DK.el('text', { x: P.x, y: P.y + P.h + 36, class: 't-xs warm', text: '' });
    g.appendChild(sub); g.appendChild(scale); g.appendChild(note2);
    svg.appendChild(g);
    api.panels[id] = { zero: zero, tline: tline, curve: curve, head: head, dot: dot,
      ghost: ghost, sub: sub, scale: scale, note2: note2 };
  }
  /** 逐帧推进：只走 api.animate(fn)，因此尊重 prefers-reduced-motion（§6.3 降级） */
  function play(api, to) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {                       // 降级：直接给终帧；◀ ▶ 与宿主进度条仍可逐帧
      api.playing = false; api.state.f = to; api.draw(); return;
    }
    if (api.state.f >= to) api.state.f = 0;
    api.playing = true;
    api._t0 = Date.now();
    api.animate(function () {
      if (!api.playing) return false;
      if (api.state.f >= to) { api.playing = false; return false; }
      const now = Date.now();
      if (now - api._t0 >= 360) { api._t0 = now; api.state.f += 1; api.draw(); }
      return true;
    });
  }
})(window.AIPrinciples);
