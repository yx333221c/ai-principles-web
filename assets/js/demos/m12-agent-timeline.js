/* ==========================================================================
   m12-agent-timeline.js · 旗舰演示：智能体循环回放（DESIGN.md §4 M12 / §6.2 档 C）

   画布分上下两层，共用同一个 p：
     上半：一条 5 轮 ReAct 轨迹的逐帧回放。每一格里 Thought 是文本、
           Action 是一段 JSON 文本、Observation 是程序执行后被塞回上下文的文本。
           读者要看见的是：模型那一侧从头到尾只在写字，没有任何箭头让它「动一次手」。
     左下：当前步的三段展开 + 这一步为什么这么走（机制段第 ②③⑤⑥ 步）。
     右下：p^N 连乘衰减曲线，并把「期望第几步开始偏」同时标到时间线与曲线图上。
   与 M06 呼应：那里的 λ⁹⁹ 是梯度连乘，这里的 p^N 是成功率连乘，同一条曲线。
   与 M10 呼应：底部窗口条随步数增长，第 ③ 段越来越长 ⇒ 循环深度受窗口约束。

   与内容文件的数值契约（content/modules/m12.html 机制段与图解 #2）：
     0.95^10 = 0.599 → 60%     0.90^10 = 0.349 → 35%
     跌破一半的步数：0.95 → 14（0.95^13=0.513、0.95^14=0.488）
                     0.90 → 7 （0.90^6=0.531、0.90^7=0.478）
     期望首次出错的步数 1/(1−p)：0.95 → 20 步、0.90 → 10 步、0.99 → 100 步（截到 20）
   演示里这两个量分开标注，避免读者把「跌破一半」与「期望出错」混为一谈。

    「一阶修正」开关（corr）的数值契约 —— 按代码实算重写：
      模型：每一步以恒定概率 CATCH = 0.5 把「本步的失手」当场纠正回来，于是
        p_eff = 1 − (1−p)(1−CATCH) = (1+p)/2，存活率仍是 p_eff^N —— **仍是指数，只是底数变大**。
        旧实现写成 p + 0.03(k−1) 逐步累加再钳到 1：p=0.95 时第 3 步起完全水平、10 步 93%，
        p=0.90 时 10 步 80%（契约却是 35%），演示出的恰是 myth 3 要破除的那个结论，已废弃。
      corr 关（纯 p^N）：p=0.95 → 10 步 60% / 15 步 46% / 20 步 36%，跌破一半第 14 步
                        p=0.90 → 10 步 35% / 15 步 21% / 20 步 12%，跌破一半第 7 步
      corr 开（p_eff） ：p=0.95 → p_eff=0.975 → 10 步 78% / 15 步 68% / 20 步 60%
                        p=0.90 → p_eff=0.950 → 10 步 60% / 15 步 46% / 20 步 36%，跌破一半第 14 步
                        p=0.99 → p_eff=0.995 → 10 步 95% / 15 步 93% / 20 步 90%（仍逐格下降）
                        p=0.80 → p_eff=0.900 → 10 步 35% / 15 步 21% / 20 步 12%，跌破一半第 7 步
      「20 步内跌破一半」在 p=0.95 + corr 下不再出现（灰虚线隐去，读数写「20 步内不会」）——
        这是「纠错把衰减变慢」的正确读法，不是「衰减停了」：曲线上每一步仍在往下走。
        阈值：corr 后 20 步内不再跌破一半 ⟺ p_eff > 0.5^(1/20) = 0.9659 ⟺ p > 0.932，
        按 0.01 步长的滑块就是 p ≥ 0.94 起（默认 p=0.95 正落在这一档）。
        整条滑块上的对照（纯 p → corr 后「跌破一半的步数」）：
          0.80→4 / 7、0.85→5 / 9、0.90→7 / 14、0.91→8 / 16、0.92→9 / 17、0.93→10 / 20、
          0.94→12 / 无、0.95→14 / 无、0.96→17 / 无、0.97 及以上两种口径都不跌破。
      期望首次出错步 1/(1−p_eff)：corr 下 0.95→40、0.90→20、0.99→200，一律截到 20；
        所以 p=0.90 + corr 时红标记从第 10 步挪到第 20 步（并标「已超出本轨迹 15 步」）。
      crit（红竖线 / 跑偏区 / 读数「期望第几步开始偏」）在 corr 开启后**同用修正后的 p_eff**：
        旧实现按纯 p 算，与实线两套口径同屏，红竖线与实线穿 50% 的位置互相矛盾。
      240 次固定种子重放（DK.rng(12007)、15 步）：corr 关 p=0.95→133 次失手、p=0.90→192 次；
        corr 开 p=0.95→65 次、p=0.90→133 次、p=0.99→14 次。理论值 240(1−p_eff^15)：
        纯 p=0.95→128.8、纯 p=0.90→190.6，与 133 / 192 同量级（抽样抖动）。
      边界：corr 只建模「纠错」这一个方向。正文承诺的另一头——早期错误留在上下文里
        污染后续输入、让后面的 p 更小——**不在这条曲线里**，见机制段第 ⑦ 步。

   诚实性（契约 §2.2 第 4 条）：轨迹是人工编排的样例，不是真实模型运行记录；
   概率模型为一阶近似。这句话常驻画布顶部，也写进 hint。
   契约遵守：所有控件挂 key；只用 DK.* 与 SVG；viewBox 逻辑坐标；
   draw() 不新建 DOM（节点在 build 里一次建好，之后只改属性与 opacity）；
   随机数走 DK.rng(seed)；文字均落在 viewBox 内（贴右边界者用 end 锚点）。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* ================= 画布几何（纵向间距由浏览器 getBBox 实测校准） ==========
     中文字身（em box）≈1.45×字号：9px 文字行距 ≥14px、10.5px 文字行距 ≥16px，
     否则相邻两行会互相压字。下面每个 Y 值都满足这条，且由 _tmp-m12-probe 验证。
     行序：13/29/43 顶部说明 → 52–158 时间线五格 → 170 状态 → 192 出错步标注
           → 202 分割线 → 216 面板标题 → 230–390 两栏内容 → 400 窗口条 → 424/437 脚注 */
  const W = 720, H = 444;
  const X0 = 10, NW = 128, GAP = 10, NY = 52, NH = 106;   // 时间线五格 → 右边缘 690
  const NX = (i) => X0 + i * (NW + GAP);                   // 10/148/286/424/562
  const SEG_TOP = 18, SEG_STEP = 30, HL_DY = -4, HL_H = 29, LINE_OFF = 8, LINE_STEP = 14;
  const Y = {
    pill: 170, critA: 176, critB: 182, critLab: 196, div: 204, title: 218,
    l1: 234, t0: 248, t1: 264, l2: 282, a0: 296, a1: 312, l3: 330,
    o0: 344, o1: 360, n1: 376, n2: 390,
    tick: 314, xlab: 328, cap1: 344, cap2: 358, cap3: 372,
    win: 400, winLab: 409, foot1: 424, foot2: 437
  };
  const LPX = 10;                                          // 左栏（x 10…372）
  const RPX = 386;                                         // 右栏（x 386…690）
  const PL = { x: 414, x1: 684, y: 226, y1: 302 };         // 曲线绘图区
  const WIN = { x: 78, w: 360, y: 400 };                   // 上下文窗口条（右端 438，给读数留出空位）
  const NMAX = 20;                                         // 曲线横轴上限（步）
  const TRACK = 15;                                        // 本轨迹总步数
  const LIMIT = 1200;                                      // 示意窗口上限（词元）
  const BASE_TOK = 320;                                    // 系统提示 + 任务本身
  const TRIALS = 240;                                      // 有限重放次数
  const PHASES = ['Thought（要不要查）', 'Action（查什么）', 'Observation（查到的结果）'];
  const QNAME = ['命中', '漏检', '脏命中'];

  /* ================= 轨迹数据（人工编排的示意样例） =========================
     每格三段各 2 行，按 t-xs(9px) 在 128px 内可容：中文 ≤13 字。
     obs / note 按检索质量三档各一份；FINAL 三档各一份。 */
  const ROUNDS = [
    {
      title: '第 1 轮 · 定时间',
      thought: ['它没有「现在」这个输入', '得先把日期取回来'],
      action: ['{"tool":"calendar",', '"date":"明天"}'],
      obs: [
        ['2026-10-24 周六', '日出 06:24 日落 17:41'],
        ['（返回空）', '窗口里仍没有「现在」'],
        ['2023-10-24 周二', '（旧缓存的那一页）']
      ],
      note: [
        ['这一步模型只做了一件事：输出一段可被解析的文本。', '执行的是外面的程序——它自己没有任何「动作」。'],
        ['检索器没取回日期，上下文里依然没有「现在」这个东西。', '接下来每一步都只能在缺输入的情况下猜。'],
        ['取回的是三年前同一页的快照：相似度极高，内容已经过期。', '模型没有独立的事实通道，它会照着这段文本往下写。']
      ]
    },
    {
      title: '第 2 轮 · 取观测',
      thought: ['跑步先看空气', '再查温度与风'],
      action: ['{"tool":"weather",', '"city":"北京"}'],
      obs: [
        ['AQI 156 中度污染', '气温 9℃ 风 3 级'],
        ['取回一条无关生活帖', '「秋天适合跑步呀」'],
        ['AQI 42 优', '（同一页的旧快照）']
      ],
      note: [
        ['Observation 被当作文本追加到末尾：下一词的分布因此被改写。', '这就是机制段第 ③④ 步——改输入，而不是改参数。'],
        ['语义相似但无关：检索器把关于跑步的闲聊当成证据送回来。', '相似度不等于相关性，这是机制段第 ⑥ 步说的「漏」。'],
        ['数字来自过期快照，格式完全正常，相似度分数还很漂亮。', '脏命中可怕的地方在于：它读起来和命中一模一样。']
      ]
    },
    {
      title: '第 3 轮 · 查依据',
      thought: ['还需要一条硬依据：', '中度污染能不能跑'],
      action: ['{"tool":"kb.search",', '"q":"AQI150 运动"}'],
      obs: [
        ['官方：AQI>150', '建议减少户外长跑'],
        ['检索到 0 条', '只能靠权重里的印象'],
        ['跑团帖：空气没问题', '（与官方结论相反）']
      ],
      note: [
        ['证据进了上下文，「别晨跑」一类候选的分数被抬高了。', '串回 M10 第 ③ 步：温度改不了排序，改输入可以。'],
        ['没有证据可抬，模型退回「最顺口的写法」——', '这正是 M10 第 ⑤ 步的幻觉来源：流畅永远比停下来划算。'],
        ['模型不知道哪条更权威：上下文里的字没有来源标签。', '它只会跟着已经写下的字继续往下写。']
      ]
    },
    {
      title: '第 4 轮 · 交叉核对',
      thought: ['证据只有一条', '再换个问法查一次'],
      action: ['{"tool":"kb.search",', '"q":"雾霾 晨跑"}'],
      obs: [
        ['第二个来源一致：', '改室内或 15:30 后'],
        ['又是空', '相似度 ≠ 相关性'],
        ['又是同一份快照', '同源重复＝假一致']
      ],
      note: [
        ['换问法再检索 = 给下一词分布再加一次独立证据。', '代价：多一步 = 多一次连乘，看右边那条线。'],
        ['两次都空手而归，但窗口里已经攒了一堆「查过了」的字。', '模型会把「查过」本身也当成依据的一部分。'],
        ['两条脏证据来自同一份快照：它们的一致是假的一致。', '去重与新鲜度是检索器的责任，模型帮不上忙。']
      ]
    },
    {
      title: '第 5 轮 · 下判断',
      thought: ['证据齐了，下判断', '（不再写请求单）'],
      action: ['{"tool":"none"}', '直接写 Final Answer'],
      obs: [
        ['窗口里证据齐了', '（无新观测）'],
        ['窗口里全是猜测', '（无新观测）'],
        ['两条脏证据并列', '（无新观测）']
      ],
      note: [
        ['循环的终止条件也只是「模型这一轮没再写 JSON」。', '没有任何外部裁判检查过它是否真的查对了。'],
        ['终止同样没有裁判：缺证据不会让它停下来先问一句。', '训练目标里没有「不确定时应当沉默」这一项（M10 ⑤）。'],
        ['终止时窗口里并列着两条互相矛盾的脏数据。', '它依然会给出一个连贯、自信、单一的答案。']
      ]
    }
  ];
  const FINAL = [
    ['明天别晨跑：AQI 156 属中度污染，两个来源都建议', '减少户外长跑；改室内，或等 15:30 之后再跑。'],
    ['北京秋天干爽，明早 6:30 是晨跑的好时机。', '——语气同样笃定，但窗口里没有任何今天的观测。'],
    ['明天 AQI 42，空气优，适合 6:30 晨跑。', '——跟着过期快照错，比漏检时更有底气：它的据是脏的。']
  ];

  /* ================= 数学：连乘衰减、临界步、有限重放、词元累积 ============ */
  /** 一阶修正的纠错强度：每一步有 CATCH 的概率把本步的失手当场纠正回来 */
  const CATCH = 0.5;
  /** 单步等效正确率。corr 下 p_eff = 1 − (1−p)(1−CATCH) = (1+p)/2：
      与 n 无关的**恒定**提升，所以存活率仍是 p_eff^N（仍是指数，只是底数变大）。
      旧写法 p+0.03(k−1) 随 k 累加并被钳到 1，从第 3 步起完全水平，已废弃。 */
  const pEff = (p, corr) => corr ? 1 - (1 - p) * (1 - CATCH) : p;
  /** 第 n 步「此前一路都对、且这一步也对」的概率 = p_eff^n */
  function surv(n, p, corr) {
    return Math.pow(pEff(p, corr), n);
  }
  /** 期望首次出错步 = 几何分布均值 1/(1−p_eff)（corr 开启后与曲线同口径） */
  const critStep = (p, corr) => Math.min(NMAX, Math.max(1, Math.round(1 / (1 - pEff(DK.clamp(p, 0.8, 0.99), corr)))));
  /** 曲线跌破 50% 的步数（与上面那个量不同，图上分开标注） */
  function halfStep(p, corr) {
    for (let n = 1; n <= NMAX; n++) if (surv(n, p, corr) < 0.5) return n;
    return null;
  }
  const px = (n) => PL.x + (DK.clamp(n, 1, NMAX) - 1) / (NMAX - 1) * (PL.x1 - PL.x);
  const py = (v) => PL.y1 - DK.clamp(v, 0, 1) * (PL.y1 - PL.y);
  const tracePts = (p, corr) => {
    const a = [];
    for (let n = 1; n <= NMAX; n++) a.push(px(n).toFixed(1) + ',' + py(surv(n, p, corr)).toFixed(1));
    return a.join(' ');
  };
  /** 有限次重放：把「p^N 有多大」变成可以数出来的次数。种子固定 ⇒ 同参数同结果 */
  function replay(trials, steps, p, corr, seed) {
    const r = DK.rng(seed);
    const q = pEff(DK.clamp(p, 0.8, 0.99), corr);   // 与曲线、红竖线同一个 p_eff
    let bad = 0, sumFirst = 0;
    for (let t = 0; t < trials; t++) {
      let first = 0;
      for (let k = 1; k <= steps; k++) {
        if (r() >= q) { first = k; break; }          // 这一步失手
      }
      if (first) bad++;
      sumFirst += first || steps + 1;
    }
    return { bad: bad, meanFirst: sumFirst / trials };
  }
  /* 词元数随步数增长：Observation 最长（机制段第 ③ 步的窗口约束；串回 M10 ⑥⑦）。
     一轮 = T 34 + A 26 + O（命中 88 / 漏检 44 / 脏命中 120）。
     打开「重复检索」时 O 再加 70（整段观测被重新抄一遍）：
       命中  1 轮 148 → 218：5 轮 1060 → 1410（顶破上限）
       脏命中 1 轮 180 → 250：5 轮 1220 → 1570（更早顶破）
       漏检  1 轮 104 → 174：5 轮  840 → 1190（涨得最慢，仍不溢出）
     这条对比就是「循环深度受窗口约束、而检索质量决定它有多快用满」的可视化。 */
  function tokensAt(f, q, loop) {
    let t = BASE_TOK;
    for (let k = 1; k <= f; k++) {
      const r = Math.ceil(k / 3), ph = k - 3 * (r - 1);
      let add = ph === 1 ? 34 : ph === 2 ? 26 : (q === 1 ? 44 : q === 2 ? 120 : 88);
      if (ph === 3 && loop) add += 70;                    // 重复检索：整段观测又抄一遍
      t += add;
    }
    return t;
  }

  DK.define('m12-agent-timeline', {
    title: '智能体循环回放',
    viewBox: [W, H],
    seed: 12,
    /* 初值 = 重置的归宿。f：0 未开始，1…15 = 5 轮 × 三段，16 = 最终答案 */
    state: { f: 0, p: 0.95, q: 0, auto: false, loop: false, corr: false, speed: 900 },

    controls(holder, api) {
      holder.appendChild(DK.button('◀ 上一步', () => {
        stopAuto(api); api.state.f = DK.clamp(api.state.f - 1, 0, 16); api.draw();
      }));
      holder.appendChild(DK.button('下一步 ▶', () => {
        stopAuto(api); api.state.f = DK.clamp(api.state.f + 1, 0, 16); api.draw();
      }));
      api._autoBtn = DK.toggle({
        key: 'auto', label: '自动播放', value: api.state.auto,
        on(v) { api.state.auto = v; if (v) startAuto(api); else api.stopAnim(); }
      });
      holder.appendChild(api._autoBtn);
      holder.appendChild(DK.range({
        key: 'p', label: '单步正确率 p ∈ [0.80, 0.99]', min: 0.8, max: 0.99, step: 0.01,
        value: api.state.p, fmt: v => v.toFixed(2),
        on(v) { api.state.p = v; api.draw(); }
      }));
      holder.appendChild(DK.select({
        key: 'q', label: '检索质量', value: String(api.state.q),
        options: [{ value: '0', label: '命中：取回今天的观测' },
                  { value: '1', label: '漏检：相似但无关 / 空' },
                  { value: '2', label: '脏命中：相似但已过期' }],
        on(v) { api.state.q = +v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'speed', label: '自动播放每步间隔 ∈ [300, 2000] ms', min: 300, max: 2000, step: 100,
        value: api.state.speed, fmt: v => (v / 1000).toFixed(1) + 's',
        on(v) { api.state.speed = v; }
      }));
      holder.appendChild(DK.toggle({
        key: 'loop', label: '重复检索（Observation 变长）', value: api.state.loop,
        on(v) { api.state.loop = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'corr', label: '加上「后面步骤能纠错」的一阶修正', value: api.state.corr,
        on(v) { api.state.corr = v; api.draw(); }
      }));

      const ro = DK.readout([
        ['f', '当前步（共 16 帧）', ''],
        ['phase', '这一段在做什么', ''],
        ['tok', '上下文已用词元', ''],
        ['succ', 'f 步之后全对的概率', ''],
        ['crit', '期望第几步开始偏', ''],
        ['drift', '是否已跑偏', ''],
        ['ans', '本轮答案的根据', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      /* ---- 顶部：常驻诚实性声明（只占左半，右侧留给帧标签） ---- */
      svg.appendChild(DK.el('text', { x: 10, y: 13, class: 't-sm warm',
        text: '示意编排：这条轨迹是人工写好的样例，不是真实模型的运行记录。' }));
      const h1 = DK.el('text', { x: 10, y: 28, class: 't-xs faint', text: '概率模型 p' });
      h1.appendChild(DK.el('tspan', { 'baseline-shift': 'super', 'font-size': '7px', text: 'N' }));
      h1.appendChild(DK.el('tspan', { text: ' 为一阶近似；Observation 一律按文本回填，模型自身不执行任何东西。' }));
      svg.appendChild(h1);
      svg.appendChild(DK.el('text', { x: 10, y: 42, class: 't-xs faint',
        text: '任务：北京明天适合跑步吗？给我一条建议（系统时间 2026-10-23 21:00）' }));
      api._frameTag = DK.el('text', { x: 690, y: 13, class: 't-sm accent', 'text-anchor': 'end', text: '' });
      api._phaseTag = DK.el('text', { x: 690, y: 28, class: 't-xs muted', 'text-anchor': 'end', text: '' });
      api._roundTag = DK.el('text', { x: 690, y: 42, class: 't-xs faint', 'text-anchor': 'end', text: '' });
      svg.appendChild(api._frameTag); svg.appendChild(api._phaseTag); svg.appendChild(api._roundTag);

      /* ---- 箭头定义（时间线共用） ---- */
      const defs = DK.el('defs');
      defs.appendChild(DK.el('marker', {
        id: 'm12-arw', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 5.5, markerHeight: 5.5, orient: 'auto'
      }, [DK.el('path', { d: 'M0 0 L8 4 L0 8 z', fill: 'var(--c-fg-muted)' })]));
      svg.appendChild(defs);

      /* ---- 时间线：5 个节点 × 3 段；节点数在 build 里一次固定 ---- */
      api.nodes = [];
      const gT = DK.el('g');
      ROUNDS.forEach((rd, i) => {
        const nx = NX(i);
        const g = DK.el('g');
        const box = DK.el('rect', { x: nx, y: NY, width: NW, height: NH, rx: 6, class: 'box' });
        g.appendChild(box);
        g.appendChild(DK.el('rect', { x: nx + 1, y: NY + 1, width: NW - 2, height: 14, rx: 5,
          fill: 'var(--c-bg-sunken)' }));
        const title = DK.el('text', { x: nx + NW / 2, y: NY + 11, class: 't-xs',
          'text-anchor': 'middle', text: rd.title });
        g.appendChild(title);
        /* 三段的高亮底色（先建好，draw 只改 opacity） */
        const hl = [0, 1, 2].map(k => {
          const r = DK.el('rect', { x: nx + 2, y: NY + SEG_TOP + k * SEG_STEP + HL_DY, width: NW - 4,
            height: HL_H, rx: 4, fill: 'var(--c-accent)', opacity: 0 });
          g.appendChild(r); return r;
        });
        /* 每段两行文本：T 常规、A 等宽、O 随检索质量变色 */
        const mkLines = (k, cls, mono) => [0, 1].map(j => {
          const t = DK.el('text', { x: nx + 6, y: NY + SEG_TOP + k * SEG_STEP + LINE_OFF + j * LINE_STEP,
            class: cls, text: '' });
          if (mono) t.setAttribute('font-family', 'var(--f-mono)');
          g.appendChild(t); return t;
        });
        const tLines = mkLines(0, 't-xs muted', false);
        const aLines = mkLines(1, 't-xs accent', true);
        const oLines = mkLines(2, 't-xs', false);
        const pill = DK.el('text', { x: nx + NW / 2, y: Y.pill, class: 't-xs faint',
          'text-anchor': 'middle', text: '' });
        g.appendChild(pill);
        /* 点一格 = 跳到它的 Observation（Tab 可达 + Enter） */
        const go = () => { stopAuto(api); api.state.f = i * 3 + 3; api.draw(); };
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', '跳到' + rd.title + '的 Observation');
        g.style.cursor = 'pointer';
        api.on(g, 'click', go);
        api.on(g, 'keydown', (ev) => { if (ev.key === 'Enter') go(); });
        gT.appendChild(g);
        api.nodes.push({ g: g, box: box, hl: hl, tLines: tLines, aLines: aLines, oLines: oLines, pill: pill });
      });
      svg.appendChild(gT);
      /* 节点之间的箭头（4 条，固定） */
      for (let i = 0; i < 4; i++) {
        const x = NX(i) + NW + 1;
        svg.appendChild(DK.el('line', { x1: x, y1: NY + NH / 2, x2: x + GAP - 3, y2: NY + NH / 2,
          stroke: 'var(--c-fg-muted)', 'stroke-width': 1.4, 'marker-end': 'url(#m12-arw)' }));
      }
      /* 期望出错步的时间线标记（一条竖线 + 一句标签，固定节点） */
      api._critLine = DK.el('line', { y1: Y.critA, y2: Y.critB, stroke: 'var(--c-err)', 'stroke-width': 2 });
      api._critLab = DK.el('text', { y: Y.critLab, class: 't-xs bad', 'text-anchor': 'middle', text: '' });
      svg.appendChild(api._critLine); svg.appendChild(api._critLab);

      /* ---- 左栏：当前步展开（固定行槽，只改 textContent 与 opacity） ---- */
      svg.appendChild(DK.el('line', { x1: LPX, y1: Y.div, x2: 690, y2: Y.div, class: 'grid' }));
      api._LTitle = DK.el('text', { x: LPX, y: Y.title, class: 't-sm muted', text: '' });
      svg.appendChild(api._LTitle);
      const lab = (y, txt) => svg.appendChild(DK.el('text', { x: LPX, y: y, class: 't-xs faint', text: txt }));
      const line = (y, cls, mono) => {
        const t = DK.el('text', { x: LPX, y: y, class: cls, text: '' });
        if (mono) t.setAttribute('font-family', 'var(--f-mono)');
        svg.appendChild(t); return t;
      };
      lab(Y.l1, '① Thought —— 模型写下的文本，此时还没有任何东西被执行');
      api._lt = [line(Y.t0, 't-sm'), line(Y.t1, 't-sm')];
      lab(Y.l2, '② Action —— 还是一段文本；把它解析并执行的是外部程序');
      api._la = [line(Y.a0, 't-sm accent', true), line(Y.a1, 't-sm accent', true)];
      lab(Y.l3, '③ Observation —— 执行结果转成文本，追加到上下文末尾');
      api._lo = [line(Y.o0, 't-sm'), line(Y.o1, 't-sm')];
      api._ln = [line(Y.n1, 't-xs warm'), line(Y.n2, 't-xs faint')];

      /* ---- 右栏：p^N 连乘衰减 ---- */
      const tt = DK.el('text', { x: RPX, y: Y.title, class: 't-sm muted', text: 'N 步之后仍然全对 = p' });
      tt.appendChild(DK.el('tspan', { 'baseline-shift': 'super', 'font-size': '8px', text: 'N' }));
      svg.appendChild(tt);
      svg.appendChild(DK.el('line', { class: 'grid', x1: PL.x, y1: PL.y1, x2: PL.x1 + 2, y2: PL.y1 }));
      svg.appendChild(DK.el('line', { class: 'grid', x1: PL.x, y1: PL.y - 2, x2: PL.x, y2: PL.y1 }));
      svg.appendChild(DK.el('line', { class: 'grid grid--dash', x1: PL.x, y1: py(0.5), x2: PL.x1, y2: py(0.5) }));
      [[1, '100%'], [0.5, '50%'], [0, '0']].forEach(v => {
        svg.appendChild(DK.el('text', { x: PL.x - 4, y: py(v[0]) + 3, class: 't-xs muted',
          'text-anchor': 'end', text: v[1] }));
      });
      [1, 5, 10, 15, 20].forEach(n => {
        svg.appendChild(DK.el('text', { x: px(n), y: Y.tick, class: 't-xs faint',
          'text-anchor': 'middle', text: String(n) }));
      });
      svg.appendChild(DK.el('text', { x: PL.x, y: Y.xlab, class: 't-xs faint',
        text: 'N = 任务步数（1 步 = 一轮 T→A→O）' }));
      /* 期望出错步之后的「跑偏区」底色：一个 rect，只改 x/width */
      api._zone = DK.el('rect', { y: PL.y - 2, height: PL.y1 - PL.y + 2, fill: 'var(--c-err)', opacity: 0.07 });
      svg.appendChild(api._zone);
      /* 四条曲线：固定节点，draw 只改 points 与 opacity */
      api._c95 = DK.el('polyline', { class: 'curve curve--muted', fill: 'none', 'stroke-dasharray': '5 3', 'stroke-width': 1.6, points: '' });
      api._c90 = DK.el('polyline', { class: 'curve curve--muted', fill: 'none', 'stroke-dasharray': '2 3', 'stroke-width': 1.6, points: '' });
      api._cpure = DK.el('polyline', { class: 'curve', fill: 'none', 'stroke-dasharray': '6 4', 'stroke-width': 1.6, opacity: 0, points: '' });
      api._ccur = DK.el('polyline', { class: 'curve', fill: 'none', 'stroke-width': 2.4, points: '' });
      [api._c95, api._c90, api._cpure, api._ccur].forEach(n => svg.appendChild(n));
      api._critV = DK.el('line', { stroke: 'var(--c-err)', 'stroke-width': 1.4, 'stroke-dasharray': '3 2', y1: PL.y - 2, y2: PL.y1 });
      api._halfV = DK.el('line', { stroke: 'var(--c-fg-faint)', 'stroke-width': 1, 'stroke-dasharray': '2 3', y1: py(0.5), y2: PL.y1 });
      svg.appendChild(api._critV); svg.appendChild(api._halfV);
      api._dot10 = DK.el('circle', { r: 3, fill: 'var(--c-warn)' });
      api._dotF = DK.el('circle', { r: 4, fill: 'var(--c-accent)', stroke: 'var(--c-bg-elev)', 'stroke-width': 1.4 });
      svg.appendChild(api._dot10); svg.appendChild(api._dotF);
      api._lab95 = DK.el('text', { class: 't-xs muted', text: '' });
      api._lab90 = DK.el('text', { class: 't-xs muted', 'text-anchor': 'end', text: '' });
      svg.appendChild(api._lab95); svg.appendChild(api._lab90);
      api._cap = [Y.cap1, Y.cap2, Y.cap3].map(y => DK.el('text', { x: RPX, y: y, class: 't-xs muted', text: '' }));
      api._cap.forEach(t => svg.appendChild(t));

      /* ---- 底部：上下文窗口条（随步数增长，串回 M10 第 ⑥⑦ 步） ---- */
      svg.appendChild(DK.el('text', { x: LPX, y: Y.winLab, class: 't-xs faint', text: '上下文窗口' }));
      svg.appendChild(DK.el('rect', { x: WIN.x, y: WIN.y, width: WIN.w, height: 12, rx: 3, fill: 'var(--c-bg-sunken)' }));
      api._winSegs = [0, 1, 2, 3, 4, 5].map(() => {
        const r = DK.el('rect', { y: WIN.y, height: 12, fill: 'var(--c-accent)', opacity: 0 });
        svg.appendChild(r); return r;
      });
      api._winMark = DK.el('line', { y1: WIN.y - 3, y2: WIN.y + 15, stroke: 'var(--c-warn)', 'stroke-width': 2 });
      svg.appendChild(api._winMark);
      api._winLab = DK.el('text', { x: 690, y: Y.winLab, class: 't-xs muted', 'text-anchor': 'end', text: '' });
      svg.appendChild(api._winLab);
      api._foot = [Y.foot1, Y.foot2].map(y => DK.el('text', { x: LPX, y: y, class: 't-xs faint', text: '' }));
      api._foot.forEach(t => svg.appendChild(t));
    },

    draw(api) {
      const s = api.state;
      const f = Math.round(DK.clamp(s.f, 0, 16));
      const p = DK.clamp(s.p, 0.8, 0.99);
      const q = s.q | 0;
      const corr = !!s.corr;
      const rd = f >= 16 ? 4 : Math.max(0, Math.ceil(f / 3) - 1);      // 当前轮下标
      const ph = f >= 16 ? 4 : (f === 0 ? 0 : f - 3 * Math.ceil(f / 3) + 3);
      const crit = critStep(p, corr);
      const half = halfStep(p, corr);
      const tok = tokensAt(Math.min(f, 15), q, s.loop);
      const overflow = tok > LIMIT;
      const rp = replay(TRIALS, TRACK, p, corr, 12007);

      /* ---------------- 时间线五格 ---------------- */
      ROUNDS.forEach((r, i) => {
        const nd = api.nodes[i];
        const reached = f >= i * 3 + 1;
        const isCur = f >= 1 && f <= 15 && i === rd;
        nd.g.style.opacity = reached ? 1 : 0.3;
        nd.box.setAttribute('stroke', isCur ? 'var(--c-accent)' : 'var(--c-line-strong)');
        nd.box.setAttribute('stroke-width', isCur ? 2.2 : 1.2);
        const ob = r.obs[q];
        nd.tLines.forEach((t, j) => { t.textContent = r.thought[j]; t.style.opacity = f >= i * 3 + 1 ? 1 : 0.25; });
        nd.aLines.forEach((t, j) => { t.textContent = r.action[j]; t.style.opacity = f >= i * 3 + 2 ? 1 : 0.25; });
        nd.oLines.forEach((t, j) => {
          t.textContent = ob[j];
          t.style.opacity = f >= i * 3 + 3 ? 1 : 0.25;
          /* 设色走 class，不走 fill 属性：`.demo-svg text{fill:var(--c-fg)}` 是
             类+元素选择器（特异度 0-1-1），会静默压掉 presentation attribute
             （0-0-0）。用属性设色等于没设——见 m13 演示文件头的同一条纪律。 */
          t.setAttribute('class', 't-xs ' + (q === 0 ? 'good' : q === 1 ? 'muted' : 'bad'));
        });
        [0, 1, 2].forEach(k => {
          const onPhase = isCur && ph === k + 1;
          const passed = f >= i * 3 + k + 1;
          nd.hl[k].setAttribute('opacity', onPhase ? 0.17 : passed ? 0.04 : 0);
        });
        const hasObs = f >= i * 3 + 3;
        nd.pill.textContent = hasObs ? 'Obs：' + QNAME[q] : '（尚未走到观测）';
        nd.pill.setAttribute('class', 't-xs ' + (hasObs ? (q === 0 ? 'good' : q === 1 ? 'muted' : 'bad') : 'faint'));
      });

      /* 期望出错步：落在 15 步轨迹内就指到具体格子，否则说明在本轨迹之外 */
      const cx = X0 + (DK.clamp(crit, 1, TRACK) - 0.5) / TRACK * (NX(4) + NW - X0);
      api._critLine.setAttribute('x1', cx.toFixed(1));
      api._critLine.setAttribute('x2', cx.toFixed(1));
      api._critLine.setAttribute('opacity', crit <= TRACK ? 1 : 0.35);
      api._critLab.textContent = '期望第 ' + crit + ' 步开始偏（1/(1−' + (corr ? 'p_eff' : 'p') + ')）' + (crit > TRACK ? ' · 已超出本轨迹 ' + TRACK + ' 步' : '');
      api._critLab.setAttribute('x', DK.clamp(cx, 190, 500).toFixed(1));

      /* ---------------- 左下：当前步展开 ---------------- */
      const R = ROUNDS[rd];
      api._LTitle.textContent = f === 0 ? '还没开始 —— 用「下一步 ▶」逐帧走，或打开自动播放'
        : (f === 16 ? '第 5 轮结束 —— 模型不再写请求单，直接输出最终答案' : R.title + '（15 步里的第 ' + f + ' 步）');
      const put = (node, txt, on) => { node.textContent = txt; node.style.opacity = on ? 1 : 0.3; };
      if (f === 0) {
        put(api._lt[0], '（还没走到）', false); put(api._lt[1], '', false);
        put(api._la[0], '（还没走到）', false); put(api._la[1], '', false);
        put(api._lo[0], '（还没走到）', false); put(api._lo[1], '', false);
        put(api._ln[0], '建议两条线各看一遍：① 把「检索质量」切到脏命中，再走到第 2 轮第 ③ 段；', true);
        put(api._ln[1], '② 把 p 从 0.95 拖到 0.90，看右图那个橙点与时间线上的红标记一起换档。', true);
      } else if (f === 16) {
        put(api._lt[0], FINAL[q][0], true); put(api._lt[1], FINAL[q][1], true);
        put(api._la[0], '（没有新的请求单：本轮直接写答案）', false); put(api._la[1], '', false);
        put(api._lo[0], '（没有新的观测被回填）', false); put(api._lo[1], '', false);
        put(api._ln[0], q === 0 ? '答案里每个数字都能指回第 1③/2③/3③/4③ 段的 Observation。'
          : q === 1 ? '答案流畅、自信、结构完整——可窗口里一条今天的观测都没有。'
          : '答案的每个数字都来自过期快照：RAG 把幻觉换成了「有据的错」。', true);
        put(api._ln[1], '换一档检索质量再看同一条轨迹：模型、参数、温度、提示词一个字都没改。', true);
      } else {
        const done = (k) => f >= rd * 3 + k;
        put(api._lt[0], R.thought[0], done(1)); put(api._lt[1], R.thought[1], done(1));
        put(api._la[0], R.action[0], done(2)); put(api._la[1], R.action[1], done(2));
        put(api._lo[0], R.obs[q][0], done(3)); put(api._lo[1], R.obs[q][1], done(3));
        put(api._ln[0], R.note[q][0], true);
        put(api._ln[1], R.note[q][1], true);
      }

      /* ---------------- 右下：p^N ---------------- */
      api._c95.setAttribute('points', tracePts(0.95, corr));
      api._c90.setAttribute('points', tracePts(0.90, corr));
      api._cpure.setAttribute('points', tracePts(p, false));
      api._ccur.setAttribute('points', tracePts(p, corr));
      api._cpure.setAttribute('opacity', corr ? 0.5 : 0);      // corr 关掉时两线重合
      const y95 = py(surv(10, 0.95, corr)), y90 = py(surv(10, 0.90, corr));
      api._dot10.setAttribute('cx', px(10).toFixed(1));
      api._dot10.setAttribute('cy', y90.toFixed(1));
      const nf = DK.clamp(Math.max(f, 1), 1, NMAX);
      api._dotF.setAttribute('cx', px(nf).toFixed(1));
      api._dotF.setAttribute('cy', py(surv(nf, p, corr)).toFixed(1));
      api._lab95.setAttribute('x', (px(10) + 5).toFixed(1));
      api._lab95.setAttribute('y', (y95 - 4).toFixed(1));
      api._lab95.textContent = '0.95→' + Math.round(surv(10, 0.95, corr) * 100) + '%';
      api._lab90.setAttribute('x', (px(10) - 6).toFixed(1));
      api._lab90.setAttribute('y', (y90 + 12).toFixed(1));
      api._lab90.textContent = '0.90→' + Math.round(surv(10, 0.90, corr) * 100) + '%';
      api._critV.setAttribute('x1', px(crit).toFixed(1));
      api._critV.setAttribute('x2', px(crit).toFixed(1));
      api._zone.setAttribute('x', px(crit).toFixed(1));
      api._zone.setAttribute('width', Math.max(0, PL.x1 - px(crit)).toFixed(1));
      if (half) {
        api._halfV.setAttribute('x1', px(half).toFixed(1));
        api._halfV.setAttribute('x2', px(half).toFixed(1));
        api._halfV.setAttribute('opacity', 1);
      } else api._halfV.setAttribute('opacity', 0);
      api._cap[0].textContent = (corr ? 'p_eff=' + pEff(p, true).toFixed(3) : 'p=' + p.toFixed(2)) +
        '：10 步全对 ' + Math.round(surv(10, p, corr) * 100) +
        '%，' + TRACK + ' 步 ' + Math.round(surv(TRACK, p, corr) * 100) + '%';
      api._cap[1].textContent = half ? '跌破一半在第 ' + half + ' 步（红竖线 = 期望出错第 ' + crit + ' 步，两者不同）'
        : '20 步内不跌破一半（红竖线 = 期望出错第 ' + crit + ' 步）';
      api._cap[2].textContent = corr ? '实线=p_eff^N　点划线=同一 p 纯 p^N　灰虚线=0.95/0.90 参照'
        : '实线=当前 p　点划线=同一 p 纯 p^N　灰虚线=0.95/0.90 参照';

      /* ---------------- 窗口条 ---------------- */
      const scale = WIN.w / LIMIT;
      const roundTok = (i) => tokensAt(i * 3, q, s.loop) - tokensAt((i - 1) * 3, q, s.loop);
      api._winSegs[0].setAttribute('x', WIN.x);
      api._winSegs[0].setAttribute('width', (Math.min(BASE_TOK, LIMIT) * scale).toFixed(1));
      api._winSegs[0].setAttribute('fill', 'var(--c-bg-code)');
      api._winSegs[0].setAttribute('opacity', 1);
      for (let i = 1; i <= 5; i++) {
        const doneRound = f === 16 || f >= i * 3;
        const start = Math.min(tokensAt((i - 1) * 3, q, s.loop), LIMIT);
        const w = doneRound ? Math.max(0, Math.min(LIMIT - start, roundTok(i))) * scale : 0;
        const r = api._winSegs[i];
        r.setAttribute('x', (WIN.x + start * scale).toFixed(1));
        r.setAttribute('width', w.toFixed(1));
        r.setAttribute('fill', 'var(--c-accent)');
        r.setAttribute('opacity', doneRound ? 0.55 : 0);
      }
      api._winMark.setAttribute('x1', (WIN.x + Math.min(tok, LIMIT) * scale).toFixed(1));
      api._winMark.setAttribute('x2', (WIN.x + Math.min(tok, LIMIT) * scale).toFixed(1));
      api._winLab.textContent = '已用 ' + tok + ' / ' + LIMIT + ' 词元' + (overflow ? '（溢出：最早几轮被挤出）' : '');
      /* 同样走 class 不走 fill 属性（`.demo-svg text` 会压掉属性），溢出时才变红 */
      api._winLab.setAttribute('class', 't-xs ' + (overflow ? 'bad' : 'muted'));

      /* ---------------- 底部脚注（左栏，不得伸到右面板下方） ---------------- */
      api._foot[0].textContent = '固定种子重放 ' + TRIALS + ' 次：' + rp.bad + ' 次在 ' + TRACK + ' 步内失手，'
        + '平均首次失手第 ' + rp.meanFirst.toFixed(1) + ' 步。';
      api._foot[1].textContent = '串回 M06：λ⁹⁹ 是梯度连乘，p^N 是成功率连乘，同一条曲线。';

      /* ---------------- 读数条 + 右上帧标签 ---------------- */
      if (api._ro) {
        api._ro.set('f', f + ' / 16');
        api._ro.set('phase', f === 0 ? '未开始' : (f === 16 ? 'Final Answer' : PHASES[ph - 1]));
        api._ro.set('tok', tok + (overflow ? '（已溢出）' : ''));
        api._ro.set('succ', f === 0 ? '—' : Math.round(surv(nf, p, corr) * 100) + '%');
        api._ro.set('crit', '第 ' + crit + ' 步（跌破一半：' + (half ? '第 ' + half + ' 步' : '20 步内不会') + '）');
        api._ro.set('drift', f < 1 ? '—' : (f < crit ? '未越过期望出错点'
          : (q === 2 ? '已越过，且内容已被脏证据污染' : '已越过第 ' + crit + ' 步')));
        api._ro.set('ans', q === 0 ? '有今天的观测' : q === 1 ? '无观测：退回权重里的印象' : '观测过期：照着错');
      }
      api._frameTag.textContent = '帧 ' + f + ' / 16';
      api._phaseTag.textContent = f === 0 ? '等待开始' : (f === 16 ? '输出最终答案' : PHASES[ph - 1]);
      api._roundTag.textContent = f === 0 ? '—' : (f === 16 ? '循环结束' : ROUNDS[rd].title);
    },

    onReset(api) {
      api.stopAnim();
      if (api._autoBtn) { api._autoBtn._val = false; api._autoBtn.setAttribute('aria-pressed', 'false'); }
    },

    /* ---------------- C 类动画契约：逐帧可 seek（DESIGN.md §6.3） ---------------- */
    frames(api) {
      return {
        total: 16,
        seek(i) { stopAuto(api); api.state.f = DK.clamp(Math.round(+i) || 0, 0, 16); api.draw(); }
      };
    },

    hint: '<strong>你能改什么：</strong>' +
      '<code>p ∈ [0.80, 0.99]</code> = 在前各步都对的前提下、本步也正确的概率（这是教学刻度，不是任何模型的实测分数）；' +
      '<code>检索质量 ∈ {命中, 漏检, 脏命中}</code> = 第 ③ 段 Observation 从外部拿回什么；' +
      '<code>每步间隔 ∈ [300, 2000] ms</code> = 自动播放节奏（reduced-motion 下降级为直接给终帧）；' +
      '两个开关：<em>重复检索</em>让 Observation 变长（看窗口条提前溢出），<em>一阶修正</em>把「每一步有恒定概率 0.5 把本步的失手纠正回来」加进连乘。' +
      '◀ ▶ 逐帧走，也可直接点任意一格跳到它的 Observation。<br>' +
      '<strong>拨动它你会看到：</strong>① 先逐帧走完第 1 轮：模型这一侧三次输出全是<strong>文本</strong>——Thought 是文本、' +
      'Action 是一段 JSON 文本、Observation 是程序执行完再把结果转成文本塞回来。' +
      '<em>没有任何一个箭头让模型动了一次手</em>，这就是「会说」变成「会做」的全部机制。' +
      '② 把 p 从 0.95 拖到 0.90（先别开一阶修正）：右图 10 步全对从 60% 掉到 35%，同时时间线上的红标记从第 20 步（轨迹之外）挪到第 10 步——' +
      '<em>你这条 15 步的轨迹从「大概能跑完」变成「跑不完」</em>；底部 240 次固定种子重放给的实测次数与这条线一致' +
      '（「平均首次失手」把 15 步内不失手的样本按第 16 步计入，所以它是删失后的下界）。' +
      '③ 打开「一阶修正」：它把底数从 p 抬到 p_eff = (1+p)/2，实线抬起而点划线（纯 p^N）不动——' +
      'p=0.95 时 10 步全对从 60% 升到 <strong>78%</strong>、15 步从 46% 升到 <strong>68%</strong>；p=0.90 时 10 步从 35% 升到 <strong>60%</strong>。' +
      '衰减会变慢，<strong>但不会变成不衰减</strong>：曲线每一步仍在往下走（p=0.99 修正后 10 步 95%、20 步 90%），' +
      'p=0.90 修正后跌破一半只是从第 7 步推迟到第 14 步；p 拨到 0.94 以上时修正后 20 步内才不再跌破一半、那条灰虚线才隐去' +
      '（默认 p=0.95 正落在这一档）。<em>步数依然是成本</em>。注意这个开关只建模「纠错」这一个方向；反向的修正——早期错误留在上下文里污染后续输入、' +
      '让后面的 p 更小——不在曲线里，见机制段第 ⑦ 步。' +
      '④ 切「漏检」：Observation 变空，最终答案流畅自信，却没有任何今天的观测，这是 M10 第 ⑤ 步的幻觉；' +
      '切「脏命中」：Observation 有内容、格式正常、分数很高，只是过期，答案反而<strong>更有底气地错</strong>。' +
      '⑤ 打开「重复检索」：窗口条一路涨到接近上限；在命中或脏命中档下它会顶破 1200 词元并标红「溢出」，' +
      '漏检档因为每次取回的内容更短，反而涨得最慢——<em>循环深度不是自由的，它受窗口长度约束</em>，' +
      '而循环本身只会往窗口里加字。（1200 是把五轮观测装进画面的示意刻度，真实窗口量级见 M10。）<br>' +
      '<strong>对应机制段：</strong>第 ②③ 步（工具调用 = 输出结构化文本、ReAct 循环与 Observation 回填）、' +
      '第 ④ 步（记忆三层：短期窗口 / 长期检索 / 程序性提示词）、' +
      '第 ⑤ 步（RAG 靠改输入给下一词分布重新加权）、第 ⑥ 步（检索漏、检索脏、上下文挤三类失效）、' +
      '第 ⑦ 步（p^N 连乘与误差累积）。顶部已声明：轨迹为人工编排的样例，概率模型为一阶近似。'
  });

  /* ================= 内部助手（不导出） ================= */
  /** 自动播放只走 api.animate(fn)，因此 prefers-reduced-motion 下自动降级 */
  function startAuto(api) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { goEnd(api); return; }                 // 降级：给终帧，逐帧按钮仍在
    if (api.state.f >= 16) api.state.f = 0;
    api._t0 = Date.now();
    api.animate(() => {
      if (!api.state.auto) return false;
      if (api.state.f >= 16) { stopAuto(api); return false; }
      if (Date.now() - api._t0 >= api.state.speed) { api._t0 = Date.now(); api.state.f += 1; api.draw(); }
      return true;
    });
  }
  function stopAuto(api) {
    api.state.auto = false;
    api.stopAnim();
    if (api._autoBtn) { api._autoBtn._val = false; api._autoBtn.setAttribute('aria-pressed', 'false'); }
  }
  function goEnd(api) {
    stopAuto(api);
    api.state.f = 16;
    api.draw();
  }
})(window.AIPrinciples);
