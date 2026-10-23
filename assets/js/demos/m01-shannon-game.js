/* ==========================================================================
   m01-shannon-game.js · M01 主演示：香农游戏（逐符号猜序列）
   演示键 = modules.json 里 m01.demo.id = 'm01-shannon-game'

   设计意图（DESIGN.md §4 M01 / §6.3）：把「猜得越准 → 付的比特越少 → 越可压缩」
   这条链做成可操作的。读者每押一个符号立刻结算；同一张画布上并列四条累计线
   （定长 / 理论地板 / 模型 / 你），四者分得越开，说明这段数据的规律越多。

   诚实性声明（§2.2 第 4 条）：
   · 序列是**合成数据**：三条一阶马尔可夫链，转移概率写在下面 TYPES 里，
     画面顶部常驻「示意数据（合成序列）」；不是真实语料，也不是任何模型的输出。
   · 「模型」不是预训练模型：它只对**已揭示的前缀**做计数 + 贝叶斯回退估计
     （0/1/2 阶由 modelClass 决定），绝不偷看后面的符号。
   · 「理论地板」用的是 TYPES 那套真实转移概率（只有造数据的人知道），
     所以它是这条序列在该规律下的下限，不是任何经验方法一定能达到的值。
   · 读者押注按 1/3 比特结算，是**教学简化**：真实做法是分配概率、付 −log₂ p
     （机制段第 ② 步）。这一点同时写在 demo 段与 hint 里。
   · 随机数走 DK.rng(seed)：同 seed 同参数必得同一序列，重置与刷新都可复现。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  const SYM = ['A', 'B', 'C', 'D'];
  const K = SYM.length;
  const FIXED = Math.log2(K);              // 定长基准 = 2 bit/符号
  const PRIOR = 1.2;                       // 回退伪计数强度（模型超参数）

  /* rows[上一符号][下一符号]：每行和为 1 */
  const TYPES = [
    {
      short: '强规律',
      desc: '强规律（A→B→C→D 循环，掺 3% 噪声）：只要盯住上一个符号就几乎不会错，地板极低。',
      P: [
        [0.03, 0.91, 0.03, 0.03],
        [0.03, 0.03, 0.91, 0.03],
        [0.03, 0.03, 0.03, 0.91],
        [0.91, 0.03, 0.03, 0.03]
      ]
    },
    {
      short: '语言式',
      desc: '语言式（偏斜转移）：有倾向但不决定，某些符号更常见、某些搭配更常见 → 中等压缩率。',
      P: [
        [0.10, 0.55, 0.25, 0.10],
        [0.35, 0.10, 0.45, 0.10],
        [0.20, 0.30, 0.10, 0.40],
        [0.45, 0.20, 0.25, 0.05]
      ]
    },
    {
      short: '纯随机',
      desc: '纯随机（四个各 1/4）：没有任何可预测性 → 地板 = 定长 = 2 bit/符号，压缩率 1.00 倍。',
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

  /** 在已揭示前缀 hist[0..upto) 上，统计某个阶的下一符号计数 */
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

  /** 第 t 个符号的「真实规律」概率（t=0 用平稳分布） */
  function truthProb(api, t) {
    return t === 0 ? api._pi[api._seq[t]] : api._P[api._seq[t - 1]][api._seq[t]];
  }

  /* ---------------- 几何常量（viewBox 720 × 344） ---------------- */
  const G = {
    perRow: 30, cell: 21, rowH: 24, stripX: 12, stripY: 46,
    barX: 12, barY: 128, barW: 300, barH: 25, barGap: 6,
    chart: { x: 372, y: 116, w: 332, h: 170 }
  };

  /* ---------------- 逻辑助手（模块级，避免挂到 spec 上） ---------------- */
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

  /** 换阶 / 换长度后：用当前 modelClass 重算已揭示部分 */
  function recomputeModel(api) {
    const s = api.state;
    s.modelBits = 0;
    for (let t = 0; t < s.idx; t++) {
      const c = neglog2(estimate(api._seq, t, s.modelClass)[api._seq[t]]);
      api._stepModel[t] = c;
      s.modelBits += c;
    }
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

  function autoplay(api) {
    if (api.state.idx >= api.state.sequenceLen) return;
    api.animate((a) => {
      if (a.state.idx >= a.state.sequenceLen) return false;
      const p = estimate(a._seq, a.state.idx, a.state.modelClass);
      let best = 0;
      for (let j = 1; j < K; j++) if (p[j] > p[best]) best = j;
      guess(a, best);
      return a.state.idx < a.state.sequenceLen;
    });
  }

  DK.define('m01-shannon-game', {
    title: '猜下一个符号：每猜准一次，就少付一个比特',
    viewBox: [720, 344],

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
        value: api.state.sequenceLen, unit: ' 个',
        on(v) { api.state.sequenceLen = v; restart(api); }
      }));
      holder.appendChild(DK.range({
        key: 'seed', label: '随机种子', min: 1, max: 40, step: 1,
        value: api.state.seed,
        on(v) { api.state.seed = v; restart(api); }
      }));

      /* 押注按钮组：动作而非参数，仍挂 key 让 reset 刷新可用态 */
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
        text: '香农游戏：逐个符号押「下一个是什么」。押中记 1 bit，押错记 3 bit；右下角四条累计线越分开，规律越多。'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 30, class: 't-xs faint',
        text: '示意数据（合成序列）：由代码里写死的三条马尔可夫链生成，不是真实语料，也不是任何预训练模型的输出。'
      }));
      svg.appendChild(DK.el('text', { x: 12, y: 120, class: 't-xs faint', text: '模型对下一个符号的概率分配（左边那格 = 你上次押的）' }));
      svg.appendChild(DK.el('text', { x: G.chart.x, y: 104, class: 't-xs faint', text: '累计付出的比特（越低越省）' }));

      api.gStrip = DK.el('g'); svg.appendChild(api.gStrip);
      api.gBars = DK.el('g'); svg.appendChild(api.gBars);
      api.gChart = DK.el('g'); svg.appendChild(api.gChart);

      /* 图例 + 简化声明（静态） */
      const LEG = [
        ['定长 2 bit/符号', 'var(--c-line-strong)'],
        ['理论地板', 'var(--c-ok)'],
        ['模型', 'var(--c-accent)'],
        ['你', 'var(--c-warn)']
      ];
      LEG.forEach(([txt, col], i) => {
        const lx = 12 + i * 112;
        svg.appendChild(DK.el('line', { x1: lx, y1: 330, x2: lx + 14, y2: 330, stroke: col, 'stroke-width': 2.4 }));
        svg.appendChild(DK.el('text', { x: lx + 18, y: 333, class: 't-xs muted', text: txt }));
      });
      svg.appendChild(DK.el('text', {
        x: 468, y: 333, class: 't-xs faint',
        text: '1/3 bit 是教学简化；真实代价 −log₂ p 见机制段第 ② 步。'
      }));
    },

    /* ---------- 每次状态变化重绘：分组先清空，不堆积 DOM ---------- */
    draw(api) {
      if (!api._seq) gen(api);
      const s = api.state;
      const done = s.idx >= s.sequenceLen;
      const modelP = estimate(api._seq, s.idx, s.modelClass);

      /* --- ① 序列条 --- */
      const g = api.gStrip;
      while (g.firstChild) g.removeChild(g.firstChild);
      for (let t = 0; t < s.sequenceLen; t++) {
        const col = t % G.perRow, row = Math.floor(t / G.perRow);
        const x = G.stripX + col * G.cell, y = G.stripY + row * G.rowH;
        const w = G.cell - 3, h = G.rowH - 8;
        if (t < s.idx) {
          /* 方块越浅 = 模型当时越意外（惊讶度映射到热力档） */
          const heat = DK.clamp(1 - (api._stepModel[t] || 0) / 4, 0, 1);
          g.appendChild(DK.el('rect', { x: x, y: y, width: w, height: h, rx: 3, fill: DK.heatFill(heat) }));
          g.appendChild(DK.el('text', {
            x: x + w / 2, y: y + h - 3, class: 't-sm', 'text-anchor': 'middle', text: SYM[api._seq[t]]
          }));
        } else {
          g.appendChild(DK.el('rect', {
            x: x, y: y, width: w, height: h, rx: 3,
            fill: 'var(--c-bg-sunken)', stroke: t === s.idx ? 'var(--c-accent)' : 'var(--c-line)',
            'stroke-width': t === s.idx ? 1.6 : .8
          }));
          if (t === s.idx) g.appendChild(DK.el('text', {
            x: x + w / 2, y: y + h - 3, class: 't-sm accent', 'text-anchor': 'middle', text: '?'
          }));
        }
      }
      g.appendChild(DK.el('text', {
        x: 12, y: G.barY - 42, class: 't-xs faint',
        text: TYPES[s.seqType].desc
      }));
      g.appendChild(DK.el('text', {
        x: 600, y: G.stripY - 4, class: 't-xs', 'text-anchor': 'end',
        text: '已揭示 ' + s.idx + ' / ' + s.sequenceLen + (done ? ' · 本局结束' : ' · 当前待押')
      }));

      /* --- ② 概率条形图 --- */
      const gb = api.gBars;
      while (gb.firstChild) gb.removeChild(gb.firstChild);
      const maxP = Math.max(modelP[0], modelP[1], modelP[2], modelP[3]) || 1;
      for (let j = 0; j < K; j++) {
        const y = G.barY + j * (G.barH + G.barGap);
        const track = G.barW - 40;
        gb.appendChild(DK.el('text', { x: G.barX, y: y + 16, class: 't-sm', text: SYM[j] }));
        gb.appendChild(DK.el('rect', {
          x: G.barX + 18, y: y, width: track, height: G.barH - 9, rx: 3, fill: 'var(--c-bg-sunken)'
        }));
        gb.appendChild(DK.el('rect', {
          x: G.barX + 18, y: y, width: Math.max(2, track * (modelP[j] / maxP)), height: G.barH - 9, rx: 3,
          fill: DK.heatFill(modelP[j] / maxP),
          stroke: s.lastGuess === j ? 'var(--c-warn)' : (s.lastTruth === j ? 'var(--c-ok)' : 'var(--c-line-strong)'),
          'stroke-width': (s.lastGuess === j || s.lastTruth === j) ? 2 : .6
        }));
        gb.appendChild(DK.el('text', {
          x: G.barX + 24, y: y + 14, class: 't-xs',
          text: (modelP[j] * 100).toFixed(0) + '% → −log₂p ' + DK.fmt(neglog2(modelP[j]), 2) + ' bit'
        }));
      }
      let arg = 0; for (let j = 1; j < K; j++) if (modelP[j] > modelP[arg]) arg = j;
      gb.appendChild(DK.el('text', {
        x: G.barX, y: G.barY + K * (G.barH + G.barGap) + 4, class: 't-xs accent',
        text: '模型最想押 ' + SYM[arg] + '（橙框=你上次押的，绿框=实际出现的）'
      }));

      /* --- ③ 累计比特曲线 --- */
      const gc = api.gChart;
      while (gc.firstChild) gc.removeChild(gc.firstChild);
      const C = G.chart;
      const xMax = s.sequenceLen;
      const yMax = FIXED * xMax * 1.12;
      const px = (v) => C.x + (v / xMax) * C.w;
      const py = (v) => C.y + C.h - (v / yMax) * C.h;
      const yStep = yMax > 90 ? 40 : 20;
      for (let b = 0; b <= yMax; b += yStep) {
        gc.appendChild(DK.el('line', {
          x1: C.x, y1: py(b), x2: C.x + C.w, y2: py(b), class: 'grid', 'stroke-dasharray': '2 4'
        }));
        gc.appendChild(DK.el('text', { x: C.x - 6, y: py(b) + 3, class: 't-xs muted', 'text-anchor': 'end', text: String(b) }));
      }
      for (let n = 0; n <= xMax; n += 12) {
        gc.appendChild(DK.el('text', { x: px(n), y: C.y + C.h + 13, class: 't-xs muted', 'text-anchor': 'middle', text: String(n) }));
      }
      gc.appendChild(DK.el('text', { x: C.x + C.w, y: C.y + C.h + 25, class: 't-xs faint', 'text-anchor': 'end', text: '已揭示符号数 →' }));
      /* 定长基准（虚线，从 0 到 2·n） */
      gc.appendChild(DK.el('line', {
        x1: px(0), y1: py(0), x2: px(xMax), y2: py(FIXED * xMax),
        stroke: 'var(--c-line-strong)', 'stroke-width': 2, 'stroke-dasharray': '5 4'
      }));
      gc.appendChild(DK.el('text', {
        x: px(xMax) - 2, y: py(FIXED * xMax) - 4, class: 't-xs muted', 'text-anchor': 'end', text: '定长 = 压缩率 1.00'
      }));

      const curve = (costs, col) => {
        if (!costs.length) return;
        let acc = 0; const pts = ['0,' + py(0)];
        for (let t = 0; t < costs.length; t++) { acc += costs[t]; pts.push(px(t + 1) + ',' + py(DK.clamp(acc, 0, yMax))); }
        gc.appendChild(DK.el('polyline', { points: pts.join(' '), fill: 'none', stroke: col, 'stroke-width': 2.2 }));
      };
      curve(api._stepFloor, 'var(--c-ok)');
      curve(api._stepModel, 'var(--c-accent)');
      curve(api._stepYou, 'var(--c-warn)');

      /* --- ④ 读数 --- */
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
      '「序列类型」∈ {0 强规律, 1 语言式, 2 纯随机}——换的是数据源的规律强度（三条马尔可夫链的转移概率写死在代码里）；' +
      '「模型看几个历史符号」∈ {0, 1, 2}（0 = 只统计整体频率，1 = 统计「前 1 个→下一个」的搭配，2 = 前 2 个；数字越大越吃样本）；' +
      '「序列长度」∈ [12, 60] 步长 6，单位「个符号」，同时是曲线横轴上限；' +
      '「随机种子」∈ [1, 40] 整数，同种子必得同一序列（改了就是换一道同分布的新题，便于复现与比较）；' +
      'A/B/C/D 是你的押注（猜中 1 bit、猜错 3 bit，教学简化）。合法区间外的值控件不接受。<br>' +
      '<strong>拨动它你会看到：</strong>切到「纯随机」，绿线（地板）与虚线（定长）重合，模型压缩率停在 1.00 倍——真随机一个比特都省不下来；' +
      '切到「强规律」，绿线立刻贴着横轴跑，你的橙线也一起下降；' +
      '把「看几个历史符号」从 1 调到 2，前十几个符号的蓝线会<strong>反而更高</strong>（上下文匹配不到几次，估计退化成瞎猜），' +
      '得把「序列长度」拉到 48 以上才反超——这条规律是「看得多 ≠ 压得好，规律要靠样本才挖得出来」。<br>' +
      '<strong>对应机制段：</strong>第 ① 步（给下一个符号分配概率 = 左侧四条条形）、第 ② 步（条上的 −log₂p 就是该符号的比特代价）、' +
      '第 ③ 步（绿线＝按真实规律的平均码长，即信息熵地板）、第 ④ 步（押错就还原不了：橙线高于绿线的那段差额＝你猜得不准）、' +
      '第 ⑤ 步（「模型压缩率」＝定长 ÷ 模型累计）、第 ⑥ 步（纯随机＝压不动的极端案例）、第 ⑦ 步（0/1/2 阶的取舍＝为什么模型要更大、数据要更多）。'
  });
})(window.AIPrinciples);
