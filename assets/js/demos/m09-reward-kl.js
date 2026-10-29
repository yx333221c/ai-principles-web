/* ==========================================================================
   m09-reward-kl.js · M09 演示：奖励与跑偏的拉锯（DESIGN.md §4 M09 / §6.3）

   画的是机制段第 ⑤ 步的目标函数 J = r − β·κ：
     q(κ) = exp(−((κ−0.30)/0.60)²)                 真实质量：先升（改进是真的）后塌缩
     r(κ) = q(κ) + ε·1.5·exp(−((κ−1.15)/0.75)²)    奖励模型给的分：漏洞峰在 κ≈1.15
     J(κ) = r(κ) − β·κ                              真正被优化的东西
   圆点 = J 的最高点 = 训练会停下的地方。纵轴与 κ 都是无量纲的教学刻度。

   这三条式子是**构造出来的**，常数经过挑选，使得行为符合公开讨论的 reward
   hacking 现象的定性形状：
     · ε=0 时 r ≡ q，「被钻空子的量」恒为 0 —— 跑偏的根源是 RM 的近似误差；
     · β 越小 κ* 越往右；ε=1 且 β≤0.2 时 κ* 落进塌缩区，r 还在涨而 q 已崩；
     · β=2 时 κ*=0，模型几乎没被改动；
     · κ*(β) 随 β 单调下降（默认 ε=0.55 已逐格复算：β=2→0.000、1.0→0.225、
       0.7→0.300、0.35→0.380、0→0.470），不会来回跳；argmax 用 400 段网格，
       κ* 的分辨率是 0.005，所以跳变量必是 0.005 的整数倍——实测最大跳变
       ε=0.55 时 0.030、ε=1 时 0.050（旧注释写的 0.038 既不是 0.005 的整数倍、
       也复现不出来，已按实算订正）。
     · q(κ*) 随 β 下降**不是单调的**：ε=0.55 下它从 β=2 的 0.779 升到 β≈0.70 的
       峰值 1.000，再降到 β=0 的 0.923。起点 κ=0 是「SFT 未后训练」的位置，
       本身不在 q 的峰上，所以适度放松缰绳确实能买到真改进。
   诚实性声明常驻画布顶部（契约 §2.2 第 4 条）。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* ---------------- 画布几何 ---------------- */
  const W = 700, H = 400;
  const PAD = { t: 96, r: 158, b: 42, l: 54 };
  const KMAX = 2.0;                    // 横轴上限：KL 距离
  const YMAX = 1.85, YMIN = -0.4;      // 纵轴范围：留一点负值区给 J 掉出图外的趋势
  const sc = DK.scales(0, KMAX, YMIN, YMAX, PAD)(W, H);

  /* ---------------- 示意模型的常数 ---------------- */
  const QK = 0.30, QW = 0.60;          // 真实质量峰的位置与宽度
  const RH = 1.5, RK = 1.15, RW = 0.75; // 漏洞收益的幅度 / 中心 / 宽度
  const THR = 0.6;                     // 塌缩阈：q 跌破峰值的 60%
  const bump = (k, c, w) => Math.exp(-((k - c) * (k - c)) / (w * w));

  const quality = (k) => bump(k, QK, QW);
  const reward = (k, eps) => quality(k) + eps * RH * bump(k, RK, RW);
  const objective = (k, eps, beta) => reward(k, eps) - beta * k;

  /** 网格取极值：区间固定，逐帧重算代价可忽略，也免去一维搜索的分支 */
  function argmax(fn, lo, hi) {
    let bestK = lo, bestV = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const k = lo + (hi - lo) * (i / 400);
      const v = fn(k);
      if (v > bestV) { bestV = v; bestK = k; }
    }
    return { k: bestK, v: bestV };
  }
  /** 采样一条曲线成 polyline 点位串（节点复用，只改 points） */
  function trace(fn) {
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const k = KMAX * (i / 200);
      pts.push(sc.px(k).toFixed(1) + ',' + sc.py(DK.clamp(fn(k), YMIN, YMAX)).toFixed(1));
    }
    return pts.join(' ');
  }
  /* 质量峰值与塌缩阈只依赖常数，与参数无关，算一次就够 */
  const QPEAK = argmax(quality, 0, KMAX);
  const COLLAPSE_K = (() => {
    for (let i = 0; i <= 800; i++) {
      const k = QPEAK.k + (KMAX - QPEAK.k) * (i / 800);
      if (quality(k) < QPEAK.v * THR) return k;
    }
    return KMAX;
  })();

  /* 三条线只有一档强调色，靠线型区分；图例的线型与曲线严格一致（§8.2 §13.1） */
  const CURVES = [
    { key: 'r', label: 'r(κ) 奖励模型给的分', dash: '6 3' },
    { key: 'q', label: 'q(κ) 真实质量', dash: '2 3' },
    { key: 'j', label: 'J(κ) = r − β·κ（被优化的目标）', dash: '10 3 2 3' }
  ];

  DK.define('m09-reward-kl', {
    title: '奖励与跑偏的拉锯',
    viewBox: [W, H],
    /* 初值即「重置」的归宿（契约 §2.2 第 5 条：状态只存 api.state） */
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
        key: 'mc', label: '标注塌缩（mode collapse）区域', value: api.state.mc,
        on(v) { api.state.mc = v; api.draw(); }
      }));

      const ro = DK.readout([
        ['kl', '最优 KL κ*', ''],
        ['r', '奖励分 r(κ*)', ''],
        ['q', '真实质量 q(κ*)', ''],
        ['gap', '被钻空子的量 r−q', ''],
        ['zone', '工作点所在区域', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      /* ---- 常驻的诚实性声明：写在画面上，不只写在文档里 ---- */
      svg.appendChild(DK.el('text', {
        x: 12, y: 18, class: 't-sm warm',
        text: '示意曲线：形状取自公开讨论的 reward hacking 现象，数值为编造，不是任何真实模型的测量结果'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 34, class: 't-xs faint',
        text: 'κ = 策略偏离参考模型的 KL 距离（无量纲，κ=0 即完全没被改动）· 分数为无量纲刻度，整体平移不改变结论'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 48, class: 't-xs faint',
        text: 'ε = 奖励模型与真实人类偏好之间的缺口 · 被优化的是 J，既不是 r 也不是 q —— 圆点是训练会停下的地方'
      }));

      /* ---- 图例（横排，线型与曲线一致） ---- */
      const lgX = [PAD.l, PAD.l + 190, PAD.l + 430];
      CURVES.forEach((c, i) => {
        const y = 68;
        svg.appendChild(DK.el('line', {
          class: i === 2 ? 'curve' : 'curve curve--muted', x1: lgX[i], y1: y, x2: lgX[i] + 24, y2: y,
          'stroke-dasharray': c.dash, 'stroke-width': i === 2 ? 3 : 2
        }));
        svg.appendChild(DK.el('text', { x: lgX[i] + 30, y: y + 4, class: 't-xs muted', text: c.label }));
      });

      /* ---- 坐标轴 ---- */
      const xTicks = [];
      for (let v = 0; v <= KMAX + 1e-9; v += 0.25) xTicks.push(+v.toFixed(2));
      const gAx = DK.el('g');
      DK.axis(gAx, sc, {
        xTicks: xTicks, xFmt: v => v.toFixed(2),
        yTicks: [0, 0.5, 1.0, 1.5], yFmt: v => v.toFixed(1),
        axisY: 0, xlabel: 'κ（策略偏离参考模型的 KL 距离）'
      });
      /* demo-kit 的刻度线用了 .grid-l（只在 .dgm 作用域内有定义），这里换成 demo 的 .grid */
      gAx.querySelectorAll('.grid-l').forEach(n => n.setAttribute('class', 'grid'));
      svg.appendChild(gAx);
      /* 零线与纵轴 */
      svg.appendChild(DK.el('line', { class: 'grid', x1: sc.px(0), y1: sc.py(0), x2: sc.px(KMAX), y2: sc.py(0), 'stroke-width': 1.5 }));
      svg.appendChild(DK.el('line', { class: 'grid', x1: sc.px(0), y1: sc.py(YMAX), x2: sc.px(0), y2: sc.py(YMIN) }));
      svg.appendChild(DK.el('text', { x: sc.px(0) + 3, y: sc.py(0) + 11, class: 't-xs faint', text: '分数 0' }));

      /* 图内一句说明：优化的是 J 的最高点 */
      svg.appendChild(DK.el('text', {
        x: sc.px(0) + 3, y: sc.py(YMAX) + 12, class: 't-xs muted',
        text: '优化 = 沿 J（点划线）找最高点'
      }));
      svg.appendChild(DK.el('text', {
        x: sc.px(0) + 3, y: sc.py(YMIN) - 4, class: 't-xs faint',
        text: 'J 低于 −0.4 后截断显示（β=2 时曲线右端会一路沉到画外）'
      }));

      /* ---- 三条曲线：各建一次，draw 只改 points（契约 §2.2 第 6 条：不堆积节点） ---- */
      api.lines = {};
      const gC = DK.el('g');
      CURVES.forEach((c, i) => {
        const p = DK.el('polyline', {
          class: i === 2 ? 'curve' : 'curve curve--muted',
          fill: 'none', 'stroke-dasharray': c.dash, 'stroke-width': i === 2 ? 3 : 2, points: ''
        });
        api.lines[c.key] = p;
        gC.appendChild(p);
      });
      svg.appendChild(gC);

      /* ---- 最优工作点：一个 <circle> + 一条垂线，随参数移动 ---- */
      api.drop = DK.el('line', { class: 'grid grid--dash', x1: 0, y1: 0, x2: 0, y2: 0 });
      svg.appendChild(api.drop);
      api.dot = DK.el('circle', { r: 5.5, fill: 'var(--c-accent)', stroke: 'var(--c-bg-elev)', 'stroke-width': 2 });
      svg.appendChild(api.dot);

      /* ---- 动态标注分组：每次 draw 先清空再画 ---- */
      api.gNotes = DK.el('g');
      svg.appendChild(api.gNotes);
    },

    draw(api) {
      const s = api.state;
      const eps = DK.clamp(s.eps, 0, 1);
      const beta = DK.clamp(s.beta, 0, 2);
      const g = api.gNotes;

      /* 曲线 */
      api.lines.r.setAttribute('points', trace(k => reward(k, eps)));
      api.lines.q.setAttribute('points', trace(k => quality(k)));
      api.lines.j.setAttribute('points', trace(k => objective(k, eps, beta)));
      api.lines.q.style.display = s.q ? '' : 'none';
      /* β=0 时 J 与 r 完全重合，把 r 让到背景上，免得读者以为只有一条线 */
      api.lines.r.setAttribute('opacity', beta < 1e-6 ? .35 : 1);

      /* 工作点 */
      const best = argmax(k => objective(k, eps, beta), 0, KMAX);
      const rStar = reward(best.k, eps);
      const qStar = quality(best.k);
      const gap = rStar - qStar;
      const bx = sc.px(best.k), by = sc.py(best.v);
      api.dot.setAttribute('cx', bx); api.dot.setAttribute('cy', by);
      api.drop.setAttribute('x1', bx); api.drop.setAttribute('x2', bx);
      api.drop.setAttribute('y1', by); api.drop.setAttribute('y2', sc.py(0));

      while (g.firstChild) g.removeChild(g.firstChild);

      /* 塌缩区（先画，压在曲线下层） */
      if (s.mc) {
        g.appendChild(DK.el('rect', {
          x: sc.px(COLLAPSE_K), y: sc.py(YMAX), width: sc.px(KMAX) - sc.px(COLLAPSE_K),
          height: sc.py(YMIN) - sc.py(YMAX), fill: 'var(--c-heat-1)', opacity: .5
        }));
        g.appendChild(DK.el('line', {
          class: 'grid grid--dash', x1: sc.px(COLLAPSE_K), y1: sc.py(YMAX), x2: sc.px(COLLAPSE_K), y2: sc.py(0)
        }));
        const cx = (sc.px(COLLAPSE_K) + sc.px(KMAX)) / 2;
        /* 这三行落在塌缩区的半透明色块【上面】，必须用随底色换的前景墨，不能用 warm/faint：
           warm(#925927) 压在 heat-1 半透明底(#d6d9f5) 上实测只有 4.10:1（<4.5），
           faint 带透明度更不够——正是 demo-kit.heatInk 注释记过的同一类坑（m01 黑字压
           heat-3 深蓝 1.96:1）。层级改用是否加粗表达，不牺牲对比度。默认 t-xs 用 --c-fg，
           对浅底 #d6d9f5 是深色近黑、对比 >7:1。 */
        g.appendChild(DK.el('text', {
          x: cx, y: sc.py(YMAX) + 26, class: 't-xs', 'text-anchor': 'middle', 'font-weight': '700',
          text: '塌缩区 mode collapse'
        }));
        g.appendChild(DK.el('text', {
          x: cx, y: sc.py(YMAX) + 38, class: 't-xs', 'text-anchor': 'middle',
          text: 'q 跌破峰值的 60%（κ>' + DK.fmt(COLLAPSE_K, 2) + '）'
        }));
        g.appendChild(DK.el('text', {
          x: cx, y: sc.py(YMAX) + 50, class: 't-xs', 'text-anchor': 'middle',
          text: '策略挤到少数几种高分写法上'
        }));
      }

      /* r 的峰值位置：模型「最会刷分」的地方 */
      const peak = argmax(k => reward(k, eps), 0, KMAX);
      g.appendChild(DK.el('line', {
        class: 'grid grid--dash', x1: sc.px(peak.k), y1: sc.py(0), x2: sc.px(peak.k), y2: sc.py(YMAX)
      }));
      g.appendChild(DK.el('text', {
        x: DK.clamp(sc.px(peak.k) - 3, PAD.l + 2, sc.px(KMAX) - 74), y: sc.py(0) - 5,
        class: 't-xs faint', 'text-anchor': 'end', text: 'r 峰值 κ=' + DK.fmt(peak.k, 2)
      }));

      /* 工作点标签：靠近右边界时改成右锚点，避免画出图外。
         κ* 与下方 r−q 两个标签原先 y 各算各的（max(py(YMAX)+12, by−15) 与
         py((rStar+qStar)/2)+3），实测 β=1 时落在 187.0 与 189.3 —— 同 x、垂直只差
         2.3px，而 t-xs 字高约 11，于是叠印 74×11。修法只动一处：κ* 的 y 提出来叫 kY，
         r−q 钉在 kY+15（> 字高），二者垂直必然分离，同侧同 x 不动 flip。
         （上一轮我曾把 κ* 整块挪到顶部带，结果撞上「优化 = 沿 J」且【初始态也撞】——
         挪标签前没先算清那一行已经放了什么，是自己造了回归，故回退重做。） */
      const flip = best.k > 1.25;
      const kY = Math.max(sc.py(YMAX) + 12, by - 15);
      g.appendChild(DK.el('text', {
        x: flip ? bx - 9 : bx + 10, y: kY,
        class: 't-xs accent', 'text-anchor': flip ? 'end' : 'start',
        text: 'κ*=' + DK.fmt(best.k, 2) + ' · J*=' + DK.fmt(best.v, 2)
      }));
      /* 从工作点竖直量到 r 与 q：这段落差就是被钻空子的量 */
      if (gap > 0.02) {
        g.appendChild(DK.el('line', {
          x1: bx, y1: sc.py(rStar), x2: bx, y2: sc.py(qStar),
          stroke: 'var(--c-warn)', 'stroke-width': 2, 'stroke-dasharray': '3 2'
        }));
        g.appendChild(DK.el('text', {
          x: flip ? bx - 9 : bx + 10, y: kY + 15,
          'text-anchor': flip ? 'end' : 'start', class: 't-xs', fill: 'var(--c-warn)',
          text: 'r−q=' + DK.fmt(gap, 2)
        }));
      }
      /* q 上的空心标记：让读者看得见「真实质量此刻在哪」 */
      g.appendChild(DK.el('circle', {
        cx: bx, cy: sc.py(qStar), r: 4, fill: 'none',
        stroke: 'var(--c-line-strong)', 'stroke-width': 2,
        style: s.q ? '' : 'display:none'
      }));

      /* 读数 */
      if (api._ro) {
        api._ro.set('kl', DK.fmt(best.k, 2));
        api._ro.set('r', DK.fmt(rStar, 2));
        api._ro.set('q', DK.fmt(qStar, 2));
        api._ro.set('gap', DK.fmt(gap, 2));
        let zone;
        if (beta < 1e-6) zone = '无约束：停在 r 的峰值';
        else if (best.k > COLLAPSE_K) zone = '塌缩区内：分数涨、质量崩';
        else if (best.k < 0.05) zone = '过度保守：几乎没动';
        else zone = '折中：q 仍在高位';
        api._ro.set('zone', zone);
      }
    },

    hint: '<strong>你能改什么：</strong>β ∈ [0, 2.00]，KL 惩罚系数，就是机制段公式 J = r − β·D<sub>KL</sub> 里的那根缰绳；' +
      '<strong>越大越保守</strong>（宁可分数低也要保住 SFT 模型的说话方式），<strong>越小越敢冒险刷分</strong>，β=0 等于不加约束。' +
      'ε ∈ [0, 1.00]，奖励模型「可被钻空子的程度」，即它与真实人类偏好之间的缺口：0 = 打分完全可信，1 = 漏洞最深。' +
      '两个开关：「显示真实质量曲线」画出与人类真正对齐的那条 q(κ)；「标注塌缩（mode collapse）区域」把 q 跌破峰值 60% 的 κ 区间涂出来。<br>' +
      '<strong>拨动它你会看到：</strong>① 圆点永远停在点划线 J 的最高处——被优化的既不是 r 也不是 q，这是全图最该先接受的一件事。' +
      '② 把 β 从 2.00 拖向 0：κ* 连续右移，r(κ*) 一路上涨（0.86 → 1.29），「被钻空子的量」持续变大；' +
      '而 q(κ*) 是<strong>先升后降</strong>——从 β=2 的 0.78 爬到约 β=0.70 的峰值 1.00，再滑向 β=0 的 0.92。' +
      '松缰绳前半段的上升是真的学到了改进，后半段的下降才是被漏洞拉走：这才是 reward hacking 的完整轨迹，不是一条单调刷分线。' +
      'ε=1、β≤0.2 时 κ*≈0.74–0.88，已经落进塌缩区，那里 q 只剩峰值的四到六成。' +
      '③ 把 ε 拖到 0：r 与 q 两条线完全重合，无论 β 多小，「被钻空子的量」恒为 0.00——<strong>跑偏的根源是奖励模型的近似误差，不是优化本身</strong>。' +
      '④ ε=0 且 β=0 时 κ*≈0.30，正落在 q 的峰值上：这就是「RM 足够准时，在线优化确实有用」的样子。' +
      '⑤ β=2.00 时 κ*=0，分数几乎不涨，是「过度保守、等于没做后训练」的另一端；ε=0.55 时把 β 从 0.35 调到 0.70，κ* 只从 0.38 挪到 0.30，而 q 反而升到峰值 1.00——这不是另一件事，正是 ② 那条「先升后降」曲线的左半段。所以最优的缰绳既不是越紧越好，也不是越松越好。<br>' +
      '<strong>对应机制段：</strong>第 ⑤ 步（目标函数 J = r − β·D<sub>KL</sub> 与 β 的两难）、' +
      '第 ⑦ 步（③：优化压力越大越会去找 RM 近似面之外的漏洞，表现为回答变长、变自信）、' +
      '以及直觉段那条失效边界（老师傅是学生教出来的，所以 ε>0 才谈得上刷分）。'
  });
})(window.AIPrinciples);
