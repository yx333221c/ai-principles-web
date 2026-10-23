/* ==========================================================================
   m08-scaling-curve.js · 规模定律拟合器（DESIGN.md §4 表 M08 行 / §6.2 档 B）
   画布：纵轴 = 交叉熵损失 L（比特/词元，见 M02），横轴 = 参数量 N。读者拖动
   拟合直线的斜率 α / β 与截距 A，看 8 个「历史运行」的残差如何变化，
   再沿拟合线外推，预测「下一个模型该有多大、损失会是多少」。

   诚实性声明（契约 §2.2 第 4 条，写在画面上）：8 个运行点是**编造的示意
   样例**，不是任何真实模型的训练记录。只有「幂律 / 双对数上呈直线 /
   存在 compute-optimal 配比」这三条**形状**参照公开结论
   （Kaplan et al. 2020, arXiv:2001.08361；Hoffmann et al. 2022, arXiv:2203.15556）。
   生成点所用的常数（L∞=1.5、A=1.60、B=1.10、α=0.10、β=0.12）是为了让画面
   落在可读区间而挑的，**不代表真实拟合值**——真实指数随数据集与架构变化，
   要引用数值请看正文里标注来源的那几处。
   噪声用 DK.rng(定 seed) 生成：同 seed → 每次打开、每次重置都是同一批点。

   颜色纪律：所有描边/填充走 var(--c-*) 或 DK.heatFill()，无硬编码色值。
   注意 presentation attribute 会被 `.demo-svg .grid` 之类的 CSS 覆盖，
   所以凡是要自定义颜色的线，一律用 style（内联样式优先级更高）。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* ---------- 常量：参考点、不可约地板、固定系数 ---------- */
  const N0 = 1e9;            // 参数参考点：幂律写成相对值，斜率就是双对数斜率
  const D0 = 1e11;           // 数据参考点
  const FLOOR = 1.5;         // L∞：自然语言本身不可压缩的意外程度（示意，bit/词元）
  const B_DATA = 1.10;       // 数据项系数：本 demo 固定，避免控件过载
  const BETA0 = 0.12;        // 仅供生成参考点使用
  const RATIO = 20;          // Chinchilla 配比：≈20 词元/参数（公开结论的量级）
  const XLO = 7, XHI = 12;   // 横轴 log10(N)：1e7 … 1e12 参数
  const NMAX = 1.05e12;      // 线性刻度的横轴上限
  const NSAMP = 72;          // 折线采样段数

  /* ---------- 拟合形式：Chinchilla 的「加性幂律」 ---------- */
  /* L(N,D) = L∞ + A·(N/N0)^(−α) + B·(D/D0)^(−β)
     用加性而不是乘性，是为了让「只放大一项」能被另一项托住——那正是本
     demo 的教学点；而损失下界 L∞ 也只有加性形式才表达得出来。 */
  function lossOf(s, n, d) {
    return FLOOR + s.A * Math.pow(n / N0, -s.alpha) + B_DATA * Math.pow(d / D0, -s.beta);
  }

  /* ---------- 8 个编造的「历史运行」：参考常数 + 定 seed 噪声 ---------- */
  const rnd = DK.rng(22031556);
  const REF = { alpha: 0.10, beta: BETA0, A: 1.60 };
  const RUNS = [
    { n: 3.0e7, d: 9.0e8 }, { n: 1.0e8, d: 3.0e9 }, { n: 3.0e8, d: 6.0e9 },
    { n: 8.0e8, d: 1.1e10 }, { n: 1.6e9, d: 2.4e10 }, { n: 4.0e9, d: 5.0e10 },
    { n: 1.1e10, d: 1.5e11 }, { n: 6.0e10, d: 4.2e11 }
  ];
  RUNS.forEach(function (r) {
    r.loss = lossOf(REF, r.n, r.d) + (rnd() - 0.5) * 0.10;   // ±0.05 bit 观测噪声
  });

  /* ---------- 科学计数显示（真上标，别在画布里写 1e11 这种读不懂的字） ---------- */
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  const sup = (s) => String(s).split('').map(c => SUP[c] || c).join('');
  const sciByExp = (le) => {                  // 输入 log10 值 → 「2.0×10¹⁰」
    const e = Math.floor(le), m = Math.pow(10, le - e);
    return m.toFixed(1) + '×10' + sup(e);
  };

  /* ---------- 达到目标损失所需的最少算力分配（可直接解出来） ---------- */
  /* 最小化 C = N·D，约束 A·n^(−α) + B·d^(−β) = S（n=N/N0, d=D/D0, S=L−L∞）。
     拉格朗日条件给出「参数项 = S·β/(α+β)，数据项 = S·α/(α+β)」，
     于是 n_opt = (A/参数项)^(1/α)，d_opt = (B/数据项)^(1/β)。 */
  function optimal(s, L) {
    const S = L - FLOOR;
    if (!(S > 1e-6)) return null;
    const x = S * s.beta / (s.alpha + s.beta);      // 应落在参数项上的那一份
    const y = S * s.alpha / (s.alpha + s.beta);     // 应落在数据项上的那一份
    const nOpt = N0 * Math.pow(s.A / x, 1 / s.alpha);
    const dOpt = D0 * Math.pow(B_DATA / y, 1 / s.beta);
    if (!isFinite(nOpt) || !isFinite(dOpt) || nOpt <= 0 || dOpt <= 0) return null;
    return { n: nOpt, d: dOpt, c: (nOpt / N0) * (dOpt / D0), ratio: dOpt / nOpt };
  }

  DK.define('m08-scaling-curve', {
    title: '规模定律拟合器：把直线拖到穿过这些点',
    viewBox: [700, 404],
    cls: 'dgm',
    state: { alpha: 0.10, beta: 0.12, A: 1.60, nExp: 9, dExp: 10.3, loglog: true, link: false },

    controls(holder, api) {
      const s = api.state;
      /* α / β 的合法区间 0.02–0.30：公开拟合值都落在这条带里
         （Kaplan 2020 报 α_N≈0.076 [2026-10]；Hoffmann 2022 对 L−L∞
         报 α≈0.34、β≈0.28，那是另一种写法）。 */
      holder.appendChild(DK.range({
        key: 'alpha', label: '斜率 α（参数项）', min: 0.02, max: 0.30, step: 0.01, value: s.alpha,
        fmt: v => v.toFixed(2) + '｜N×10 → 该项×' + Math.pow(10, -v).toFixed(2),
        on(v) { api.state.alpha = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'beta', label: '斜率 β（数据项）', min: 0.02, max: 0.30, step: 0.01, value: s.beta,
        fmt: v => v.toFixed(2) + '｜D×10 → 该项×' + Math.pow(10, -v).toFixed(2),
        on(v) { api.state.beta = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'A', label: '截距 A（N=10⁹ 处参数项高度）', min: 0.60, max: 3.00, step: 0.02, value: s.A,
        fmt: v => v.toFixed(2) + ' bit',
        on(v) { api.state.A = v; api.draw(); }
      }));
      const nCtl = DK.range({
        key: 'nExp', label: '参数量 N', min: 7, max: 12, step: 0.05, value: s.nExp,
        fmt: v => sciByExp(v) + ' 参数',
        on(v) {
          api.state.nExp = v;
          if (api.state.link) {
            api.state.dExp = DK.clamp(v + Math.log10(RATIO), 9, 13);
            if (api._dCtl) api._dCtl._dkRestore(api.state);
          }
          api.draw();
        }
      });
      holder.appendChild(nCtl);
      const dCtl = DK.range({
        key: 'dExp', label: '数据量 D（词元）', min: 9, max: 13, step: 0.05, value: s.dExp,
        fmt: v => sciByExp(v) + ' 词元',
        on(v) {
          api.state.dExp = v;
          if (api.state.link) {
            api.state.nExp = DK.clamp(v - Math.log10(RATIO), 7, 12);
            if (api._nCtl) api._nCtl._dkRestore(api.state);
          }
          api.draw();
        }
      });
      holder.appendChild(dCtl);
      api._nCtl = nCtl; api._dCtl = dCtl;

      holder.appendChild(DK.toggle({
        key: 'loglog', label: '双对数坐标', value: s.loglog,
        on(c) { api.state.loglog = c; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'link', label: '按 Chinchilla 配比联动 N 与 D', value: s.link,
        on(c) {
          api.state.link = c;
          if (c) {
            api.state.dExp = DK.clamp(api.state.nExp + Math.log10(RATIO), 9, 13);
            dCtl._dkRestore(api.state);
          }
          api.draw();
        }
      }));

      api._ro = DK.readout([
        ['L', '预测损失 (bit/词元)', ''],
        ['perp', '等效困惑度 2^L', ''],
        ['rms', '8 点残差 RMS', ''],
        ['waste', '同损失最少算力的倍数', ''],
        ['mix', '最少算力配比的 D/N', '']
      ]);
      api.host.appendChild(api._ro);
    },

    build(svg, api) {
      const W = 700, H = 404, pad = { t: 64, r: 18, b: 42, l: 58 };
      api.geo = { W, H, pad };

      /* 顶部：诚实性声明 + 图例（契约 §2.2 第 4 条要求写在画面上） */
      svg.appendChild(DK.el('text', { x: 12, y: 15, class: 't-xs faint',
        text: '示意数据：8 个点是编造的样例，不是真实论文数据；只有「幂律／双对数成直线／存在最优配比」这三条形状参照公开结论。' }));
      svg.appendChild(DK.el('text', { x: 12, y: 29, class: 't-xs faint',
        text: '损失单位 = 比特/词元（以 2 为底的交叉熵，见 M02）。实线 = 保持你的 D 不变只改 N；虚线 = N 与 D 按 20:1 同步放大。' }));
      api.tMode = DK.el('text', { x: 12, y: 49, class: 't-sm accent', text: '' });
      svg.appendChild(api.tMode);

      /* 坐标轴框 */
      svg.appendChild(DK.el('line', { x1: pad.l, y1: pad.t, x2: pad.l, y2: H - pad.b, style: 'stroke:var(--c-line-strong);stroke-width:1.2' }));
      svg.appendChild(DK.el('line', { x1: pad.l, y1: H - pad.b, x2: W - pad.r, y2: H - pad.b, style: 'stroke:var(--c-line-strong);stroke-width:1.2' }));

      /* 刻度池 + 曲线 + 点 + 标记：全部先建、draw 里只改属性（契约 §2.2 第 6 条） */
      api.xTicks = []; api.yTicks = [];
      for (let i = 0; i < 6; i++) {
        const ln = DK.el('line', { class: 'grid', x1: 0, y1: pad.t, x2: 0, y2: H - pad.b, 'stroke-dasharray': '2 5' });
        const tx = DK.el('text', { x: 0, y: H - pad.b + 16, class: 't-xs muted', 'text-anchor': 'middle', text: '' });
        svg.appendChild(ln); svg.appendChild(tx);
        api.xTicks.push({ ln: ln, tx: tx });
      }
      for (let i = 0; i < 5; i++) {
        const ln = DK.el('line', { class: 'grid', x1: pad.l, y1: 0, x2: W - pad.r, y2: 0, 'stroke-dasharray': '2 5' });
        const tx = DK.el('text', { x: pad.l - 8, y: 0, class: 't-xs muted', 'text-anchor': 'end', text: '' });
        svg.appendChild(ln); svg.appendChild(tx);
        api.yTicks.push({ ln: ln, tx: tx });
      }
      api.tX = DK.el('text', { x: W / 2, y: H - 6, class: 't-xs faint', 'text-anchor': 'middle', text: '' });
      /* 纵轴标题竖排贴在轴左侧：横排会和上方模式说明（y=49）以及刻度文字挤在一起 */
      api.tY = DK.el('text', { class: 't-xs faint', 'text-anchor': 'middle',
        transform: `translate(14 ${(pad.t + (H - pad.b)) / 2}) rotate(-90)`, text: '' });
      svg.appendChild(api.tX); svg.appendChild(api.tY);

      /* 地板线 L∞ */
      api.floorLn = DK.el('line', { x1: pad.l, y1: 0, x2: W - pad.r, y2: 0,
        style: 'stroke:var(--c-warn);stroke-width:1.4;stroke-dasharray:6 4' });
      api.floorTx = DK.el('text', { x: W - pad.r - 2, y: 0, class: 't-xs warm', 'text-anchor': 'end',
        text: 'L∞ 地板：数据用尽后，只加参数也压不下去' });
      svg.appendChild(api.floorLn); svg.appendChild(api.floorTx);

      /* 两条曲线：同一个 <polyline> 复用，只改 points */
      api.frontier = DK.el('polyline', { class: 'curve curve--muted', fill: 'none', 'stroke-dasharray': '7 5' });
      api.mainLine = DK.el('polyline', { class: 'curve', fill: 'none' });
      svg.appendChild(api.frontier); svg.appendChild(api.mainLine);

      /* 残差竖线 + 观测点：固定 8 个 */
      api.stems = []; api.dots = [];
      RUNS.forEach(function (r, i) {
        const ln = DK.el('line', { x1: 0, y1: 0, x2: 0, y2: 0, 'stroke-width': 1.5, opacity: .8 });
        const c = DK.el('circle', { r: 4, cx: 0, cy: 0,
          fill: 'var(--c-bg-elev)', stroke: 'var(--c-fg-muted)', 'stroke-width': 1.4 });
        c.setAttribute('aria-label', '样例运行 ' + (i + 1) + '：N=' + sciByExp(Math.log10(r.n)) +
          '，D=' + sciByExp(Math.log10(r.d)) + '，损失 ' + r.loss.toFixed(2) + ' bit');
        svg.appendChild(ln); svg.appendChild(c);
        api.stems.push(ln); api.dots.push(c);
      });

      /* 外推标记：读者选的「下一个模型」落在拟合线上的位置 */
      api.mkLn = DK.el('line', { x1: 0, y1: 0, x2: 0, y2: 0,
        style: 'stroke:var(--c-accent);stroke-width:1;stroke-dasharray:3 3', opacity: .7 });
      api.mk = DK.el('circle', { r: 6.5, cx: 0, cy: 0,
        fill: 'var(--c-accent)', stroke: 'var(--c-bg-elev)', 'stroke-width': 2 });
      api.mkTx = DK.el('text', { x: 0, y: 0, class: 't-sm accent', text: '' });
      svg.appendChild(api.mkLn); svg.appendChild(api.mk); svg.appendChild(api.mkTx);
    },

    draw(api) {
      const st = api.state, g = api.geo;
      const s = { alpha: st.alpha, beta: st.beta, A: st.A };
      const N = Math.pow(10, st.nExp), D = Math.pow(10, st.dExp);

      /* 1) 采样两条曲线 */
      const mainPts = [], frontPts = [];
      for (let i = 0; i <= NSAMP; i++) {
        const ne = XLO + (XHI - XLO) * i / NSAMP, n = Math.pow(10, ne);
        mainPts.push([n, lossOf(s, n, D)]);
        frontPts.push([n, lossOf(s, n, RATIO * n)]);
      }

      /* 2) 纵轴范围：把两条线、8 个点、地板、标记都装进去 */
      let lo = FLOOR, hi = FLOOR + 0.1;
      mainPts.concat(frontPts).forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
      RUNS.forEach(function (r) { lo = Math.min(lo, r.loss); hi = Math.max(hi, r.loss); });
      const Lcur = lossOf(s, N, D);
      lo = Math.min(lo, Lcur); hi = Math.max(hi, Lcur);
      const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;

      /* 3) 坐标映射：开关双对数走两条不同映射——这就是本 demo 的关键教学点 */
      const sc = st.loglog
        ? DK.scales(XLO, XHI, Math.log10(lo), Math.log10(hi), g.pad)(g.W, g.H)
        : DK.scales(0, NMAX, lo, hi, g.pad)(g.W, g.H);
      const PX = st.loglog ? (function (n) { return sc.px(Math.log10(n)); })
                           : (function (n) { return sc.px(n); });
      const PY = st.loglog ? (function (l) { return sc.py(Math.log10(l)); })
                           : (function (l) { return sc.py(l); });

      /* 4) 刻度 */
      for (let i = 0; i < 6; i++) {
        const t = api.xTicks[i];
        if (st.loglog) {
          const k = XLO + i, x = sc.px(k);
          t.ln.setAttribute('x1', x); t.ln.setAttribute('x2', x); t.ln.setAttribute('opacity', 1);
          t.tx.setAttribute('x', x); t.tx.setAttribute('opacity', 1); t.tx.textContent = '10' + sup(k);
        } else if (i < 5) {
          const v = NMAX * i / 4, x = sc.px(v);
          t.ln.setAttribute('x1', x); t.ln.setAttribute('x2', x); t.ln.setAttribute('opacity', 1);
          t.tx.setAttribute('x', x); t.tx.setAttribute('opacity', 1);
          t.tx.textContent = i === 0 ? '0' : (v / 1e12).toFixed(1) + ' 万亿';
        } else {
          t.ln.setAttribute('opacity', 0); t.tx.setAttribute('opacity', 0);
        }
      }
      api.tX.textContent = st.loglog ? '参数量 N（对数刻度，每格 ×10）'
        : '参数量 N（线性刻度：所有点挤在最左边，直线没了）';
      /* 纵轴刻度必须走 PY：loglog 模式下 sc 的定义域是 log10(L)，
         直接把线性损失值喂给 sc.py 会把刻度放到画布上方（负 y）。 */
      for (let i = 0; i < 5; i++) {
        const lv = st.loglog
          ? Math.pow(10, Math.log10(lo) + (Math.log10(hi) - Math.log10(lo)) * i / 4)
          : lo + (hi - lo) * i / 4;
        const y = PY(lv), t = api.yTicks[i];
        t.ln.setAttribute('y1', y); t.ln.setAttribute('y2', y);
        t.tx.setAttribute('y', y + 3.5); t.tx.textContent = lv.toFixed(2);
      }
      api.tY.textContent = '损失 L（bit/词元' + (st.loglog ? '，对数刻度）' : '，线性刻度）');

      /* 5) 地板线 */
      const fy = PY(FLOOR);
      api.floorLn.setAttribute('y1', fy); api.floorLn.setAttribute('y2', fy);
      api.floorTx.setAttribute('y', Math.max(g.pad.t + 11, fy - 5));

      /* 6) 折线 */
      const toPts = (arr) => arr.map(function (p) { return PX(p[0]).toFixed(1) + ',' + PY(p[1]).toFixed(1); }).join(' ');
      api.mainLine.setAttribute('points', toPts(mainPts));
      api.frontier.setAttribute('points', toPts(frontPts));

      /* 7) 残差：观测损失 − 拟合损失。竖线长短 = 这条拟合线解释得有多好 */
      const res = RUNS.map(function (r) { return r.loss - lossOf(s, r.n, r.d); });
      let sq = 0, maxAbs = 0.001;
      res.forEach(function (v) { sq += v * v; maxAbs = Math.max(maxAbs, Math.abs(v)); });
      const rms = Math.sqrt(sq / RUNS.length);
      RUNS.forEach(function (r, i) {
        const x = PX(r.n), yObs = PY(r.loss), yFit = PY(lossOf(s, r.n, r.d));
        api.stems[i].setAttribute('x1', x); api.stems[i].setAttribute('x2', x);
        api.stems[i].setAttribute('y1', yObs); api.stems[i].setAttribute('y2', yFit);
        api.stems[i].setAttribute('stroke', DK.heatFill(Math.abs(res[i]) / maxAbs));
        api.dots[i].setAttribute('cx', x); api.dots[i].setAttribute('cy', yObs);
        api.dots[i].setAttribute('stroke', Math.abs(res[i]) > 2 * rms ? 'var(--c-err)' : 'var(--c-fg-muted)');
      });

      /* 8) 外推标记 + 文案 + 读数 */
      const mx = PX(N), my = PY(Lcur);
      api.mk.setAttribute('cx', mx); api.mk.setAttribute('cy', my);
      api.mkLn.setAttribute('x1', mx); api.mkLn.setAttribute('x2', mx);
      api.mkLn.setAttribute('y1', my); api.mkLn.setAttribute('y2', g.H - g.pad.b);
      const flip = mx > g.W - 250;
      api.mkTx.setAttribute('x', flip ? mx - 12 : mx + 12);
      api.mkTx.setAttribute('y', Math.max(g.pad.t + 13, Math.min(g.H - g.pad.b - 8, my - 11)));
      api.mkTx.setAttribute('text-anchor', flip ? 'end' : 'start');
      api.mkTx.textContent = '你的下一个模型：N=' + sciByExp(st.nExp) + ' · D=' + sciByExp(st.dExp)
        + ' → L=' + Lcur.toFixed(2);

      const opt = optimal(s, Lcur);
      const cCur = (N / N0) * (D / D0);
      api.tMode.textContent = st.loglog
        ? '双对数坐标：幂律在纸面上成了直线，所以敢沿直线往右外推——这是外推唯一的合法性来源。'
        : '换成线性坐标：同一条幂律立刻变弯，谁也不敢沿它外推。切回去就明白「直线」是坐标给的。';

      if (api._ro) {
        api._ro.set('L', Lcur.toFixed(3) + ' bit');
        api._ro.set('perp', Math.pow(2, Lcur).toFixed(1) + ' 选');
        api._ro.set('rms', rms.toFixed(3) + ' bit');
        if (!opt) {
          api._ro.set('waste', '已到地板');
          api._ro.set('mix', '—');
        } else {
          const w = cCur / opt.c;                       // ≥1：当前配比浪费掉多少算力
          api._ro.set('waste', isFinite(w) ? (w > 9999 ? '>1 万×' : w.toFixed(2) + '×') : '>1 万×');
          api._ro.set('mix', (opt.ratio >= 1000 ? sciByExp(Math.log10(opt.ratio)) : opt.ratio.toFixed(0)) + ' 词元/参数');
        }
      }
    },

    hint: '<strong>你能改什么：</strong>斜率 α（参数项，0.02–0.30）与 β（数据项，0.02–0.30）= 规模每 ×10 时那一项损失乘多少，' +
      'α 越小 = 加参数越没用；截距 A（0.60–3.00 bit）= 参考点 N=10⁹ 处参数项的高度，整条实线上下平移；' +
      '参数量 N（10⁷–10¹²，对数刻度）与数据量 D（10⁹–10¹³ 词元）= 你要外推预测的那个「下一个模型」；' +
      '两个开关：「双对数坐标」（默认开）与「按 Chinchilla 配比 20 词元/参数联动 N 与 D」。L∞=1.5 bit、B=1.10 固定不动。<br>' +
      '<strong>拨动它你会看到：</strong>① 只有 α、β、A 都接近穿过 8 个点时残差 RMS 才最小，拖离真值竖线立刻变长——拟合好不好是看残差，不是看眼睛；' +
      '② D 不动、把 N 一路拖到 10¹²，实线越拖越平、贴向 L∞ 地板线（只加参数会饱和），而虚线（N 与 D 同步放大）还在往下走；' +
      '③ 关掉「双对数坐标」，同一条幂律立刻变弯、左边的点挤成一团——直线是坐标给的，不是数据自带的；' +
      '④ N 与 D 比例严重失调时，「同损失最少算力的倍数」远大于 1，同样的算力本可以买到更低的损失。<br>' +
      '<strong>对应机制段：</strong>第 ② 步（双对数上的幂律直线 = 能外推的原因）、第 ③ 步（参数项与数据项必须分开、只加一项会饱和）、' +
      '第 ④ 步（Chinchilla 的同步放大配比）、第 ⑤ 步（沿拟合线外推 = 预测下一个模型的规模与损失）。<br>' +
      '<strong>数据声明：</strong>8 个点是编造的示意样例，拟合常数是挑来让画面可读的，不要把这里的数值当成任何真实模型的成绩。'
  });
})(window.AIPrinciples);
