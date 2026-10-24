/* ==========================================================================
   m01-shannon-game.js · M01 主演示：香农游戏（逐符号猜序列）
   注册键 = modules.json 里 m01.demo.id = 'm01-shannon-game'

   设计意图（DESIGN.md §4 M01 / §6.3）：把「猜得越准 → 付的比特越少 → 越可压缩」
   这条链做成可操作的。读者每押一个符号立刻结算；同一张画布上并列四条累计线
   （定长 / 理论地板 / 模型 / 你），四者分得越开，说明这段数据的规律越多。

   诚实性声明（作者契约 §2.2 第 4 条）：
   · 序列是**合成数据**：三条一阶马尔可夫链，转移概率写死在下面 TYPES 里，
     画面顶部常驻「示意数据（合成序列）」；不是真实语料，也不是任何模型的输出。
   · 「模型」不是预训练模型：它只对**已揭示的前缀**做计数 + 贝叶斯回退估计
     （0/1/2 阶由 modelClass 决定），绝不偷看后面的符号。
   · 「理论地板」用的是 TYPES 那套真实转移概率（只有造数据的人知道），
     所以它是这条序列在该规律下的下限，不是任何经验方法一定能达到的值。
   · 读者押注按 1/3 比特结算，是**教学简化**：真实做法是分配概率、付 −log₂ p
     （机制段第 ② 步）。这一点同时写在 demo 段、画面与 hint 里。
   · 随机数走 DK.rng(seed)：同 seed 同参数必得同一序列，重置与刷新都可复现。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  const SYM = ['A', 'B', 'C', 'D'];
  const K = SYM.length;
  const FIXED = Math.log2(K);              // 定长基准 = 2 bit/符号
  const PRIOR = 1.2;                       // 回退伪计数强度（模型唯一的超参数）

  /* rows[上一符号][下一符号]；每行和为 1（已用脚本校验） */
  const TYPES = [
    {
      short: '强规律',
      desc: '强规律（A→B→C→D 循环，掺 3% 噪声）：盯住上一个符号就几乎不会错，地板约 0.6 bit/符号。',
      P: [
        [0.03, 0.91, 0.03, 0.03],
        [0.03, 0.03, 0.91, 0.03],
        [0.03, 0.03, 0.03, 0.91],
        [0.91, 0.03, 0.03, 0.03]
      ]
    },
    {
      short: '语言式',
      desc: '语言式（偏斜转移）：有强烈倾向但仍会翻脸，地板约 1.45 bit/符号——省得有限，且要样本才挖得出来。',
      P: [
        [0.05, 0.70, 0.20, 0.05],
        [0.60, 0.05, 0.30, 0.05],
        [0.15, 0.15, 0.15, 0.55],
        [0.10, 0.10, 0.70, 0.10]
      ]
    },
    {
      short: '纯随机',
      desc: '纯随机（四个各 1/4）：没有任何可预测性，地板 = 定长 = 2 bit/符号，压缩率上限 1.00 倍。',
      P: [
        [0.25, 0.25, 0.25, 0.25],
        [0.25, 0.25, 0.25, 0.25],
        [0.25, 0.25, 0.25, 0.25],
        [0.25, 0.25, 0.25, 0.25]
      ]
    }
  ];

  /** 平稳分布：对 P 做幂迭代（确定性计算，不用随机数） */
  function stationary(P) {
    let v = [0.25, 0.25, 0.25, 0.25];
    for (let it = 0; it < 300; it++) {
      const nv = [0, 0, 0, 0];
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) nv[j] += v[i] * P[i][j];
      v = nv;
    }
    return v;
  }

  const neglog2 = (p) => -Math.log2(Math.max(p, 1e-12));

  /** 在已揭示前缀 hist[0..upto) 上，统计 order 阶上下文的下一符号计数 */
  function ctxCounts(hist, upto, order) {
    const counts = [0, 0, 0, 0];
    if (upto < order) return { counts: counts, total: 0 };
    for (let t = order; t < upto; t++) {
      let match = true;
      for (let b = 1; b <= order; b++) if (hist[t - b] !== hist[upto - b]) { match = false; break; }
      if (match) counts[hist[t]]++;
    }
    let total = 0; for (let j = 0; j < K; j++) total += counts[j];
    return { counts: counts, total: total };
  }

  /** order 阶下一符号概率：父级用 order−1 阶，按伪计数回退（看得多 ≠ 压得好） */
  function estimate(hist, upto, order) {
    const parent = order === 0
      ? [1 / K, 1 / K, 1 / K, 1 / K]
      : estimate(hist, upto, order - 1);
    const c = ctxCounts(hist, upto, order);
    const out = [0, 0, 0, 0];
    for (let j = 0; j < K; j++) out[j] = (c.counts[j] + PRIOR * parent[j]) / (c.total + PRIOR);
    let s = 0; for (let j = 0; j < K; j++) s += out[j];
    for (let j = 0; j < K; j++) out[j] /= s;
    return out;
  }

  /** 第 t 个符号在「真实规律」下的概率（t=0 用平稳分布）→ 地板线 */
  function truthProb(api, t) {
    return t === 0 ? api._pi[api._seq[t]] : api._P[api._seq[t - 1]][api._seq[t]];
  }

  const argmax = (p) => { let b = 0; for (let j = 1; j < p.length; j++) if (p[j] > p[b]) b = j; return b; };

  /* ---------------- 几何常量（viewBox 720 × 348） ---------------- */
  const G = {
    perRow: 30, cell: 21, rowH: 24, stripX: 12, stripY: 46,
    barX: 12, barY: 132, barW: 300, barH: 24, barGap: 5,
    chart: { x: 372, y: 118, w: 332, h: 168 }
  };

  /* ---------------- 状态逻辑（模块级，避免挂到 spec 上） ---------------- */
  function gen(api) {
    const s = api.state;
    const T = TYPES[s.seqType];
    const pi = stationary(T.P);
    const rand = DK.rng(s.seed);
    const pick = (probs) => {
      let u = rand(), acc = 0;
      for (let j = 0; j < K; j++) { acc += probs[j]; if (u < acc) return j; }
      return K - 1;
    };
    const seq = [pick(pi)];
    for (let t = 1; t < s.sequenceLen; t++) seq.push(pick(T.P[seq[t - 1]]));
    api._seq = seq; api._pi = pi; api._P = T.P;
    api._stepYou = []; api._stepModel = []; api._stepFloor = [];
  }

  function restart(api) {
    const s = api.state;
    s.idx = 0; s.youBits = 0; s.modelBits = 0; s.floorBits = 0;
    s.hits = 0; s.lastSurprise = 0; s.lastGuess = -1; s.lastTruth = -1;
    gen(api);
    api.draw();
  }

  /** 换阶之后：用当前 modelClass 重算已揭示部分的每一步代价（不偷看未来） */
  function recomputeModel(api) {
    const s = api.state;
    let acc = 0;
    for (let t = 0; t < s.idx; t++) {
      const c = neglog2(estimate(api._seq, t, s.modelClass)[api._seq[t]]);
      api._stepModel[t] = c; acc += c;
    }
    s.modelBits = acc;
  }

  function guess(api, j) {
    const s = api.state;
    if (s.idx >= s.sequenceLen) return;
    const t = s.idx;
    const truth = api._seq[t];
    const pay = j === truth ? 1 : 3;       // 教学简化（真实代价 = −log₂ p）
    s.youBits += pay; api._stepYou[t] = pay;
    s.hits += (j === truth ? 1 : 0);
    s.lastGuess = j; s.lastTruth = truth;
    s.lastSurprise = neglog2(estimate(api._seq, t, s.modelClass)[truth]);
    s.modelBits += s.lastSurprise; api._stepModel[t] = s.lastSurprise;
    const fc = neglog2(truthProb(api, t));
    s.floorBits += fc; api._stepFloor[t] = fc;
    s.idx = t + 1;
    api.draw();
  }

  /** 让模型每步押自己最想押的符号（连续动画，尊重 prefers-reduced-motion） */
  function autoplay(api) {
    if (api.state.idx >= api.state.sequenceLen) return;
    api.animate((a) => {
      if (a.state.idx >= a.state.sequenceLen) return false;
      guess(a, argmax(estimate(a._seq, a.state.idx, a.state.modelClass)));
      return a.state.idx < a.state.sequenceLen;
    });
  }

  /* ---------------- 绘制：三个分组各自先清空，绝不跨帧堆积 ---------------- */
  function paintStrip(api, s, done) {
    const g = api.gStrip;
    while (g.firstChild) g.removeChild(g.firstChild);
    for (let t = 0; t < s.sequenceLen; t++) {
      const x = G.stripX + (t % G.perRow) * G.cell;
      const y = G.stripY + Math.floor(t / G.perRow) * G.rowH;
      const w = G.cell - 3, h = G.rowH - 8;
      if (t < s.idx) {
        /* 方块越浅 = 模型当时越意外（惊讶度映到热力档，4 bit 为「全浅」） */
        const heat = DK.clamp(1 - (api._stepModel[t] || 0) / 4, 0, 1);
        g.appendChild(DK.el('rect', { x: x, y: y, width: w, height: h, rx: 3, fill: DK.heatFill(heat) }));
        /* 同上：格子底色可能是 heat-3，符号文字要用反色墨。
           必须走 style 而不是 fill 属性——CSS 的 .demo-svg text{fill:…}
           优先级高于 SVG presentation attribute，用属性会被静默覆盖。 */
        g.appendChild(DK.el('text', {
          x: x + w / 2, y: y + h - 3, class: 't-sm', 'text-anchor': 'middle',
          style: 'fill:' + DK.heatInk(heat), text: SYM[api._seq[t]]
        }));
      } else {
        g.appendChild(DK.el('rect', {
          x: x, y: y, width: w, height: h, rx: 3, fill: 'var(--c-bg-sunken)',
          stroke: t === s.idx ? 'var(--c-accent)' : 'var(--c-line)',
          'stroke-width': t === s.idx ? 1.6 : .8
        }));
        if (t === s.idx) g.appendChild(DK.el('text', {
          x: x + w / 2, y: y + h - 3, class: 't-sm accent', 'text-anchor': 'middle', text: '?'
        }));
      }
    }
    /* 类型说明放在符号条上方的空行（stripY-6=40），与右侧「已揭示」同行不同列；
       原先放在 y=barY-14=118，与 y=122 的条形面板标题叠在一起 */
    g.appendChild(DK.el('text', { x: 12, y: G.stripY - 6, class: 't-xs faint', text: TYPES[s.seqType].desc }));
    g.appendChild(DK.el('text', {
      x: 600, y: G.stripY - 6, class: 't-xs', 'text-anchor': 'end',
      text: '已揭示 ' + s.idx + ' / ' + s.sequenceLen + (done ? ' · 本局结束' : ' · 待押') + '（越浅=模型越意外）'
    }));
  }

  function paintBars(api, s, modelP) {
    const gb = api.gBars;
    while (gb.firstChild) gb.removeChild(gb.firstChild);
    const maxP = Math.max(modelP[0], modelP[1], modelP[2], modelP[3]) || 1;
    const track = G.barW - 44;
    for (let j = 0; j < K; j++) {
      const y = G.barY + j * (G.barH + G.barGap);
      gb.appendChild(DK.el('text', { x: G.barX, y: y + 15, class: 't-sm', text: SYM[j] }));
      gb.appendChild(DK.el('rect', {
        x: G.barX + 18, y: y, width: track, height: G.barH - 8, rx: 3, fill: 'var(--c-bg-sunken)'
      }));
      gb.appendChild(DK.el('rect', {
        x: G.barX + 18, y: y, width: Math.max(2, track * (modelP[j] / maxP)), height: G.barH - 8, rx: 3,
        fill: DK.heatFill(modelP[j] / maxP),
        stroke: s.lastGuess === j ? 'var(--c-warn)' : (s.lastTruth === j ? 'var(--c-ok)' : 'var(--c-line-strong)'),
        'stroke-width': (s.lastGuess === j || s.lastTruth === j) ? 2 : .6
      }));
      /* 条内标签必须用反色墨：heat-3 在亮色主题是很深的蓝，
         默认的 var(--c-fg) 压上去只有 1.96:1。
         走 style 而非 fill 属性：CSS 的 .demo-svg text{fill:…} 优先级更高。 */
      gb.appendChild(DK.el('text', {
        x: G.barX + 24, y: y + 14, class: 't-xs',
        style: 'fill:' + DK.heatInk(modelP[j] / maxP),
        text: (modelP[j] * 100).toFixed(0) + '% → −log₂p ' + DK.fmt(neglog2(modelP[j]), 2) + ' bit'
      }));
    }
    gb.appendChild(DK.el('text', {
      x: G.barX, y: G.barY + K * (G.barH + G.barGap) + 8, class: 't-xs accent',
      text: '模型最想押 ' + SYM[argmax(modelP)] + ' ｜ 橙框=你上次押的 · 绿框=实际出现的'
    }));
  }

  function paintChart(api, s) {
    const gc = api.gChart;
    while (gc.firstChild) gc.removeChild(gc.firstChild);
    const C = G.chart, xMax = s.sequenceLen;
    const yMax = Math.max(FIXED * xMax, s.youBits) * 1.12;
    const px = (v) => C.x + (v / xMax) * C.w;
    const py = (v) => C.y + C.h - (v / yMax) * C.h;
    const yStep = yMax > 100 ? 40 : 20;
    for (let b = 0; b <= yMax; b += yStep) {
      gc.appendChild(DK.el('line', { x1: C.x, y1: py(b), x2: C.x + C.w, y2: py(b), class: 'grid', 'stroke-dasharray': '2 4' }));
      gc.appendChild(DK.el('text', { x: C.x - 6, y: py(b) + 3, class: 't-xs muted', 'text-anchor': 'end', text: String(b) }));
    }
    for (let n = 0; n <= xMax; n += 12) {
      gc.appendChild(DK.el('text', { x: px(n), y: C.y + C.h + 13, class: 't-xs muted', 'text-anchor': 'middle', text: String(n) }));
    }
    gc.appendChild(DK.el('text', { x: C.x + C.w, y: C.y + C.h + 25, class: 't-xs faint', 'text-anchor': 'end', text: '已揭示符号数 →' }));
    /* 定长基准：每符号 2 bit 的直线 */
    gc.appendChild(DK.el('line', {
      x1: px(0), y1: py(0), x2: px(xMax), y2: py(FIXED * xMax),
      stroke: 'var(--c-line-strong)', 'stroke-width': 2, 'stroke-dasharray': '5 4'
    }));
    gc.appendChild(DK.el('text', {
      x: px(xMax) - 2, y: py(FIXED * xMax) - 4, class: 't-xs muted', 'text-anchor': 'end', text: '定长（压缩率 1.00）'
    }));
    const curve = (costs, col) => {
      if (!costs.length) return;
      let acc = 0; const pts = [px(0) + ',' + py(0)];
      for (let t = 0; t < costs.length; t++) { acc += costs[t]; pts.push(px(t + 1) + ',' + py(DK.clamp(acc, 0, yMax))); }
      gc.appendChild(DK.el('polyline', { points: pts.join(' '), fill: 'none', stroke: col, 'stroke-width': 2.2 }));
    };
    curve(api._stepFloor, 'var(--c-ok)');
    curve(api._stepModel, 'var(--c-accent)');
    curve(api._stepYou, 'var(--c-warn)');
  }

  /* ---------------- 注册 ---------------- */
  DK.define('m01-shannon-game', {
    title: '猜下一个符号：每猜准一次，就少付一个比特',
    viewBox: [720, 348],

    state: {
      seqType: 0,          // 0 强规律 / 1 语言式 / 2 纯随机
      modelClass: 1,       // 模型看几个历史符号：0｜1｜2
      sequenceLen: 36,     // 这一局要猜多少个符号
      seed: 7,             // 随机种子（可复现）
      idx: 0, youBits: 0, modelBits: 0, floorBits: 0,
      hits: 0, lastSurprise: 0, lastGuess: -1, lastTruth: -1
    },

    /* ---------- 控件：每个都挂 key，否则「重置」还原不了 ---------- */
    controls(holder, api) {
      holder.appendChild(DK.select({
        key: 'seqType', label: '序列类型', value: String(api.state.seqType),
        options: TYPES.map((t, i) => ({ value: String(i), label: i + '·' + t.short })),
        on(v) { api.state.seqType = +v; restart(api); }
      }));
      holder.appendChild(DK.select({
        key: 'modelClass', label: '模型看几个历史符号', value: String(api.state.modelClass),
        options: [
          { value: '0', label: '0·只看整体频率' },
          { value: '1', label: '1·看前 1 个符号' },
          { value: '2', label: '2·看前 2 个符号' }
        ],
        on(v) { api.state.modelClass = +v; recomputeModel(api); api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'sequenceLen', label: '序列长度', min: 12, max: 60, step: 6,
        value: api.state.sequenceLen, unit: ' 个符号',
        on(v) { api.state.sequenceLen = v; restart(api); }
      }));
      holder.appendChild(DK.range({
        key: 'seed', label: '随机种子', min: 1, max: 40, step: 1,
        value: api.state.seed,
        on(v) { api.state.seed = v; restart(api); }
      }));

      /* 押注按钮组：动作而非参数，仍挂 key，让 reset 一并刷新可用态 */
      const wrap = document.createElement('div');
      wrap.className = 'demo__field';
      const lab = document.createElement('label');
      lab.textContent = '押下一个：';
      wrap.appendChild(lab);
      api._btns = SYM.map((ch, j) => {
        const b = DK.button(ch, () => guess(api, j));
        b.setAttribute('aria-label', '押 ' + ch + ' 是下一个符号');
        wrap.appendChild(b);
        return b;
      });
      wrap._dkKey = 'idx';
      wrap._dkRestore = () => { api.draw(); };
      holder.appendChild(wrap);
      holder.appendChild(DK.button('让模型替我押到底', () => autoplay(api), 'btn--ghost'));

      const ro = DK.readout([
        ['surprise', '这次模型的惊讶度', '—'],
        ['you', '你累计 (bit)', '0'],
        ['model', '模型累计 (bit)', '0'],
        ['floor', '理论地板 (bit)', '0'],
        ['ratio', '模型压缩率', '—'],
        ['acc', '你的命中率', '—']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    /* ---------- 静态骨架：只建一次 ---------- */
    build(svg, api) {
      svg.appendChild(DK.el('text', {
        x: 12, y: 15, class: 't-sm muted',
        text: '香农游戏：逐个符号押「下一个是什么」。押中记 1 bit，押错记 3 bit；四条累计线分得越开，说明规律越多。'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 30, class: 't-xs faint',
        text: '示意数据（合成序列）：由代码里写死的三条马尔可夫链生成，不是真实语料，也不是任何预训练模型的输出。'
      }));
      svg.appendChild(DK.el('text', { x: 12, y: 122, class: 't-xs faint', text: '模型对下一个符号的概率分配（此刻尚未揭示第 ' + (api.state.idx + 1) + ' 个）' }));
      svg.appendChild(DK.el('text', { x: G.chart.x, y: 106, class: 't-xs faint', text: '累计付出的比特（越低越省）' }));

      api.gStrip = DK.el('g'); svg.appendChild(api.gStrip);
      api.gBars = DK.el('g'); svg.appendChild(api.gBars);
      api.gChart = DK.el('g'); svg.appendChild(api.gChart);

      const LEG = [
        ['定长 2 bit/符号', 'var(--c-line-strong)'],
        ['理论地板', 'var(--c-ok)'],
        ['模型（计数估计）', 'var(--c-accent)'],
        ['你（押注）', 'var(--c-warn)']
      ];
      LEG.forEach(([txt, col], i) => {
        const lx = 12 + i * 116;
        svg.appendChild(DK.el('line', { x1: lx, y1: 338, x2: lx + 15, y2: 338, stroke: col, 'stroke-width': 2.4 }));
        svg.appendChild(DK.el('text', { x: lx + 19, y: 341, class: 't-xs muted', text: txt }));
      });
      /* 起点 486 + 这段文字必须落在 viewBox 宽 720 以内，否则末尾会被裁掉 */
      svg.appendChild(DK.el('text', {
        x: 486, y: 341, class: 't-xs faint',
        text: '1/3 bit 为教学简化；真实代价 −log₂ p 见第 ② 步'
      }));
    },

    draw(api) {
      if (!api._seq) gen(api);
      const s = api.state;
      const done = s.idx >= s.sequenceLen;
      const modelP = estimate(api._seq, s.idx, s.modelClass);
      paintStrip(api, s, done);
      paintBars(api, s, modelP);
      paintChart(api, s);

      if (api._ro) {
        const n = s.idx;
        api._ro.set('surprise', n ? DK.fmt(s.lastSurprise, 2) + ' bit' : '—');
        api._ro.set('you', n ? DK.fmt(s.youBits, 1) + ' / 定长 ' + DK.fmt(FIXED * n, 0) : '0');
        api._ro.set('model', n ? DK.fmt(s.modelBits, 1) : '0');
        api._ro.set('floor', n ? DK.fmt(s.floorBits, 1) : '0');
        api._ro.set('ratio', n ? DK.fmt(FIXED * n / Math.max(s.modelBits, 1e-9), 2) + ' 倍' : '—');
        api._ro.set('acc', n ? (100 * s.hits / n).toFixed(0) + '%' : '—');
      }
      (api._btns || []).forEach((b, j) => {
        b.disabled = done;
        b.setAttribute('aria-pressed', String(!done && s.lastGuess === j));
      });
    },

    onReset(api) { restart(api); },

    hint:
      '<strong>你能改什么：</strong>' +
      '「序列类型」∈ {0 强规律, 1 语言式, 2 纯随机}，换的是数据源本身的规律强度（三条一阶马尔可夫链的转移概率写死在代码里，理论地板分别约 0.6 / 1.45 / 2.0 bit/符号）；' +
      '「模型看几个历史符号」∈ {0, 1, 2}——0 = 只统计整体频率，1 = 统计「前 1 个 → 下一个」的搭配，2 = 前 2 个组成的上下文；这是模型唯一的超参数；' +
      '「序列长度」∈ [12, 60] 步长 6，单位「个符号」，同时是曲线横轴上限，含义是「让模型学多久」；' +
      '「随机种子」∈ [1, 40] 整数，同种子必得同一条序列（换种子 = 换一道同分布的新题，方便复现与比较）；' +
      'A/B/C/D 是押注（猜中 1 bit、猜错 3 bit，教学简化）。区间外的值控件不接受。<br>' +
      '<strong>拨动它你会看到：</strong>① 切到「纯随机」，绿线（地板）与虚线（定长）严格重合——压缩率的上限就是 1.00 倍，谁来了都省不下一个比特；而蓝线还会<strong>略高于</strong>虚线（实测 40 个种子里没有一个低于 0.74 倍）：在真噪声里硬找规律的猜测，比最笨的定长编码更费。' +
      '② 切到「强规律」，绿线立刻贴着横轴跑，蓝线与你的橙线一起往下掉（@36 个符号压缩率约 1.4–2.9 倍）。' +
      '③ 「模型看几个历史符号」从 0 抬到 1，蓝线才真正离开定长——只看整体频率≈定长（实测约 0.9–1.0 倍），因为频率里没有「下一个」的信息。' +
      '④ 在「语言式」上把阶从 1 抬到 2，蓝线<strong>全程更高</strong>（40 个种子里 0 个变好）：数据里本来没有二阶规律，上下文越窄命中次数越少，估计越退化成瞎猜——看得多 ≠ 压得好。<br>' +
      '<strong>对应机制段：</strong>第 ① 步（给下一个符号分配概率 = 左侧四条条形）、第 ② 步（条上的 −log₂p 就是这个符号的比特代价）、' +
      '第 ③ 步（绿线＝按真实规律的平均码长，即信息熵地板）、第 ④ 步（橙线高出蓝线那段＝你押错时多付的话）、' +
      '第 ⑤ 步（读数「模型压缩率」＝定长 ÷ 模型累计）、第 ⑥ 步（「纯随机」就是压不动的极端案例）、' +
      '第 ⑦ 步（0/1/2 阶与序列长度的取舍＝为什么模型要更大、数据要更多）。'
  });
})(window.AIPrinciples);
