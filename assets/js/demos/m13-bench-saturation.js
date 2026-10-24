/* ==========================================================================
   m13-bench-saturation.js · 基准饱和与评测失效（DESIGN.md §4 表 M13 行 / §6.2 档 B）

   教学主线：**分数还在涨，信息量已经归零。**
     ① 拖 θ（模型能力，0–4 = 第几代）→ S 形正确率曲线沿难度轴右移 → 总分逼近满分；
     ② 同时看「θ 相差 0.2 的两个模型相差几个标准误」：先 ≈2、后 <0.5 ——
        读数还在变大，但已经分不开了（机制段第 ② 步的操作性判据）；
     ③ 打开「训练集污染」→ 同一 θ 的总分凭空抬起十几分（是干净噪声半径的 5 倍），
        而 θ 一动没动（机制段第 ③ 步，串回 M01「压缩 vs 记忆」）；
     ④ 区分度热力条：4p(1−p) 在 p=0.5 处最大、在两端归零 —— 灰从**两端**吃进来：
        高端是难题先失效，低端是被记住的题先失效。

   模型（全部人工编排的示意常数，画面上已声明）：
     题目难度 s ∈ [0, 1]（0 最易、1 最难），实际取 Beta(1.15, 1.75) 的 N 个中点
       分位再线性映射到 [0.05, 0.95]（偏易、长右尾，10 个难度段都有题）。
     单题正确率 p = sigmoid(10·(0.28·θ − s))。
       → 0.28·θ 是「五成把握落在哪个难度」：θ=1.5 → 0.42；θ=3.4 → 0.95（卷子右端）；
         θ 再大就整条越出卷子，这就是把 θ 轴拉到 0–4 而难度轴保持 0–1 的原因。
     总分 p̄ = mean(p)；SE(p̄) = √(mean(p(1−p)) / N)（泊松二项近似）。
     区分度 = 4p(1−p)（伯努利方差 ×4，峰值 1 @ p=0.5，与 DK.heatFill 同标度）；
     有效题目判据 = 区分度 ≥ 0.25，等价于 p 落在 [0.15, 0.85]。
     可区分的最小能力差 Δθ_min = 2·SE ÷ d(p̄)/dθ，d(p̄)/dθ = 0.28·mean(10·p(1−p))。
     污染 = 难度最低的那批题已在训练语料里出现过 → 判为必对（p≡1）：它的方差与
       导数都是 0，所以既抬高分数、又吃掉分母。θ=1、污染 30% 时抬高 +12.5 分，
       而干净读数的噪声半径只有 ±2.6 分 —— 抬升是噪声的 4.9 倍，所以污染读数
       必然被误读成「进步」。

   诚实性（契约 §2.2 第 4 条）：画面上写明「示意数据」。本演示不抽样——总分、
   标准误、区分度全是解析量；若需随机性一律走 DK.rng(固定 seed)，绝不用内建
   随机数发生器（自检会扫并判为不可复现）。
   颜色纪律：只用 var(--c-*) 与 DK.heatFill()。**凡需要自定义颜色的文本一律走
   style**——`.demo-svg text` / `.dgm text` 这类 CSS 规则会覆盖 fill 属性，
   用属性设色等于没设。热力格内不放数字：heatFill 的浅档在亮色主题接近白、深档
   在暗色主题接近浅蓝白，任何固定文字色都会在某一主题下看不见。
   越界纪律：viewBox 700×430；顶部说明文字最远写到 x≈452，不与右栏卡片（x≥466）
   相撞；污染的具体数字写在底部说明行而不是画在图里（图内没有固定安全位置）；
   其余文本按左/中/右锚点逐一核算过宽度，并经无头渲染遍历 100+ 组参数验证零越界。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* ---------------- 画布几何 ---------------- */
  const W = 700, H = 430;
  const AX0 = 52, AX1 = 452, AW = AX1 - AX0;      // 共享 x 轴（题目难度 0–1）
  const P1 = 78, P0 = 266, PH = P0 - P1;          // 上图：p=1 → 78，p=0 → 266
  const STRIP_T = 270, STRIP_H = 18;              // 区分度热力条
  const TICK_Y = 299, AXNAME_Y = 312;
  const HB0 = 320, HB1 = 396, HH = HB1 - HB0;     // 下图：题目数量直方图
  const CARD_X = 466, CARD_W = 226, CARD_Y = 66, CARD_H = 282;
  const LX = 476, RX = 684, CX = CARD_X + CARD_W / 2;
  const NLX0 = 492, NLX1 = 678;
  const NB = 10, BINW = AW / NB;
  const X = (s) => AX0 + DK.clamp(s, 0, 1) * AW;
  const Y = (p) => P0 - DK.clamp(p, 0, 1) * PH;

  /* ---------------- 示意常数（见文件头） ---------------- */
  const DENS = { a1: 0.15, b1: 0.75 };            // 未归一化 Beta(1.15,1.75) 密度指数
  const SLO = 0.05, SHI = 0.95;                   // 题目实际覆盖的难度区间
  const AMP = 10;                                 // S 曲线陡度
  const CS = 0.28;                                // 五成把握落点 = CS·θ
  const DTH = 0.2;                                // 要演示的能力差
  const EFTHR = 0.25;                             // 有效题目判据：区分度 ≥ 1/4
  const MILE = ['第 1 代', '第 2 代', '第 3 代', '第 4 代', '第 5 代'];

  /* ---------------- 题目难度：Beta 分位点（按 N 缓存） ---------------- */
  const GRID = 4000;
  let CUM = null;
  function buildCum() {
    if (CUM) return CUM;
    CUM = new Float64Array(GRID + 1);
    let acc = 0, prev = 0;
    for (let j = 0; j <= GRID; j++) {
      const u = j / GRID;
      const f = Math.pow(Math.max(u, 1e-9), DENS.a1) * Math.pow(Math.max(1 - u, 1e-9), DENS.b1);
      if (j) acc += (f + prev) * 0.5 / GRID;
      CUM[j] = acc; prev = f;
    }
    return CUM;
  }
  const qsCache = {};
  function quantiles(N) {
    if (qsCache[N]) return qsCache[N];
    const c = buildCum(), total = c[GRID], out = new Float64Array(N);
    let ptr = 0;
    for (let k = 0; k < N; k++) {
      const target = ((k + 0.5) / N) * total;
      while (ptr < GRID && c[ptr + 1] < target) ptr++;
      const lo = c[ptr], hi = c[ptr + 1];
      const t = (hi > lo) ? (target - lo) / (hi - lo) : 0.5;
      out[k] = (ptr + t) / GRID;
    }
    return (qsCache[N] = out);
  }
  const sOf = (q) => SLO + (SHI - SLO) * q;
  const pOf = (th, s, seen) => seen ? 1 : 1 / (1 + Math.exp(-AMP * (CS * th - s)));

  /* ---------------- 一次完整计算 ---------------- */
  function compute(th, N, dirty, frac) {
    const qs = quantiles(N);
    const xCut = dirty ? sOf(DK.clamp(frac, 0, 0.9999)) : -1;
    let sc = 0, vs = 0, ds = 0, eff = 0, seenN = 0;
    const cnt = new Array(NB).fill(0), vd = new Array(NB).fill(0), sn = new Array(NB).fill(0);
    for (let i = 0; i < N; i++) {
      const s = sOf(qs[i]);
      const seen = dirty && qs[i] <= frac;
      const p = pOf(th, s, seen);
      const g = seen ? 0 : AMP * CS * p * (1 - p);   // dp/dθ（必对题恒为 0）
      const disp = 4 * p * (1 - p);                  // 区分度 = 伯努利方差 ×4
      sc += p; vs += disp; ds += g; eff += disp >= EFTHR ? 1 : 0;
      if (seen) seenN++;
      const bi = Math.min(NB - 1, Math.floor(s * NB));
      cnt[bi]++; vd[bi] += disp; sn[bi] += seen ? 1 : 0;
    }
    /* 有效难度窗口：首尾两个「还有区分度」的段中心 */
    let winLo = null, winHi = null;
    for (let b = 0; b < NB; b++) {
      const v = cnt[b] ? vd[b] / cnt[b] : 0;
      if (v >= EFTHR) { if (winLo === null) winLo = (b + 0.5) / NB; winHi = (b + 0.5) / NB; }
    }
    const pm = sc / N;
    return {
      pm: pm, se: Math.sqrt(Math.max(vs / N, 1e-12) / (4 * N)),
      slope: ds / N, eff: eff / N, seenN: seenN, xCut: xCut,
      cnt: cnt, vd: vd, sn: sn, winLo: winLo, winHi: winHi
    };
  }

  DK.define('m13-bench-saturation', {
    title: '基准饱和与评测失效',
    viewBox: [W, H],
    cls: 'dgm',
    seed: 13,
    state: { theta: 1.5, n: 200, dirty: false, frac: 0.3, heat: true },

    controls(holder, api) {
      const st = api.state;
      holder.appendChild(DK.range({
        key: 'theta', label: '模型能力 θ', min: 0, max: 4, step: 0.05, value: st.theta,
        fmt: v => v.toFixed(2) + '（' + MILE[DK.clamp(Math.round(v), 0, 4)] + '）',
        on(v) { api.state.theta = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'n', label: '题目数量 N', min: 20, max: 500, step: 10, value: st.n,
        fmt: v => v + ' 题',
        on(v) { api.state.n = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'frac', label: '被污染占比', min: 0, max: 0.8, step: 0.05, value: st.frac,
        fmt: v => (v * 100).toFixed(0) + '%（需开污染）',
        on(v) { api.state.frac = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'dirty', label: '训练集污染', value: st.dirty,
        on(v) { api.state.dirty = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'heat', label: '显示区分度热力条', value: st.heat,
        on(v) { api.state.heat = v; api.draw(); }
      }));
      api._ro = DK.readout([
        ['score', '总分（读数）', ''],
        ['se', '总分标准误', ''],
        ['sep', 'θ 差 0.2 相差', ''],
        ['minsep', '可区分的最小 Δθ', ''],
        ['win', '有效难度段', ''],
        ['eff', '有效题目占比', ''],
        ['inf', '污染带来的虚高', '']
      ]);
      api.host.appendChild(api._ro);
    },

    build(svg, api) {
      const mk = (tag, attrs, kids) => { const n = DK.el(tag, attrs, kids); svg.appendChild(n); return n; };

      /* ---------- 顶部说明（右栏卡片从 x=466 起，所以正文最长写到 452） ---------- */
      mk('text', { x: 8, y: 14, class: 't-sm',
        text: '拖 θ：正确率曲线右移、总分一路涨，但两个模型越来越分不开' });
      mk('text', { x: 8, y: 28, class: 't-xs faint',
        text: '示意数据：题目分布与正确率曲线为人工编排，用于展示机制，不对应任何真实基准。' });
      mk('text', { x: 8, y: 41, class: 't-xs faint',
        text: '橙线 = 这个 θ 有五成把握的难度位置（落点 = 0.28·θ）；越过卷子右端即无题可赢。' });
      api.tag = mk('text', { x: 8, y: 60, class: 't-sm', style: 'fill:var(--c-fg-muted)', text: '' });

      /* ---------- 上图：网格、纵轴、有效区底纹 ---------- */
      api.effBand = mk('rect', { x: AX0, y: P1, width: 0, height: PH,
        style: 'fill:var(--c-ok)', opacity: 0.07 });
      [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
        const y = Y(v);
        mk('line', { x1: AX0, y1: y, x2: AX1, y2: y, class: v === 0 ? 'grid' : 'grid grid--dash' });
        mk('text', { x: AX0 - 7, y: y + 3, class: 't-xs muted', 'text-anchor': 'end', text: v.toFixed(2) });
      });
      /* 纵轴名竖排贴在轴左侧空白带（x 8–20，刻度文字占 27–45）：
         横排无论放哪一行都会与顶部说明或 θ 读数叠印 */
      mk('text', { class: 't-xs faint', 'text-anchor': 'middle',
        transform: `translate(14 ${(P1 + P0) / 2}) rotate(-90)`, text: '正确率' });
      mk('line', { x1: AX0, y1: P1, x2: AX0, y2: P0, style: 'stroke:var(--c-line-strong);stroke-width:1' });

      /* ---------- 曲线（参考 θ+0.2 先画，主曲线压在上面） ---------- */
      api.refBand = mk('polyline', { fill: 'none', 'stroke-width': 7, opacity: 0.12,
        style: 'stroke:var(--c-fg-muted)' });
      api.refCurve = mk('polyline', { class: 'curve curve--muted', fill: 'none', 'stroke-dasharray': '7 5' });
      api.curve = mk('polyline', { class: 'curve', fill: 'none',
        style: 'stroke:var(--c-accent);stroke-width:2.4' });

      /* 每段区分度柱（贴在正确率面板底部） */
      api.varBars = [];
      for (let b = 0; b < NB; b++) {
        api.varBars.push(mk('rect', { x: AX0 + b * BINW + 4, y: P0, width: BINW - 8, height: 0,
          rx: 2, opacity: 0.55 }));
      }

      /* 污染覆盖条（数字写在底部说明行——图内没有固定安全位置） */
      api.band = mk('rect', { x: AX0, y: P0 - 5, width: 0, height: 5, rx: 1,
        style: 'fill:var(--c-err)', opacity: 0 });

      /* θ 与 θ+0.2 的竖直游标（贯穿上下两图） */
      api.th2 = mk('line', { y1: P1, y2: HB1, style: 'stroke:var(--c-fg-muted);stroke-width:1;stroke-dasharray:2 4' });
      api.th1 = mk('line', { y1: P1, y2: HB1, style: 'stroke:var(--c-warn);stroke-width:1.4' });
      api.thTx = mk('text', { y: P1 + 12, class: 't-xs', style: 'fill:var(--c-warn)', text: '' });
      api.th2Tx = mk('text', { y: P1 + 25, class: 't-xs', style: 'fill:var(--c-fg-muted)', text: '' });
      api.dot = mk('circle', { cy: Y(0.5), r: 4.5,
        style: 'fill:var(--c-warn);stroke:var(--c-bg-elev);stroke-width:2' });

      /* ---------- 区分度热力条（格内不放数字，见文件头说明） ---------- */
      api.cells = [];
      for (let b = 0; b < NB; b++) {
        const x0 = AX0 + b * BINW;
        api.cells.push(mk('rect', { x: x0 + 1, y: STRIP_T, width: BINW - 2, height: STRIP_H, rx: 2,
          style: 'stroke:var(--c-line-strong);stroke-width:0.8' }));
      }
      api.stripName = mk('text', { x: AX0 - 7, y: STRIP_T + 13, class: 't-xs muted',
        'text-anchor': 'end', text: '区分度' });
      [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
        mk('line', { x1: X(v), y1: STRIP_T + STRIP_H, x2: X(v), y2: STRIP_T + STRIP_H + 4, class: 'grid' });
        mk('text', { x: X(v), y: TICK_Y, class: 't-xs muted', 'text-anchor': 'middle', text: v.toFixed(1) });
      });
      mk('text', { x: AX0 + AW / 2, y: AXNAME_Y, class: 't-xs faint', 'text-anchor': 'middle',
        text: '题目难度 s（0 最易 → 1 最难）' });

      /* ---------- 下图：题目数量直方图（纵轴 = 题目数量） ---------- */
      mk('line', { x1: AX0, y1: HB1, x2: AX1, y2: HB1, class: 'grid' });
      mk('line', { x1: AX0, y1: HB0, x2: AX0, y2: HB1, style: 'stroke:var(--c-line-strong);stroke-width:1' });
      mk('text', { x: 6, y: HB0 - 6, class: 't-xs faint', text: '题目数' });
      api.histMaxTx = mk('text', { x: AX0 - 7, y: HB0 + 10, class: 't-xs muted',
        'text-anchor': 'end', text: '' });
      api.histBars = []; api.seenBars = [];
      for (let b = 0; b < NB; b++) {
        const x0 = AX0 + b * BINW;
        api.histBars.push(mk('rect', { x: x0 + 2, y: HB1, width: BINW - 4, height: 0, rx: 2,
          style: 'fill:var(--c-bg-elev);stroke:var(--c-line-strong);stroke-width:1' }));
        api.seenBars.push(mk('rect', { x: x0 + 2, y: HB1, width: BINW - 4, height: 0, rx: 2,
          style: 'fill:var(--c-err)', opacity: 0 }));
      }

      /* ---------- 底部两条说明（396 基线以下，整幅宽度可用） ---------- */
      /* 第一条做成**动态**：污染的具体数字写在这里。整行 684px / t-xs(9px)
         ≈ 76 个全角字，最长状态约 62 个，安全。 */
      api.cap1 = mk('text', { x: 8, y: 414, class: 't-xs', style: 'fill:var(--c-fg-faint)', text: '' });
      mk('text', { x: 8, y: 426, class: 't-xs', style: 'fill:var(--c-fg-faint)',
        text: '橙线 = 五成把握的难度落点。它滑出卷子右端的那一刻，就是这个基准饱和的那一刻。' });

      /* ---------- 右栏卡片：把「分不开」做成一个巨大的数 ---------- */
      mk('rect', { x: CARD_X, y: CARD_Y, width: CARD_W, height: CARD_H, rx: 9,
        style: 'fill:var(--c-bg-elev);stroke:var(--c-line-strong);stroke-width:1' });
      mk('text', { x: CX, y: CARD_Y + 15, class: 't-sm', 'text-anchor': 'middle',
        style: 'fill:var(--c-fg-muted)', text: 'θ 相差 0.2 的两个模型' });
      api.big = mk('text', { x: CX, y: CARD_Y + 40, class: 't-lg', 'text-anchor': 'middle', text: '' });
      api.verdict = mk('text', { x: CX, y: CARD_Y + 55, class: 't-xs', 'text-anchor': 'middle', text: '' });
      api.rows = {};
      [['a', '较弱者总分'], ['b', '较强者总分'], ['se', '单个读数 ±'],
       ['min', '最小可分 Δθ'], ['win', '有效难度段'], ['eff', '有效题目占比'],
       ['inf', '污染带来的虚高']].forEach(function (r, i) {
        const y = CARD_Y + 74 + i * 15;
        mk('text', { x: LX, y: y, class: 't-xs', style: 'fill:var(--c-fg-muted)', text: r[1] });
        api.rows[r[0]] = mk('text', { x: RX, y: y, class: 't-xs', 'text-anchor': 'end', text: '' });
      });

      /* 读数轴：两条 ±2SE 白条 + 两个点（重叠 = 分不开） */
      const NLY0 = CARD_Y + 200, NLY1 = CARD_Y + 220;
      mk('text', { x: LX, y: NLY0 - 13, class: 't-xs', style: 'fill:var(--c-fg-muted)',
        text: '总分读数轴（白条 = ±2 SE）' });
      mk('line', { x1: NLX0, y1: NLY1 + 11, x2: NLX1, y2: NLY1 + 11, class: 'grid' });
      api.nlA = mk('line', { y1: NLY0, y2: NLY0, 'stroke-width': 7, opacity: 0.4,
        style: 'stroke:var(--c-fg-muted)' });
      api.nlB = mk('line', { y1: NLY1, y2: NLY1, 'stroke-width': 7, opacity: 0.4,
        style: 'stroke:var(--c-fg-muted)' });
      api.dotA = mk('circle', { cy: NLY0, r: 4, style: 'fill:var(--c-fg-muted)' });
      api.dotB = mk('circle', { cy: NLY1, r: 4, style: 'fill:var(--c-accent)' });
      api.nlLo = mk('text', { x: NLX0, y: NLY1 + 23, class: 't-xs', 'text-anchor': 'middle',
        style: 'fill:var(--c-fg-faint)', text: '' });
      api.nlHi = mk('text', { x: NLX1, y: NLY1 + 23, class: 't-xs', 'text-anchor': 'middle',
        style: 'fill:var(--c-fg-faint)', text: '' });

      /* 热力条图例：色块 + 文字并排，文字落在卡片底色上（默认正文色，两主题都可读） */
      api.lg = [];
      [['深 = 区分度高（五五开，信息最多）', 0.95],
       ['浅 = 区分度≈0（太易或太难，零信息）', 0.05]].forEach(function (it, i) {
        const y = CARD_Y + CARD_H - 18 + i * 13;
        const r = mk('rect', { x: LX, y: y - 8, width: 10, height: 10, rx: 2,
          style: 'stroke:var(--c-line-strong);stroke-width:0.8' });
        const t = mk('text', { x: LX + 14, y: y, class: 't-xs', text: it[0] });
        api.lg.push({ r: r, t: t });
      });
    },

    draw(api) {
      const st = api.state;
      const N = Math.round(st.n);
      const th = DK.clamp(st.theta, 0, 4);
      const dirty = !!st.dirty;
      const frac = DK.clamp(st.frac, 0, 0.95);
      const C = compute(th, N, dirty, frac);
      const C2 = compute(th + DTH, N, dirty, frac);
      const Cc = compute(th, N, false, 0);
      const cen = CS * th, cen2 = CS * (th + DTH);

      /* 1) 两条 S 曲线（连续采样；污染区直接钉在 1） */
      const pts = [], pts2 = [], S = 110;
      for (let i = 0; i <= S; i++) {
        const s = i / S;
        pts.push(X(s).toFixed(1) + ',' + Y(pOf(th, s, dirty && s <= C.xCut)).toFixed(1));
        pts2.push(X(s).toFixed(1) + ',' + Y(pOf(th + DTH, s, dirty && s <= C2.xCut)).toFixed(1));
      }
      api.curve.setAttribute('points', pts.join(' '));
      api.refCurve.setAttribute('points', pts2.join(' '));
      api.refBand.setAttribute('points', pts2.join(' '));

      /* 2) 有效难度窗底纹 */
      if (C.winLo !== null && st.heat) {
        const x0 = X(C.winLo - 0.5 / NB), x1 = X(C.winHi + 0.5 / NB);
        api.effBand.setAttribute('x', x0.toFixed(1));
        api.effBand.setAttribute('width', Math.max(0, x1 - x0).toFixed(1));
        api.effBand.setAttribute('opacity', 0.07);
      } else {
        api.effBand.setAttribute('width', 0);
        api.effBand.setAttribute('opacity', 0);
      }

      /* 3) θ 与 θ+0.2 的游标标签（靠右端时翻到左侧，避免越界） */
      const tx = X(cen), tx2 = X(cen2);
      api.th1.setAttribute('x1', tx); api.th1.setAttribute('x2', tx);
      api.th2.setAttribute('x1', tx2); api.th2.setAttribute('x2', tx2);
      api.dot.setAttribute('cx', tx);
      const cursor = (node, x, s, flip) => {
        node.setAttribute('x', (flip ? x - 5 : x + 5).toFixed(1));
        node.setAttribute('text-anchor', flip ? 'end' : 'start');
        node.textContent = s;
      };
      cursor(api.thTx, tx, 'θ=' + th.toFixed(2), cen > 0.86);
      cursor(api.th2Tx, tx2, 'θ+0.2', cen2 > 0.87);

      /* 4) 污染覆盖条 */
      if (dirty && C.seenN > 0) {
        api.band.setAttribute('width', Math.max(1, X(C.xCut) - AX0).toFixed(1));
        api.band.setAttribute('opacity', 0.85);
      } else {
        api.band.setAttribute('width', 0); api.band.setAttribute('opacity', 0);
      }

      /* 5) 区分度柱 + 热力条 + 题目数直方图 */
      let grey = 0, warm = 0;
      const hmax = Math.max(1, Math.max.apply(null, C.cnt));
      for (let b = 0; b < NB; b++) {
        const vd = C.cnt[b] ? C.vd[b] / C.cnt[b] : 0;
        if (C.cnt[b]) {
          if (vd < 0.2) grey++;
          if (vd >= 0.5) warm++;
        }
        const vh = vd * PH / 4;
        api.varBars[b].setAttribute('y', (P0 - vh).toFixed(1));
        api.varBars[b].setAttribute('height', Math.max(vd > 0.02 ? 1 : 0, vh).toFixed(1));
        api.varBars[b].setAttribute('fill', DK.heatFill(vd));
        api.varBars[b].setAttribute('opacity', st.heat ? 0.55 : 0);
        const bh = (C.cnt[b] / hmax) * HH;
        api.histBars[b].setAttribute('y', (HB1 - bh).toFixed(1));
        api.histBars[b].setAttribute('height', Math.max(C.cnt[b] ? 1 : 0, bh).toFixed(1));
        const sh = C.cnt[b] ? (C.sn[b] / C.cnt[b]) * bh : 0;
        api.seenBars[b].setAttribute('y', (HB1 - sh).toFixed(1));
        api.seenBars[b].setAttribute('height', sh.toFixed(1));
        api.seenBars[b].setAttribute('opacity', (dirty && C.sn[b]) ? 0.8 : 0);
        /* 空段（本基准没有题落在这一段）不能画成「饱和」——用中性底纹区分 */
        if (!C.cnt[b]) {
          api.cells[b].setAttribute('fill', 'var(--c-bg-sunken)');
          api.cells[b].setAttribute('opacity', 1);
        } else {
          api.cells[b].setAttribute('fill', DK.heatFill(vd));
          api.cells[b].setAttribute('opacity', st.heat ? 1 : 0.25);
        }
      }
      api.histMaxTx.textContent = '×' + hmax;
      api.stripName.setAttribute('opacity', st.heat ? 1 : 0.4);

      /* 6) 区分性统计 */
      const sePool = Math.hypot(C.se, C2.se);
      const sep = (C2.pm - C.pm) / Math.max(sePool, 1e-12);
      const minD = C.slope > 1e-9 ? 2 * C.se / C.slope : Infinity;
      const ratio = th > 0.04 ? minD / th : Infinity;
      const infl = (C.pm - Cc.pm) * 100;
      /* 三档判据（比「二分」更诚实）：>2 SE ≈ 95% 置信能分开；1–2 SE 是勉强档，
         换一批题就可能翻过去；<1 SE 才是彻底分不开。默认 θ=1.5 正好卡在 2 附近，
         所以这里必须允许「勉强」这一档存在，否则默认态会显示成一个刺眼的红字。 */
      const band = sep >= 2 ? 'ok' : (sep >= 1 ? 'mid' : 'no');
      const bandCol = { ok: 'var(--c-ok)', mid: 'var(--c-warn)', no: 'var(--c-err)' }[band];
      const bandTxt = { ok: '差 >2 SE ⇒ 读数分得开',
        mid: '差 1–2 SE ⇒ 勉强，换批题就可能翻',
        no: '差 <1 SE ⇒ 区间重叠，分不开' }[band];
      const okMin = isFinite(minD) && minD <= DTH;

      api.big.style.fill = bandCol;
      api.big.textContent = DK.fmt(sep, 2) + ' 个标准误';
      api.verdict.style.fill = bandCol;
      api.verdict.textContent = bandTxt;
      api.rows.a.textContent = (C.pm * 100).toFixed(1) + ' 分';
      api.rows.b.textContent = (C2.pm * 100).toFixed(1) + ' 分';
      api.rows.se.textContent = '±' + (C.se * 100).toFixed(2) + ' 分';
      api.rows.min.style.fill = okMin ? 'var(--c-fg)' : 'var(--c-err)';
      api.rows.min.textContent = (isFinite(minD) ? DK.fmt(minD, 2) : '∞')
        + (okMin ? '' : '（>0.2）')
        + (isFinite(ratio) && ratio <= 99 ? '·θ 的 ' + (ratio * 100).toFixed(0) + '%' : '');
      api.rows.win.style.fill = C.eff < 0.3 ? 'var(--c-err)' : 'var(--c-fg)';
      api.rows.win.textContent = C.winLo === null ? '无（全卷零信息）'
        : C.winLo.toFixed(2) + '–' + C.winHi.toFixed(2);
      api.rows.eff.style.fill = C.eff < 0.3 ? 'var(--c-err)' : 'var(--c-fg)';
      api.rows.eff.textContent = (C.eff * 100).toFixed(0) + '%（区分度≥¼）';
      api.rows.inf.style.fill = (dirty && infl > 0.5) ? 'var(--c-err)' : 'var(--c-fg-muted)';
      api.rows.inf.textContent = dirty ? '+' + infl.toFixed(1) + ' 分（θ 未变）' : '0（未开污染）';

      /* 7) 读数轴：窗取两个 ±2SE 区间外扩一圈，映射到 NLX0..NLX1 */
      const lo = Math.max(0, Math.min(C.pm, C2.pm) * 100 - 2.6 * C.se * 100);
      const hi = Math.min(100, Math.max(C.pm, C2.pm) * 100 + 2.6 * C2.se * 100);
      const span = Math.max(0.8, hi - lo);
      const NX = (v) => DK.clamp(NLX0 + ((v - lo) / span) * (NLX1 - NLX0), NLX0, NLX1);
      api.nlA.setAttribute('x1', NX(C.pm * 100 - 2 * C.se * 100).toFixed(1));
      api.nlA.setAttribute('x2', NX(C.pm * 100 + 2 * C.se * 100).toFixed(1));
      api.nlB.setAttribute('x1', NX(C2.pm * 100 - 2 * C2.se * 100).toFixed(1));
      api.nlB.setAttribute('x2', NX(C2.pm * 100 + 2 * C2.se * 100).toFixed(1));
      api.dotA.setAttribute('cx', NX(C.pm * 100).toFixed(1));
      api.dotB.setAttribute('cx', NX(C2.pm * 100).toFixed(1));
      api.nlLo.textContent = lo.toFixed(1);
      api.nlHi.textContent = hi.toFixed(1);

      /* 8) 图例色块 + 状态标签 + 底部说明 + 读数条 */
      api.lg[0].r.setAttribute('fill', DK.heatFill(0.95));
      api.lg[1].r.setAttribute('fill', DK.heatFill(0.05));
      api.tag.style.fill = dirty ? 'var(--c-err)' : 'var(--c-fg-muted)';
      api.tag.textContent = 'θ = ' + th.toFixed(2) + '（' + MILE[DK.clamp(Math.round(th), 0, 4)] + '）'
        + '｜总分 ' + (C.pm * 100).toFixed(1) + ' 分'
        + '｜' + warm + ' 段有效 / ' + grey + ' 段已灰'
        + (dirty ? '｜污染已开' : '')
        + (cen > SHI ? '｜落点已越出卷子' : '');
      /* 污染开启时把具体数字写进底部第一行；倍数用**干净读数**的噪声做分母——
         那才是污染前那条曲线本来的误差棒，也是 hint 里说的同一个数。污染后的
         SE 会因为方差被清零而变小，拿它当分母会虚报倍数。 */
      api.cap1.style.fill = dirty ? 'var(--c-err)' : 'var(--c-fg-faint)';
      api.cap1.textContent = dirty && C.seenN > 0
        ? '红色 = 被判定「训练集里见过」的 ' + C.seenN + ' / ' + N + ' 题：必对 ⇒ 区分度 0、方差 0，'
          + '却把总分抬高了 ' + infl.toFixed(1) + ' 分 = 污染前噪声半径（±' + (Cc.se * 100).toFixed(1)
          + ' 分）的 ' + (Cc.se > 0 ? (infl / (Cc.se * 100)).toFixed(1) : '∞') + ' 倍，而 θ 一动没动。'
        : '红色 = 被判定「训练集里见过」的题：必对 ⇒ 区分度 0、方差 0，却照样把总分抬上去。';

      if (api._ro) {
        api._ro.set('score', (C.pm * 100).toFixed(1) + ' 分');
        api._ro.set('se', '±' + (C.se * 100).toFixed(2) + ' 分');
        api._ro.set('sep', DK.fmt(sep, 2) + ' SE' +
          (band === 'ok' ? '（分得开）' : band === 'mid' ? '（勉强）' : '（分不开）'));
        api._ro.set('minsep', isFinite(minD) ? DK.fmt(minD, 2) : '∞');
        api._ro.set('win', C.winLo === null ? '无' : C.winLo.toFixed(2) + '–' + C.winHi.toFixed(2));
        api._ro.set('eff', (C.eff * 100).toFixed(0) + '%');
        api._ro.set('inf', dirty ? '+' + infl.toFixed(1) + ' 分' : '—');
      }
    },

    hint: '<strong>你能改什么：</strong>模型能力 θ ∈ [0, 4]（步长 0.05，代表第几代模型；它在难度轴上的' +
      '<strong>五成把握落点 = 0.28·θ</strong>，橙线标出——θ=1.5 落在难度 0.42，θ=3.4 已经到卷子右端 0.95）；' +
      '题目难度 s ∈ [0, 1]（0 最易、1 最难，题目按偏易的 Beta 分布铺在这段上）；' +
      '题目数量 N ∈ [20, 500]（这个基准一共几道题）；被污染占比 ∈ [0, 80%]（其中多少题在训练语料里出现过，' +
      '要与「训练集污染」一起打开）；两个开关：「训练集污染」「显示区分度热力条」。' +
      '区分度 = 4p(1−p)：1 = 五五开（信息量最大），0 = 全员同答案（零信息）。<br>' +
      '<strong>拨动它你会看到（照这个顺序做四个实验）：</strong>' +
      '① 关掉污染，把 θ 从 1.5 一路拖到 4.0：总分从约 54 分涨到约 99 分，看起来一路进步；' +
      '但右栏「θ 相差 0.2 的两个模型差几个标准误」从 <em>约 2.0（默认态正显示「勉强」）跌到 0.4</em>，' +
      '读数轴上两条 ±2SE 白条完全重叠——<em>分数还在涨，你已经分不开两个模型了</em>。' +
      '同一时刻橙线（θ 落点）滑出卷子右端，热力条从右边开始一格一格变灰，' +
      '「有效题目占比」从 71% 掉到 3%、绿色底纹那一段越来越窄。这就是饱和的操作性判据：' +
      '不是「分数太高」，而是<strong>难度分布的上端已经没有方差</strong>，95% 与 96% 在统计上是同一个数。' +
      '② 把 N 从 20 拖到 500：θ=1.5 时相差从约 0.6 SE 涨到约 3.1 SE（SE 按 1/√N 收缩）——多出题能救回一点区分度；' +
      '但 θ=4.0 时哪怕 500 题仍然分不开（约 0.6 SE），因为有效题目占比只剩 2%：' +
      '<em>题量能压噪声，压不出被清零的方差</em>。同时看「最小可分 Δθ」，它是 2 个标准误 ÷ d(总分)/dθ，' +
      '后面标出它相当于当前 θ 的百分之几（θ=1.5 约 9%，θ=4 约 15%）。' +
      '③ 固定 θ=1.0 打开污染、占比 30%：θ 一动没动，总分从 35.0 抬到 47.5，凭空 +12.5 分，' +
      '而污染前的噪声半径只有 ±2.6 分——抬升是噪声的 4.9 倍，任何一个读者都会把它读成进步。' +
      '同时看热力条左端：那几格变成最浅的一档（必对题方差为 0），下图里这批题被描成红色，' +
      '「有效题目占比」从 71% 掉到 31%。于是「同一个 θ 得到两个分数」，而分数是外界唯一看得见的东西。' +
      '这正是 <a href="#m01">M01</a>「压缩 vs 记忆」在评测上的还债：在下一词预测这个目标里，' +
      '「见过」与「会做」无法区分。' +
      '④ 把污染占比拖到 80%：灰色从<strong>两端</strong>同时吃进来——高端是难题先失效，' +
      '低端是被记住的题先失效，中间那条有信息的带越来越窄（总分却被抬到 93 分）。' +
      '这也是「换一个更难的基准」的机制理由，而不是「出题人偷懒」。<br>' +
      '<strong>对应机制段：</strong>第 ② 步（饱和 = 区分度消失；判据就是这里的方差柱、热力条与' +
      '「有效题目占比」，「最小可分 Δθ」= 2 个标准误 ÷ d(总分)/dθ）、第 ③ 步（数据污染：同一 θ 得到不同分数）、' +
      '第 ⑦ 步（能力与对齐是两个正交轴：这个演示从头到尾只测能力，一次都没有告诉你模型是否安全——' +
      '「满分」与「危险」可以同时成立）。<br>' +
      '<strong>数据声明：</strong>难度分布取 Beta(1.15, 1.75) 的分位点铺到 [0.05, 0.95]、' +
      '正确率取 sigmoid(10·(0.28·θ − s))，全部是为让画面落在可读区间而人工编排的示意常数，' +
      '<strong>不对应任何真实基准测试的任何一次运行</strong>；本演示不抽样（总分、标准误、区分度均为解析量），' +
      '同参数必然同结果。'
  });
})(window.AIPrinciples);
