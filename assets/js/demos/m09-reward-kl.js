/* ==========================================================================
   m09-reward-kl.js · M09 演示：奖励与跑偏的拉锯（DESIGN.md §4 M09 / §6.3）

   画的是机制段第 ⑤ 步的目标函数 J = r − β·κ。横轴 κ = 策略偏离参考模型的
   KL 距离，纵轴 = 分数。同轴上三条量：
     q(κ)        真实质量：小偏离有真实收益，偏离越大越塌缩（先升后降）
     r(κ)        奖励模型给的分 = q(κ) + ε 倍「钻漏洞收益」（峰值被推到更大的 κ）
     J(κ)=r−βκ   真正被优化的东西；圆点 = 它的最高点 = 训练会停下的地方
   「被钻空子的量」= r(κ*) − q(κ*)，即优化压力把 ε 那道缺口撑开的部分。

   诚实性声明（契约 §2.2 第 4 条）：画布顶部常驻一行「示意曲线…数值为编造」。
   形状取自公开讨论的 reward hacking 现象，函数形式与参数都是教学构造，
   不是任何真实模型的测量结果。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* ---------------- 画布几何 ---------------- */
  const W = 700, H = 400;
  const PAD = { t: 96, r: 158, b: 42, l: 54 };
  const KMAX = 2.0;      // 横轴上限（KL 距离，无量纲）
  const YMAX = 1.5;      // 纵轴上限（分数，无量纲；整体平移不影响结论）
  const sc = DK.scales(0, KMAX, 0, YMAX, PAD)(W, H);

  /* ---------------- 示意模型的常数（都有可讲出口的含义） ---------------- */
  const QA = 1.6;        // 真实质量的幅度
  const QC = 0.22;       // 收益上手有多快（κ 越小越主导）
  const QD = 0.9;        // 偏离带来的塌缩速率
  const EX = 0.9;        // 钻漏洞能刷出的分数上限（ε=1 时全额兑现）
  const EK = 1.6;        // 钻漏洞所需的偏离：再远就无处可钻
  const ES = 0.4;        // 漏洞窗口的宽度（平方项分母）

  /** 真实质量：不含任何「漏洞」成分 */
  const quality = (k) => QA * (k / (k + QC)) * Math.exp(-QD * k);
  /** 钻漏洞的虚高：在 κ≈EK 处最盛，与真实收益无关 */
  const exploit = (k, eps) => eps * EX * Math.exp(-((k - EK) * (k - EK)) / ES);
  /** 奖励模型给的分 = 真实收益 + 虚高；ε=0 时它与真实质量完全重合 */
  const reward = (k, eps) => quality(k) + exploit(k, eps);
  /** 被优化的目标 */
  const objective = (k, eps, beta) => reward(k, eps) - beta * k;

  const QMAX = argmaxOf((k) => quality(k), 0.001, KMAX).v;   // 质量峰值，用来定义塌缩阈

  /** 网格取极值：区间固定 400 点，逐帧重算代价可忽略，也免去一维搜索的分支 */
  function argmaxOf(fn, lo, hi) {
    let bestK = lo, bestV = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const k = lo + (hi - lo) * (i / 400);
      const v = fn(k);
      if (v > bestV) { bestV = v; bestK = k; }
    }
    return { k: bestK, v: bestV };
  }
  /** 采样一条曲线成 polyline 点位串（同一批节点复用，只改 points） */
  function trace(fn) {
    const pts = [];
    for (let i = 0; i <= 180; i++) {
      const k = KMAX * (i / 180);
      pts.push(sc.px(k).toFixed(1) + ',' + sc.py(DK.clamp(fn(k), 0, YMAX)).toFixed(1));
    }
    return pts.join(' ');
  }
  /** 真实质量掉到峰值一半以下的起点 */
  function collapseStart() {
    for (let i = 0; i <= 400; i++) {
      const k = KMAX * (i / 400);
      if (quality(k) < QMAX * 0.5) return k;
    }
    return KMAX;
  }

  /* 三条线靠虚线样式区分，颜色只有一档强调色（DESIGN.md §8.2） */
  const CURVES = [
    { key: 'r', label: 'r(κ) 奖励模型给的分', cls: 'curve curve--muted', dash: '6 3' },
    { key: 'q', label: 'q(κ) 真实质量', cls: 'curve curve--muted', dash: '2 3' },
    { key: 'j', label: 'J(κ)=r−β·κ 被优化的目标', cls: 'curve', dash: 'none' }
  ];

  DK.define('m09-reward-kl', {
    title: '奖励与跑偏的拉锯',
    viewBox: [W, H],
    /* 初值即 reset 的归宿（契约 §2.2 第 5 条：状态只放 api.state） */
    state: { beta: 0.35, eps: 0.55, q: true, mc: false },

    controls(holder, api) {
      holder.appendChild(DK.range({
        key: 'beta', label: 'β 缰绳系数', min: 0, max: 2, step: 0.05, value: api.state.beta,
        fmt: v => v.toFixed(2),
        on(v) { api.state.beta = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'eps', label: 'ε 可被钻空子程度', min: 0, max: 1, step: 0.05, value: api.state.eps,
        fmt: v => v.toFixed(2),
        on(v) { api.state.eps = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'q', label: '显示真实质量曲线', value: api.state.q,
        on(v) { api.state.q = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'mc', label: '标注塌缩区域', value: api.state.mc,
        on(v) { api.state.mc = v; api.draw(); }
      }));

      const ro = DK.readout([
        ['kl', '最优 KL κ*', ''],
        ['r', '奖励分 r(κ*)', ''],
        ['q', '真实质量 q(κ*)', ''],
        ['gap', '被钻空子的量', ''],
        ['zone', '工作点所在区域', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      /* 常驻的诚实性声明：写在画面上，不只写在文档里 */
      svg.appendChild(DK.el('text', {
        x: 12, y: 18, class: 't-sm warm',
        text: '示意曲线：形状取自公开讨论的 reward hacking 现象，数值为编造，不是任何真实模型的测量结果'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 34, class: 't-xs faint',
        text: 'κ = 策略偏离参考模型的 KL 距离（无量纲，κ=0 表示完全没被改动）· 纵轴 = 分数（无量纲，可整体平移）'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 48, class: 't-xs faint',
        text: 'ε = 奖励模型与真实人类偏好之间的缺口 · 被优化的是 J，不是 r，更不是 q —— 圆点是训练会停下的地方'
      }));

      /* 坐标轴与网格 */
      const xTicks = [];
      for (let v = 0; v <= KMAX + 1e-9; v += 0.25) xTicks.push(+v.toFixed(2));
      const gAx = DK.el('g');
      DK.axis(gAx, sc, {
        xTicks: xTicks, xFmt: v => v.toFixed(2),
        yTicks: [0, 0.25, 0.5, 0.75, 1.0, 1.25], yFmt: v => v.toFixed(2),
        axisY: 0, xlabel: 'κ（策略偏离参考模型的 KL 距离）'
      });
      /* demo-kit 的刻度线用 .grid-l（只在 .dgm 作用域里有定义），这里换成 demo 的 .grid */
      gAx.querySelectorAll('.grid-l').forEach(n => n.setAttribute('class', 'grid'));
      svg.appendChild(gAx);
      svg.appendChild(DK.el('line', { class: 'grid', x1: sc.px(0), y1: sc.py(0), x2: sc.px(KMAX), y2: sc.py(0) }));
      svg.appendChild(DK.el('line', { class: 'grid', x1: sc.px(0), y1: sc.py(0), x2: sc.px(0), y2: sc.py(YMAX) }));

      /* 三条曲线：build 里各建一次，draw 只改 points（契约 §2.2 第 6 条：不堆积节点） */
      api.lines = {};
      const gC = DK.el('g');
      CURVES.forEach(c => {
        const p = DK.el('polyline', { class: c.cls, fill: 'none', 'stroke-dasharray': c.dash, points: '' });
        api.lines[c.key] = p;
        gC.appendChild(p);
      });
      svg.appendChild(gC);

      /* 图例：线型与曲线一致，不靠颜色单独承载信息（§13.1） */
      const lgX = sc.px(KMAX) + 14;
      const gLg = DK.el('g');
      CURVES.forEach((c, i) => {
        const y = sc.py(YMAX) + 8 + i * 26;
        gLg.appendChild(DK.el('line', {
          class: c.cls, x1: lgX, y1: y, x2: lgX + 22, y2: y, 'stroke-dasharray': c.dash
        }));
        gLg.appendChild(DK.el('text', { x: lgX, y: y + 13, class: 't-xs muted', text: c.label }));
      });
      svg.appendChild(gLg);

      /* 最优工作点：一个 <circle> + 一条垂线，随参数移动 */
      api.drop = DK.el('line', { class: 'grid grid--dash', x1: 0, y1: 0, x2: 0, y2: 0 });
      svg.appendChild(api.drop);
      api.dot = DK.el('circle', { r: 5, fill: 'var(--c-accent)', stroke: 'var(--c-bg-elev)', 'stroke-width': 2 });
      svg.appendChild(api.dot);

      /* 动态标注分组：每次 draw 先清空再画 */
      api.gNotes = DK.el('g');
      svg.appendChild(api.gNotes);
    },

    draw(api) {
      const s = api.state;
      const eps = DK.clamp(s.eps, 0, 1);
      const beta = DK.clamp(s.beta, 0, 2);

      /* 曲线 */
      api.lines.r.setAttribute('points', trace(k => reward(k, eps)));
      api.lines.q.setAttribute('points', trace(k => quality(k)));
      api.lines.j.setAttribute('points', trace(k => objective(k, eps, beta)));
      api.lines.q.style.display = s.q ? '' : 'none';
      /* β=0 时 J 与 r 完全重合，把 r 让到背景上，免得读者以为只有一条线 */
      api.lines.r.setAttribute('opacity', beta < 1e-6 ? .4 : 1);

      /* 工作点 */
      const best = argmaxOf(k => objective(k, eps, beta), 0, KMAX);
      const bx = sc.px(best.k), by = sc.py(best.v);
      api.dot.setAttribute('cx', bx); api.dot.setAttribute('cy', by);
      api.drop.setAttribute('x1', bx); api.drop.setAttribute('x2', bx);
      api.drop.setAttribute('y1', by); api.drop.setAttribute('y2', sc.py(0));

      const rStar = reward(best.k, eps);
      const qStar = quality(best.k);
      const gap = rStar - qStar;

      const g = api.gNotes;
      while (g.firstChild) g.removeChild(g.firstChild);

      /* 塌缩区（放在最底层，先画） */
      const mcK = collapseStart();
      if (s.mc) {
        g.appendChild(DK.el('rect', {
          x: sc.px(mcK), y: sc.py(YMAX), width: sc.px(KMAX) - sc.px(mcK),
          height: sc.py(0) - sc.py(YMAX), fill: 'var(--c-heat-1)', opacity: .45
        }));
        g.appendChild(DK.el('line', {
          class: 'grid grid--dash', x1: sc.px(mcK), y1: sc.py(YMAX), x2: sc.px(mcK), y2: sc.py(0)
        }));
        g.appendChild(DK.el('text', {
          x: (sc.px(mcK) + sc.px(KMAX)) / 2, y: sc.py(YMAX) + 22, class: 't-xs warm',
          'text-anchor': 'middle', text: '塌缩区：q 已跌破峰值的一半'
        }));
        g.appendChild(DK.el('text', {
          x: (sc.px(mcK) + sc.px(KMAX)) / 2, y: sc.py(YMAX) + 34, class: 't-xs faint',
          'text-anchor': 'middle', text: '回答变长、变自信，内容开始空洞'
        }));
      }

      /* r 的峰值位置：模型「最会刷分」的地方 */
      const peak = argmaxOf(k => reward(k, eps), 0, KMAX);
      g.appendChild(DK.el('line', {
        class: 'grid grid--dash', x1: sc.px(peak.k), y1: sc.py(0),
        x2: sc.px(peak.k), y2: sc.py(YMAX), opacity: .9
      }));
      g.appendChild(DK.el('text', {
        x: DK.clamp(sc.px(peak.k) + 4, sc.px(0), sc.px(KMAX) - 60), y: sc.py(YMAX) + 12,
        class: 't-xs faint', text: 'r 的峰值 κ=' + DK.fmt(peak.k, 2)
      }));

      /* 工作点标签 + 从工作点到 r/q 的落差段 */
      const right = best.k > 1.05;
      g.appendChild(DK.el('text', {
        x: right ? bx - 8 : bx + 9, y: Math.max(sc.py(YMAX) + 12, by - 14),
        class: 't-xs accent', 'text-anchor': right ? 'end' : 'start',
        text: 'κ*=' + DK.fmt(best.k, 2) + ' · J*=' + DK.fmt(best.v, 2)
      }));
      if (gap > 0.015) {
        g.appendChild(DK.el('line', {
          x1: bx, y1: sc.py(rStar), x2: bx, y2: sc.py(qStar),
          stroke: 'var(--c-warn)', 'stroke-width': 2, 'stroke-dasharray': '3 2'
        }));
        g.appendChild(DK.el('text', {
          x: right ? bx - 8 : bx + 9, y: sc.py((rStar + qStar) / 2) + 3,
          class: 't-xs', fill: 'var(--c-warn)', 'text-anchor': right ? 'end' : 'start',
          text: '被钻空子 r−q=' + DK.fmt(gap, 2)
        }));
      }

      /* 读数 */
      if (api._ro) {
        api._ro.set('kl', DK.fmt(best.k, 2));
        api._ro.set('r', DK.fmt(rStar, 2));
        api._ro.set('q', DK.fmt(qStar, 2));
        api._ro.set('gap', DK.fmt(gap, 2));
        let zone;
        if (beta < 1e-6) zone = '无约束：停在 r 的峰值';
        else if (best.k < 0.12) zone = '过保守：几乎没敢动';
        else if (best.k > mcK) zone = '已落进塌缩区';
        else zone = '折中：质量还在涨';
        api._ro.set('zone', zone);
      }
    },

    hint: '<strong>你能改什么：</strong>β ∈ [0, 2.00]，KL 惩罚系数，即机制段公式 J = r − β·κ 里的那根缰绳；' +
      '越大越保守（宁可分数低也要保住 SFT 模型的说话方式），越小越敢冒险刷分，β=0 等于不加约束。' +
      'ε ∈ [0, 1.00]，奖励模型「可被钻空子的程度」，也就是它与真实人类偏好之间的缺口：0 = 打分完全可信，1 = 漏洞最深。' +
      '两个开关：「显示真实质量曲线」画出与人类真正对齐的那条 q(κ)；「标注塌缩区域」把 q 跌破峰值一半的 κ 区间涂出来。<br>' +
      '<strong>拨动它你会看到：</strong>① 圆点永远停在点划线 J 的最高处——被优化的既不是 r 也不是 q，读者得先接受这一点。' +
      '② 把 β 从 2.00 拖到 0：κ* 一路右移，读数里 r(κ*) 还在涨、q(κ*) 掉头向下、被钻空子的量持续变大，这就是 reward hacking 的完整轨迹；' +
      'β=0 时圆点直接坐在 r 的峰值 κ≈1.60，那里 q 早已跌破峰值一半。' +
      '③ 把 ε 拖到 0：r 与 q 两条线完全重合，被钻空子的量恒等于 0——<strong>跑偏的根源是奖励模型的近似误差，不是优化本身</strong>。' +
      '④ ε=0 且 β 也小时，κ* 落在 0.4 附近，正是 q 的峰值处：这就是「RM 足够准时，强化学习确实有用」的样子。' +
      '⑤ β=2 时圆点退回 κ≈0.15 附近，分数几乎不涨，是「过度保守、等于没做后训练」的另一端。<br>' +
      '<strong>对应机制段：</strong>第 ⑤ 步（J = r − β·D<sub>KL</sub> 这个目标函数，以及 β 的两难）、' +
      '第 ⑦ 步（③：优化压力越大越会去找 RM 近似面之外的漏洞）、' +
      '以及直觉段那条失效边界（老师傅是学生教出来的，所以 ε>0 才谈得上刷分）。'
  });
})(window.AIPrinciples);
