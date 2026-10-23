/* ==========================================================================
   m12-agent-timeline.js · 智能体循环回放（DESIGN.md §6.2 档 C / §4 M12）
   与内容文件的数值契约（content/modules/m12.html）：
     机制第 ⑥ 步与图解承诺 p=0.95 → 10 步 60%、p=0.90 → 10 步 35%、
     p=0.95 约第 14 步跌破一半、p=0.90 约第 7 步。已验算：
       0.95^10=0.5987  0.90^10=0.3487  0.95^14=0.4877  0.90^7=0.4783
     本演示用同一个 p^N 计算，读者拖动即可复现图上的数字。
   诚实性：这条轨迹是人工编排的样例，不是真实模型运行记录——画面上写明。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* 任务：「北京明天适合跑步吗？给我一条建议」 */
  const STEPS = [
    { t: ['要查明天天气'],
      a: ['weather(', '  北京, 明天)'],
      o: ['31℃ 湿度78%', '有雷阵雨'],
      tok: 86 },
    { t: ['再查空气质量'],
      a: ['aqi(北京)'],
      o: null,                       // 由「检索质量」决定
      tok: 74 },
    { t: ['查用户习惯'],
      a: ['memory.search(', '  "跑步习惯")'],
      o: ['习惯 6:30 晨跑'],
      tok: 63 },
    { t: ['汇总给建议'],
      a: ['final_answer(...)'],
      o: null,                       // 由「检索质量」决定
      tok: 58 }
  ];
  const N = STEPS.length;
  const RETRIEVE = {
    hit:   { name: '命中（返回今天的 AQI）', o: ['AQI 156', '中度污染'],
             ans: ['明早有雷雨且', '中度污染：建议', '改到室内，或', '傍晚复测再说'] },
    miss:  { name: '漏检（库里没有相关条目）', o: ['（无结果）'],
             ans: ['明早有雷雨，', '建议改期。', '——污染这一项', '它根本不知道'] },
    dirty: { name: '脏命中（返回上周的旧数据）', o: ['AQI 42（优）', '⚠ 是上周的'],
             ans: ['空气良好，', '明早 6:30', '适合照常晨跑。', '——错得很有把握'] }
  };
  const BASE_TOK = 24;               // 系统提示 + 用户问题
  const MAXN = 20;

  DK.define('m12-agent-timeline', {
    title: '智能体循环回放',
    viewBox: [720, 434],
    state: { step: 0, p: 0.95, ret: 'hit', play: false },

    controls(holder, api) {
      holder.appendChild(DK.range({
        key: 'step', label: '第几步', min: 0, max: N, value: 0,
        fmt: v => v === 0 ? '未开始' : '#' + v,
        on(v) { api.state.step = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'p', label: '单步正确率 p', min: 0.80, max: 0.99, step: 0.01, value: 0.95,
        fmt: v => v.toFixed(2),
        on(v) { api.state.p = v; api.draw(); }
      }));
      holder.appendChild(DK.select({
        key: 'ret', label: '检索质量', value: 'hit',
        options: Object.keys(RETRIEVE).map(k => ({ value: k, label: RETRIEVE[k].name })),
        on(v) { api.state.ret = v; api.draw(); }
      }));
      holder.appendChild(DK.button('上一步', () => { api.state.step = Math.max(0, api.state.step - 1); api.draw(); }));
      holder.appendChild(DK.button('下一步', () => { api.state.step = Math.min(N, api.state.step + 1); api.draw(); }));
      holder.appendChild(DK.toggle({
        key: 'play', label: '自动播放', value: false,
        on(v) {
          api.state.play = v;
          if (v) api.animate(a => {
            a.state.step = a.state.step >= N ? 0 : a.state.step + 1;
            a.draw(); return a.state.step < N;
          });
        }
      }));
      const ro = DK.readout([
        ['step', '当前步', ''], ['surv', '走到此步全对概率', ''],
        ['tok', '上下文已用词元', ''], ['half', '期望第几步开始偏', ''],
        ['ans', '最终建议', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      svg.appendChild(DK.el('text', { x: 12, y: 18, class: 't-sm muted',
        text: '任务：「北京明天适合跑步吗？给我一条建议」' }));
      svg.appendChild(DK.el('text', { x: 12, y: 34, class: 't-xs faint',
        text: '示意编排：这条轨迹是人工写好的样例，不是真实模型运行记录；p^N 为一阶近似。' }));

      /* 左侧四列时间线 */
      const COLW = 112, GAP = 6, X0 = 12, Y0 = 48;
      api.cols = [];
      for (let i = 0; i < N; i++) {
        const x = X0 + i * (COLW + GAP);
        const g = DK.el('g');
        const box = DK.el('rect', { x, y: Y0, width: COLW, height: 250, rx: 6,
          fill: 'var(--c-bg-elev)', stroke: 'var(--c-line-strong)', 'stroke-width': 1.4 });
        g.appendChild(box);
        const head = DK.el('text', { x: x + 8, y: Y0 + 17, class: 't-sm', text: '第 ' + (i + 1) + ' 步' });
        g.appendChild(head);
        const parts = [];
        const kinds = [['T 想', 'var(--c-accent)'], ['A 调', 'var(--c-warn)'], ['O 回', 'var(--c-ok)']];
        let yy = Y0 + 34;
        kinds.forEach(([lab, col], k) => {
          const tag = DK.el('text', { x: x + 8, y: yy + 10, class: 't-xs', fill: col, text: lab });
          g.appendChild(tag);
          const lines = [];
          for (let r = 0; r < 4; r++) {
            const t = DK.el('text', { x: x + 34, y: yy + 10 + r * 11, class: 't-xs muted' });
            g.appendChild(t); lines.push(t);
          }
          parts.push({ tag, lines, y0: yy });
          yy += 10 + 4 * 11 + 6;
        });
        svg.appendChild(g);
        api.cols.push({ g, box, head, parts, x, w: COLW });
      }
      /* 箭头 */
      for (let i = 0; i < N - 1; i++) {
        const x = X0 + (i + 1) * (COLW + GAP) - GAP + 1;
        svg.appendChild(DK.el('text', { x: x - 1, y: Y0 + 128, class: 't-sm faint', text: '→' }));
      }

      /* 右侧 p^N 曲线 */
      const C = api.chart = { x: 500, y: 52, w: 206, h: 190 };
      svg.appendChild(DK.el('text', { x: C.x, y: 40, class: 't-sm muted', text: 'N 步全对的概率 = pᴺ' }));
      svg.appendChild(DK.el('line', { x1: C.x, y1: C.y + C.h, x2: C.x + C.w, y2: C.y + C.h, class: 'grid' }));
      svg.appendChild(DK.el('line', { x1: C.x, y1: C.y, x2: C.x, y2: C.y + C.h, class: 'grid' }));
      [1, 0.5, 0].forEach(v => {
        const y = C.y + (1 - v) * C.h;
        svg.appendChild(DK.el('text', { x: C.x - 5, y: y + 3, class: 't-xs faint',
          'text-anchor': 'end', text: (v * 100) + '%' }));
        if (v === 0.5) svg.appendChild(DK.el('line', { x1: C.x, y1: y, x2: C.x + C.w, y2: y,
          class: 'grid', 'stroke-dasharray': '3 3' }));
      });
      svg.appendChild(DK.el('text', { x: C.x + C.w, y: C.y + C.h + 13, class: 't-xs faint',
        'text-anchor': 'end', text: 'N = ' + MAXN + ' 步' }));
      svg.appendChild(DK.el('text', { x: C.x, y: C.y + C.h + 13, class: 't-xs faint', text: 'N=1' }));
      api.curve = DK.el('polyline', { fill: 'none', stroke: 'var(--c-accent)', 'stroke-width': 2 });
      svg.appendChild(api.curve);
      api.ref95 = DK.el('polyline', { fill: 'none', stroke: 'var(--c-line-strong)', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' });
      svg.appendChild(api.ref95);
      api.mark = DK.el('circle', { r: 4.5, fill: 'var(--c-warn)', stroke: 'var(--c-bg)', 'stroke-width': 1.5 });
      svg.appendChild(api.mark);
      api.halfTick = DK.el('line', { stroke: 'var(--c-err)', 'stroke-width': 1.6, 'stroke-dasharray': '2 2' });
      svg.appendChild(api.halfTick);
      api.halfLabel = DK.el('text', { class: 't-xs bad', 'text-anchor': 'middle' });
      svg.appendChild(api.halfLabel);

      /* 曲线下方三行说明：行距必须 > 字高，否则与「跌破一半」标注重叠 */
      api.where = DK.el('text', { x: C.x, y: C.y + C.h + 46, class: 't-xs muted' });
      svg.appendChild(api.where);
      api.risk = DK.el('text', { x: C.x, y: C.y + C.h + 62, class: 't-xs' });
      svg.appendChild(api.risk);
      /* 底部提示 */
      svg.appendChild(DK.el('text', { x: 12, y: 424, class: 't-xs faint',
        text: 'T = 模型写下的想法　A = 模型输出的调用请求（只是文本）　O = 程序执行后塞回来的结果' }));
    },

    draw(api) {
      const s = api.state, R = RETRIEVE[s.ret];
      const px = (n) => api.chart.x + (n - 1) / (MAXN - 1) * api.chart.w;
      const py = (v) => api.chart.y + (1 - DK.clamp(v, 0, 1)) * api.chart.h;

      api.cols.forEach((col, i) => {
        const st = STEPS[i];
        const obs = i === 1 ? R.o : i === 3 ? R.ans : st.o;
        const content = [st.t, st.a, obs];
        /* s.step = 已执行完的步数（0…N）。
           第 i 列（0 基）：i < step 整列已完成；i === step 是「正在起草」的那一步——
           T/A 已由模型写出，O 必须等外面的程序执行完才有，所以留空。
           step=0 时没有任何一步开始，整排都是空的。 */
        const revealed = i < s.step;
        const running = s.step > 0 && s.step < N && i === s.step;
        col.box.setAttribute('stroke', running ? 'var(--c-accent)' : revealed ? 'var(--c-ok)' : 'var(--c-line)');
        col.box.setAttribute('stroke-width', running ? 2.2 : 1.4);
        col.box.setAttribute('opacity', (revealed || running) ? 1 : .45);
        col.head.setAttribute('font-weight', running ? 700 : 400);
        col.parts.forEach((p, k) => {
          const lines = content[k] || [];
          /* 正在起草的那一步：三段都要有内容，只是 O 显示占位而非结果 */
          const visible = revealed || running;
          p.tag.setAttribute('opacity', visible ? '1' : '.4');
          p.lines.forEach((t, r) => {
            if (!visible) { t.textContent = ''; return; }
            if (running && k === 2) { t.textContent = r === 0 ? '（等外面执行）' : ''; return; }
            t.textContent = lines[r] || '';
          });
        });
      });

      /* 曲线 */
      const curve = (p) => {
        const pts = [];
        for (let n = 1; n <= MAXN; n++) pts.push(px(n).toFixed(1) + ',' + py(Math.pow(p, n)).toFixed(1));
        return pts.join(' ');
      };
      api.curve.setAttribute('points', curve(s.p));
      api.ref95.setAttribute('points', curve(0.95));
      api.ref95.setAttribute('opacity', Math.abs(s.p - 0.95) < 0.001 ? 0 : .8);

      const nShown = Math.max(1, s.step);
      api.mark.setAttribute('cx', px(nShown).toFixed(1));
      api.mark.setAttribute('cy', py(Math.pow(s.p, nShown)).toFixed(1));
      api.mark.setAttribute('opacity', s.step === 0 ? .3 : 1);

      let half = null;
      for (let n = 1; n <= MAXN; n++) if (Math.pow(s.p, n) < 0.5) { half = n; break; }
      if (half) {
        api.halfTick.setAttribute('x1', px(half).toFixed(1)); api.halfTick.setAttribute('x2', px(half).toFixed(1));
        api.halfTick.setAttribute('y1', py(0.5).toFixed(1)); api.halfTick.setAttribute('y2', (api.chart.y + api.chart.h).toFixed(1));
        api.halfTick.setAttribute('opacity', 1);
        api.halfLabel.setAttribute('x', DK.clamp(px(half), api.chart.x + 22, api.chart.x + api.chart.w - 22).toFixed(1));
        api.halfLabel.setAttribute('y', (api.chart.y + api.chart.h + 26).toFixed(1));
        api.halfLabel.textContent = '第 ' + half + ' 步跌破一半';
      } else {
        api.halfTick.setAttribute('opacity', 0); api.halfLabel.textContent = '';
      }

      const usedTok = BASE_TOK + STEPS.slice(0, s.step).reduce((a, b) => a + b.tok, 0);
      const surv = s.step === 0 ? 1 : Math.pow(s.p, s.step);
      api.where.textContent = '本任务共 ' + N + ' 步；当前停在第 ' + (s.step || '—') + ' 步';
      api.risk.textContent = '走完 ' + N + ' 步全对概率 = ' + (Math.pow(s.p, N) * 100).toFixed(0) + '%';
      api.risk.setAttribute('fill', Math.pow(s.p, N) < 0.5 ? 'var(--c-err)' : 'var(--c-fg-muted)');

      if (api._ro) {
        api._ro.set('step', s.step === 0 ? '未开始' : s.step + ' / ' + N);
        api._ro.set('surv', (surv * 100).toFixed(0) + '%');
        api._ro.set('tok', String(usedTok));
        api._ro.set('half', half ? '第 ' + half + ' 步' : '20 步内不会');
        api._ro.set('ans', s.step < N ? '尚未产出' : (s.ret === 'dirty' ? '错误建议' : s.ret === 'miss' ? '漏掉污染' : '含污染提示'));
      }
    },

    hint: '<strong>你能改什么：</strong>「第几步」0–4（也可用「上一步 / 下一步」或自动播放）；' +
      '单步正确率 p ∈ [0.80, 0.99]（每一轮里模型自己写对请求、读对结果的概率）；' +
      '检索质量三档（命中 / 漏检 / 脏命中）。<br>' +
      '<strong>拨动它你会看到：</strong>① 逐步推进时，每一格的 O 都要等上一步执行完才回填——' +
      '模型自始至终只在做一件事：<em>输出文本</em>。查询、读库、执行都是外面的程序干的；' +
      '② 把检索质量切到<strong>脏命中</strong>：第 2 步的 O 变成「AQI 42（优）」，而它标着「是上周的」，' +
      '最终建议就跟着变成「适合照常晨跑」——错得很有把握。切到<strong>漏检</strong>，模型不是答错，' +
      '而是<strong>压根不知道还有污染这回事</strong>，给出一个看起来完整、实际缺了一项的回答；' +
      '③ 把 p 从 0.95 拖到 0.90：走完 4 步的全对概率从 81% 掉到 66%，而右图那条 50% 竖线' +
      '从第 14 步提前到第 7 步——这正是机制段第 ⑥ 步说的连乘，和 M06 里梯度衰减 0.9⁹⁹ ≈ 2.9×10⁻⁵ 是同一条数学。<br>' +
      '<strong>对应机制段：</strong>第 ①② 步（模型只输出文本、程序负责执行）、第 ⑤ 步（RAG 三类失效）、' +
      '第 ⑥ 步（p^N 连乘与误差累积）。'
  });
})(window.AIPrinciples);
