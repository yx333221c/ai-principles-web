/* ==========================================================================
   m06-rnn-vanish.js · 梯度随距离衰减（DESIGN.md §4 表 M06 行 / §6.3）
   教学唯一目标：让读者亲手把「连乘 n 次」这件事看出形状 ——
     · 线性纵轴上 0.9^50 与 0 无法区分（这是读者最真实的错觉来源）
     · 对数纵轴上同一条曲线变成直线，斜率 = log10(λ)，指数衰减一眼可读
     · 「注意力捷径」是一条水平线：路径长度恒为 1，与距离无关
   诚实性声明（§2.2.4）：本演示不含任何真实模型权重，λ 是合成标量。
   真实网络里回传的是逐位置的雅可比矩阵连乘 ∏(W_h^⊤·diag(tanh′))，
   这里把它压成一个数 λ。λ 的严格口径是「取模之后的单步放大倍数」：矩阵正规时等于
   谱半径 ρ(W_h)=max|λᵢ|；非对称时只能用最大奇异值 σ_max 作上界（还可能先瞬态放大再衰减）。
   不要读作「最大的那个特征值」——内容页 content/modules/m06.html「λ 到底是什么」一段已按此订正。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  const N_MAX = 100;                     // 链条总长：固定 0–100，轴不随 n 抖动
  const W = 700, H = 420;
  const L = 62, R = 674, T = 48, B = 312;
  const PW = R - L, PH = B - T;
  const LIN_TOP = 1.6;                   // 线性模式纵轴上界（含 λ 上界 1.6）
  const MIN_SPAN = 1.2;                  // 对数模式最小跨度（数量级），防止 λ≈1 时压成一条线
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sup = (n) => String(n).split('').map(c => SUP[c] || c).join('');

  /** 科学计数法读数：小数区间直接给十进制，其余给 m×10^e */
  function sci(v) {
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(v));
    if (e >= -2 && e <= 2) return DK.fmt(v, Math.max(0, 2 - e));
    return (v / Math.pow(10, e)).toFixed(2) + '×10' + sup(e);
  }

  DK.define('m06-rnn-vanish', {
    title: '梯度随距离衰减',
    viewBox: [W, H],
    state: { lam: 0.9, n: 50, logAxis: false, shortcut: true, t: 0 },

    controls(holder, api) {
      holder.appendChild(DK.range({
        key: 'lam', label: '每步缩放 λ', min: 0.5, max: 1.6, step: 0.01,
        value: api.state.lam, fmt: v => v.toFixed(2),
        on(v) { api.state.lam = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'n', label: '回传段数 n', min: 1, max: N_MAX, step: 1,
        value: api.state.n, unit: ' 段',
        on(v) { api.state.n = v; api.state.t = Math.min(api.state.t, v); api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'logAxis', label: '对数纵轴', value: api.state.logAxis,
        on(v) { api.state.logAxis = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'shortcut', label: '注意力捷径对照', value: api.state.shortcut,
        on(v) { api.state.shortcut = v; api.draw(); }
      }));

      const btn = DK.button('▶ 播放（沿链条走一遍）', () => {
        if (api._playing) { api._stop(); return; }
        const reduce = window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {                          // 降级：直接落终点，不做连续动画
          api.state.t = api.state.n; api.draw(); return;
        }
        api._playing = true; api._btn.textContent = '■ 停止';
        api._t0 = Date.now(); api.state.t = 0;
        api.animate((a) => {
          const tt = (Date.now() - a._t0) / 1000 * 30;   // 每秒 30 步，n=100 约 3.3 秒
          if (tt >= a.state.n) { a.state.t = a.state.n; a.draw(); a._stop(); return false; }
          a.state.t = tt; a.draw(); return true;
        });
      });
      api._btn = btn; api._playing = false;
      api._stop = () => { api._playing = false; api._btn.textContent = '▶ 播放（沿链条走一遍）'; api.stopAnim(); };
      holder.appendChild(btn);

      const ro = DK.readout([
        ['val', 'λⁿ 幅度', ''],
        ['pct', '相对第 1 步', ''],
        ['cur', '当前 t / n', ''],
        ['cross', '衰减·爆炸步数', ''],
        ['path', '路径长度 RNN → 注意力', '']
      ]);
      api._ro = ro; api.host.appendChild(ro);
    },

    build(svg, api) {
      svg.appendChild(DK.el('text', {
        x: 12, y: 17, class: 't-sm muted',
        text: '梯度幅度 |g| = λⁿ：n 就是反向传播要连乘的次数（= 回传段数；若按「词」数，n 个词之间是 n−1 段）'
      }));
      svg.appendChild(DK.el('text', {
        x: 12, y: 32, class: 't-xs faint',
        text: '示意数据（合成）：真实网络里 λ 是权重矩阵连乘的单步放大倍数（谱半径 / 最大奇异值），这里简化成标量；只画幅度，不画方向'
      }));

      // 坐标轴框 + x 网格（静态，一次建好）
      const gFix = DK.el('g');
      gFix.appendChild(DK.el('line', { x1: L, y1: T, x2: L, y2: B, class: 'grid' }));
      gFix.appendChild(DK.el('line', { x1: L, y1: B, x2: R, y2: B, class: 'grid' }));
      for (let t = 0; t <= N_MAX; t += 20) {
        const x = L + t / N_MAX * PW;
        gFix.appendChild(DK.el('line', { x1: x, y1: T, x2: x, y2: B, class: 'grid grid--dash' }));
        gFix.appendChild(DK.el('text', { x: x, y: B + 14, class: 't-xs muted', 'text-anchor': 'middle', text: String(t) }));
      }
      gFix.appendChild(DK.el('text', {
        x: L + PW / 2, y: B + 28, class: 't-xs faint', 'text-anchor': 'middle',
        text: '回传段数 t →'
      }));
      svg.appendChild(gFix);

      // 纵轴刻度：固定 10 组复用，draw 只改位置与文字（§2.2.6 不堆积 DOM）
      api.yt = [];
      const gY = DK.el('g');
      for (let i = 0; i < 10; i++) {
        const line = DK.el('line', { x1: L, y1: T, x2: R, y2: T, class: 'grid grid--dash' });
        const text = DK.el('text', { x: L - 7, y: T, class: 't-xs muted', 'text-anchor': 'end', text: '' });
        gY.appendChild(line); gY.appendChild(text);
        api.yt.push({ line, text });
      }
      svg.appendChild(gY);
      /* 轴名与头部第二行（y=32）至少留 12px；原先 T-8=40 只差 8px，会叠印 */
      api.yName = DK.el('text', { x: 12, y: T - 2, class: 't-xs faint', text: '' });
      svg.appendChild(api.yName);

      // 1% 参考线
      api.line1 = DK.el('line', { x1: L, y1: B, x2: R, y2: B, class: 'grid grid--dash', stroke: 'var(--c-err)' });
      api.line1T = DK.el('text', { x: R - 4, y: B, class: 't-xs bad', 'text-anchor': 'end', text: '' });
      svg.appendChild(api.line1); svg.appendChild(api.line1T);

      // 三条线：捷径 / 全程淡色 / 已走过的亮色
      api.pShort = DK.el('polyline', { class: 'curve curve--muted', 'stroke-dasharray': '7 5', opacity: '.9' });
      api.pDim = DK.el('polyline', { class: 'curve', opacity: '.3' });
      api.pPlay = DK.el('polyline', { class: 'curve' });
      svg.appendChild(api.pShort); svg.appendChild(api.pDim); svg.appendChild(api.pPlay);

      api.vline = DK.el('line', { class: 'grid grid--dash', y1: T, y2: B, stroke: 'var(--c-line-strong)' });
      api.dot = DK.el('circle', { r: 4.5, class: 'warm' });
      api.ball = DK.el('circle', { r: 4, class: 'accent' });
      api.vlab = DK.el('text', { class: 't-xs' });
      api.ovf = DK.el('text', { x: L + 8, y: T + 14, class: 't-xs bad', text: '' });
      [api.vline, api.dot, api.ball, api.vlab, api.ovf].forEach(n => svg.appendChild(n));

      // 底部：串行代价（拍数）对比条
      const gB = DK.el('g');
      gB.appendChild(DK.el('text', { x: L, y: 356, class: 't-xs faint', text: '另一笔账：算完这 n 个位置需要几拍（墙钟时间，与幅度无关）' }));
      api.barA = DK.el('rect', { x: L, y: 362, width: 1, height: 11, class: 'warm', rx: 2 });
      api.barAt = DK.el('text', { x: L, y: 371, class: 't-xs', text: '' });
      api.barB = DK.el('rect', { x: L, y: 382, width: 1, height: 11, class: 'good', rx: 2 });
      api.barBt = DK.el('text', { x: L, y: 391, class: 't-xs', text: '' });
      [api.barA, api.barAt, api.barB, api.barBt].forEach(n => gB.appendChild(n));
      svg.appendChild(gB);
    },

    draw(api) {
      const s = api.state;
      const lam = Math.max(1e-6, s.lam);
      const eOf = (t) => t * Math.log10(lam);                  // log10 λ^t
      const eEnd = eOf(N_MAX);
      let hi = Math.max(0, eEnd), lo = Math.min(0, eEnd);
      if (s.logAxis) {
        const pad = Math.max(0.15, (MIN_SPAN - (hi - lo)) / 2);
        hi += pad; lo -= pad;
      }
      // 值 → 屏幕纵坐标
      const yOf = (v) => {
        if (!s.logAxis) return B - DK.clamp(v / LIN_TOP, 0, 1.02) * PH;
        const e = Math.log10(Math.max(v, 1e-320));
        return B - DK.clamp((e - lo) / (hi - lo), -0.02, 1.02) * PH;
      };
      const xOf = (t) => L + t / N_MAX * PW;

      // 纵轴刻度
      if (s.logAxis) {
        const span = hi - lo, step = Math.max(1, Math.ceil(span / 8));
        const start = Math.floor(hi / step) * step;
        let k = 0;
        for (let e = start; e >= Math.ceil(lo) && k < api.yt.length; e -= step, k++) {
          const y = yOf(Math.pow(10, e));
          api.yt[k].line.setAttribute('y1', y); api.yt[k].line.setAttribute('y2', y);
          api.yt[k].text.setAttribute('y', y + 3.5);
          api.yt[k].text.textContent = e === 0 ? '1' : '10' + sup(e);
          api.yt[k].line.setAttribute('visibility', 'visible');
          api.yt[k].text.setAttribute('visibility', 'visible');
        }
        for (; k < api.yt.length; k++) {
          api.yt[k].line.setAttribute('visibility', 'hidden');
          api.yt[k].text.setAttribute('visibility', 'hidden');
        }
        api.yName.textContent = '纵轴：log10|梯度|（每格一个数量级）';
      } else {
        const ticks = [0, 0.5, 1, 1.5];
        ticks.forEach((v, k) => {
          const y = yOf(v);
          api.yt[k].line.setAttribute('y1', y); api.yt[k].line.setAttribute('y2', y);
          api.yt[k].text.setAttribute('y', y + 3.5);
          api.yt[k].text.textContent = DK.fmt(v, v % 1 ? 1 : 0);
          api.yt[k].line.setAttribute('visibility', 'visible');
          api.yt[k].text.setAttribute('visibility', 'visible');
        });
        for (let k = ticks.length; k < api.yt.length; k++) {
          api.yt[k].line.setAttribute('visibility', 'hidden');
          api.yt[k].text.setAttribute('visibility', 'hidden');
        }
        api.yName.textContent = '纵轴：|梯度| 幅度（线性，0 到 ' + LIN_TOP + '）';
      }

      // 1% 参考线
      const y1p = yOf(0.01);
      api.line1.setAttribute('y1', y1p); api.line1.setAttribute('y2', y1p);
      api.line1.setAttribute('visibility', y1p > T - 1 && y1p < B + 1 ? 'visible' : 'hidden');
      api.line1T.setAttribute('y', y1p - 3);
      /* 标签必须放参考线【左端】。右端放不下的实测证据：n=100 且 λ=1 时 1% 线落到
         y=307，而曲线末端标签 t=100 |g|=… 的 x 被 clamp 到 556、y=304 —— 两个标签
         水平重叠 114px、垂直只差 3.4px，糊成一团。左端 x=L+4 起、约到 200，与右侧
         曲线标签（556 起）天然不相交；y 轴刻度在 x<L 一侧，也不相碰。 */
      api.line1T.setAttribute('x', L + 4);
      api.line1T.setAttribute('text-anchor', 'start');
      api.line1T.textContent = s.logAxis ? '只剩 1% 的那条线'
        : '1% 就在这里（离 0 只差 ' + DK.fmt(0.01 / LIN_TOP * PH, 1) + ' 像素）';

      // 曲线：全程淡色 + 播放段亮色
      const val = (t) => Math.pow(lam, t);
      let pts = '', play = '';
      const tCur = DK.clamp(s.t, 0, s.n);
      for (let t = 0; t <= N_MAX; t++) {
        pts += (t ? ' ' : '') + xOf(t).toFixed(1) + ',' + yOf(val(t)).toFixed(1);
        if (t <= tCur) play += (play ? ' ' : '') + xOf(t).toFixed(1) + ',' + yOf(val(t)).toFixed(1);
      }
      api.pDim.setAttribute('points', pts);
      api.pPlay.setAttribute('points', play || (xOf(0).toFixed(1) + ',' + yOf(val(0)).toFixed(1)));

      // 注意力捷径：路径长度恒为 1 → 幅度与 n 无关
      const yOne = yOf(1);
      api.pShort.setAttribute('points', xOf(0) + ',' + yOne + ' ' + xOf(N_MAX) + ',' + yOne);
      api.pShort.setAttribute('visibility', s.shortcut ? 'visible' : 'hidden');

      // 目标距离处的标记
      const vn = val(s.n);
      api.vline.setAttribute('x1', xOf(s.n)); api.vline.setAttribute('x2', xOf(s.n));
      api.dot.setAttribute('cx', xOf(s.n)); api.dot.setAttribute('cy', yOf(vn));
      api.ball.setAttribute('cx', xOf(tCur)); api.ball.setAttribute('cy', yOf(val(tCur)));
      const lab = 't=' + s.n + '  |g|=' + sci(vn) + (s.shortcut ? ' ｜ 捷径=1' : '');
      api.vlab.textContent = lab;
      api.vlab.setAttribute('x', DK.clamp(xOf(s.n) + 8, L + 4, R - 118));
      api.vlab.setAttribute('y', DK.clamp(yOf(vn) - 8, T + 10, B - 4));
      api.ovf.textContent = (!s.logAxis && vn > LIN_TOP) ? '↑ 已冲出线性轴上界 ' + LIN_TOP + '：切「对数纵轴」才看得下' : '';

      // 串行代价条
      const bw = DK.clamp(3 * s.n, 2, PW);
      api.barA.setAttribute('width', bw);
      api.barAt.setAttribute('x', L + bw + 8);
      api.barAt.textContent = 'RNN：前向 ' + s.n + ' 拍 + 反向 ' + s.n + ' 拍 = ' + (2 * s.n) + ' 拍，一步等一步';
      api.barB.setAttribute('width', 4);
      api.barBt.setAttribute('x', L + 12);
      api.barBt.textContent = '注意力：≈1 拍，全部位置同时算 —— 代价换成一张 n×n 的表（M07 第 ② 步）';

      // 读数
      if (api._ro) {
        api._ro.set('val', sci(vn));
        api._ro.set('pct', vn >= 0.01 ? DK.fmt(vn * 100, 1) + '%' : sci(vn * 100) + '%');
        api._ro.set('cur', DK.fmt(tCur, 0) + ' / ' + s.n);
        api._ro.set('path', s.n + ' 段 → 1 段');
        let cross;
        if (lam === 1) cross = 'λ=1 临界：既不衰减也不放大';
        else if (lam < 1) {
          const k = Math.ceil(Math.log(0.01) / Math.log(lam));
          cross = k + ' 步后只剩 1%';
        } else {
          const k = Math.ceil(Math.log(100) / Math.log(lam));
          cross = k + ' 步后放大到 100 倍';
        }
        api._ro.set('cross', cross);
      }
    },

    onReset(api) { if (api._stop) api._stop(); },

    hint: '<strong>你能改什么：</strong>' +
      '「每步缩放 λ」∈ [0.5, 1.6]，含义是反向传播每走一跳乘上的倍数（严格口径见画布上方的说明：' +
      '正规矩阵时是谱半径、一般矩阵时取最大奇异值，别读成「最大的特征值」）：' +
      'λ&lt;1 每跳缩小、λ&gt;1 每跳放大、λ=1 正好是临界点；' +
      '「回传段数 n」∈ [1, 100]，就是梯度要连乘的次数（n 个词之间是 n−1 段，本演示直接把 n 当作连乘次数）；' +
      '两个开关分别是「对数纵轴」与「注意力捷径对照」；' +
      '「播放」让小球从 t=0 沿链条走到 t=n，每跳打一个点。<br>' +
      '<strong>拨动它你会看到：</strong>线性轴上 λ=0.9 的第 50 步（0.9⁵⁰≈0.005）和「什么都没有」在像素上分不开——' +
      '切到对数轴，同一条曲线立刻变成直线，斜率就是 log₁₀λ，每 10 跳下降同一个数量级（λ=0.9 每 10 掉 0.46 个数量级，λ=0.5 每 10 掉约 3 个：0.5¹⁰≈1/1024）；' +
      '把 λ 拨到 0.98：100 跳后还剩 <strong>13%</strong>（0.98¹⁰⁰=0.1326），按本演示「只剩 1%」的判据要 <strong>228 跳</strong>——超出滑块上限 100，所以拨到头也看不到它归零。' +
      '这不是 bug，正是要你看见的那件事：λ 只要<strong>差一点点</strong>到 1，本演示最多 100 跳就吃不掉信号（要跌破 1% 得 228 跳，是上限的两倍多）；' +
      '反过来 λ=1.1 时第 5 跳就到 1.61，越过线性轴上界 1.6，曲线贴死在顶端再也看不出斜率（右边读数仍在涨，坏的是这条轴——切对数轴就恢复了）；' +
      '对照线永远是平的：注意力把任意两段压成一段，所以它的幅度与 n 无关。<br>' +
      '<strong>对应机制段：</strong>第 ⑤ 步（连乘次数 = 路径长度，这就是 λⁿ 那条曲线）、' +
      '第 ⑥ 步（门控做的事就是把关键路径上的 λ 拉近 1：曲线变平但仍要一站站走）、' +
      '第 ④ 步与底部那两条拍数条（串行是另一笔独立的时间账）、第 ⑦ 步（捷径对照线）。'
  });
})(window.AIPrinciples);
