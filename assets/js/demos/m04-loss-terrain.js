/* ==========================================================================
   m04-loss-terrain.js · 梯度下山地形的球（DESIGN.md §4 M04 / §6.3）
   ── 数值契约（改这里必须同步改 content/modules/m04.html）──
   内容文件演示段：「把学习率拨到 0.67 附近，看碗形什么时候开始弹飞——
   那是机制段第 ③ 步的不等式在纸上算出来的数」。
     L(θ)=½aθ² ⇒ θ ← (1 − lr·a)θ ⇒ 收敛需 |1 − lr·a| < 1 ⇒ lr < 2/a
   碗形取 a = 3 ⇒ 临界 lr = 2/3 = 0.667。实测（200 步内冲出画面）：
     lr=0.665 未发散 · 0.670 第 124 步发散 · 0.680 第 32 步 · 0.700 第 13 步
   ── 动量（实测，勿凭理论断言）──
   峡谷 a_x=0.05 / a_y=3（60:1），lr=0.30、200 步：
     β=0    → L=1.8e-4，横向只挪到 x=−0.085（几乎走不动）
     β=0.90 → L=1.9e-9，x=0（收敛）        ⇒ 动量加速的是【平坦方向】
     β=0.98 → L=4.8e-3，且停在 x=−0.191    ⇒ β 过大反而震荡变慢
   注意：在单个二次函数上动量会【放宽】稳定域（lr·a < 2(1+β)），
   所以本演示不说「动量吃掉安全余量」——那是错的。
   诚实性：地形是人工设定的二次/四次函数，不是真实损失面——画面上写明。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* loss 与 grad 互为解析导数（已用数值梯度逐点核对，最大偏差 < 1e-8） */
  const TERRAIN = {
    /* L = 1.5(x²+y²) ⇒ ∇L = (3x, 3y)；两轴曲率 a = 3 */
    bowl: {
      name: '碗形（凸，两轴曲率相同）',
      loss: (x, y) => 1.5 * (x * x + y * y),
      grad: (x, y) => [3 * x, 3 * y],
      crit: 2 / 3, start: [-1.75, 1.45],
      note: '两轴曲率都是 a = 3 ⇒ 临界 lr = 2/a = 0.67'
    },
    /* L = 1.5x² + 0.025y² ⇒ ∇L = (3x, 0.05y)；横向 a=3 陡、纵向 a=0.05 平 ⇒ 60:1
       轴向与内容文件的图解面板 A 一致（那张图画的是「横向每步撞壁、纵向推进不到 5%」），
       也与机制段第 ⑤ 步「横向往复被抹平，纵向推进被放大」一致。 */
    canyon: {
      name: '峡谷（各向异性 60:1：横陡纵平）',
      loss: (x, y) => 1.5 * x * x + 0.025 * y * y,
      grad: (x, y) => [3 * x, 0.05 * y],
      crit: 2 / 3, start: [-1.75, 1.45],
      note: '横向 a = 3、纵向 a = 0.05 ⇒ 临界 lr 由最陡的横轴决定 = 0.67'
    },
    /* L = −2.25x² + 0.525x⁴ + 4.5y² + 6 ⇒ ∇L = (−4.5x+2.1x³, 9y)
       原点：∇L 恰好 = (0,0)，但沿 x 是【极大】（两侧 L 更低）⇒ 双阱之间的鞍脊。
       起点取正中央 (0,0)：小球梯度恒为 0，【永远不会自己动】，
       而谷底在 x=±1.464、L=3.589，这里 L=6 —— 这就是「零梯度 ≠ 最优」。
       要让它滑下去必须靠扰动（对应机制段第 ④ 步的小批量噪声）。 */
    saddle: {
      name: '鞍点（原点梯度恰好为零，但它是山脊不是谷底）',
      loss: (x, y) => -2.25 * x * x + 0.525 * x * x * x * x + 4.5 * y * y + 6,
      grad: (x, y) => [-4.5 * x + 2.1 * x * x * x, 9 * y],
      crit: 2 / 9, start: [0, 0],
      note: '原点 ∇L=(0,0) 且不会自己动；谷底 L=3.59 而这里 L=6 ⇒ 临界 lr = 2/9 = 0.22'
    }
  };
  const OPT = { sgd: 'SGD（只用本批梯度）', mom: '带动量的 SGD', adam: 'Adam' };
  const RANGE = 2.2, GX = 22, GY = 20, MAXSTEP = 200, ESC = 6;

  function simOf(api) {
    if (!api._sim) resetSim(api);
    return api._sim;
  }
  function resetSim(api) {
    const T = TERRAIN[api.state.terrain], s = T.start;
    api._sim = { x: s[0], y: s[1], vx: 0, vy: 0, m1: [0, 0], m2: [0, 0],
      t: 0, step: 0, dead: false, trail: [[s[0], s[1]]], losses: [T.loss(s[0], s[1])] };
  }
  function stepSim(api) {
    const s = simOf(api), st = api.state, T = TERRAIN[st.terrain];
    if (s.dead || s.step >= MAXSTEP) return;
    const g = T.grad(s.x, s.y);
    let dx, dy;
    if (st.opt === 'sgd') {
      dx = -st.lr * g[0]; dy = -st.lr * g[1];
    } else if (st.opt === 'mom') {
      s.vx = st.beta * s.vx + g[0]; s.vy = st.beta * s.vy + g[1];
      dx = -st.lr * s.vx; dy = -st.lr * s.vy;
    } else {
      s.t++;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      s.m1[0] = b1 * s.m1[0] + (1 - b1) * g[0]; s.m1[1] = b1 * s.m1[1] + (1 - b1) * g[1];
      s.m2[0] = b2 * s.m2[0] + (1 - b2) * g[0] * g[0]; s.m2[1] = b2 * s.m2[1] + (1 - b2) * g[1] * g[1];
      const c1 = 1 - Math.pow(b1, s.t), c2 = 1 - Math.pow(b2, s.t);
      dx = -st.lr * (s.m1[0] / c1) / (Math.sqrt(s.m2[0] / c2) + eps);
      dy = -st.lr * (s.m1[1] / c1) / (Math.sqrt(s.m2[1] / c2) + eps);
    }
    s.x += dx; s.y += dy; s.step++;
    const L = T.loss(s.x, s.y);
    if (!isFinite(L) || Math.abs(s.x) > ESC || Math.abs(s.y) > ESC) { s.dead = true; return; }
    s.trail.push([s.x, s.y]);
    s.losses.push(Math.max(L, 1e-6));
  }

  DK.define('m04-loss-terrain', {
    title: '梯度下山地形的球',
    viewBox: [720, 424],
    state: { terrain: 'bowl', opt: 'sgd', lr: 0.10, beta: 0.90, play: false },

    controls(holder, api) {
      resetSim(api);
      holder.appendChild(DK.select({
        key: 'terrain', label: '地形', value: 'bowl',
        options: Object.keys(TERRAIN).map(k => ({ value: k, label: TERRAIN[k].name })),
        on(v) { api.state.terrain = v; resetSim(api); api.draw(); }
      }));
      holder.appendChild(DK.select({
        key: 'opt', label: '优化器', value: 'sgd',
        options: Object.keys(OPT).map(k => ({ value: k, label: OPT[k] })),
        on(v) { api.state.opt = v; resetSim(api); api.draw(); }
      }));
      /* 上限 1.5 而非 1.2：否则读者无法验证「动量把临界 lr 放宽到 ≈1.22」这条断言 */
      holder.appendChild(DK.range({
        key: 'lr', label: '学习率 lr', min: 0.01, max: 1.5, step: 0.005, value: 0.10,
        fmt: v => v.toFixed(3),
        on(v) { api.state.lr = v; resetSim(api); api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'beta', label: '动量 β', min: 0, max: 0.98, step: 0.02, value: 0.90,
        fmt: v => v.toFixed(2),
        on(v) { api.state.beta = v; resetSim(api); api.draw(); }
      }));
      holder.appendChild(DK.button('单步', () => { stepSim(api); api.draw(); }));
      /* 轻推：模拟机制段第 ④ 步的小批量梯度噪声。用可复现的 seed，不用 Math.random。
         必须重置步数预算：小球在山脊上「跑满 200 步仍不动」会耗尽预算，
         若不重置，读者推完再点单步就毫无反应——正是 hint ③ 描述的那个实验。 */
      holder.appendChild(DK.button('轻推一把（噪声）', () => {
        const s = simOf(api);
        api._nudge = (api._nudge || 0) + 1;
        const r = DK.rng((api._nudge * 2654435761) >>> 0)();
        s.x += (r - 0.5) * 0.12;
        s.step = 0; s.dead = false;
        /* 轨迹与损失曲线一起重新开始：曲线横轴固定为 MAXSTEP 步，
           若不清空，第二次运行的点会画到绘图区外面去 */
        s.trail = [[s.x, s.y]];
        s.losses = [TERRAIN[api.state.terrain].loss(s.x, s.y)];
        api.draw();
      }));
      holder.appendChild(DK.button('重置轨迹', () => { resetSim(api); api.draw(); }));
      holder.appendChild(DK.toggle({
        key: 'play', label: '自动播放', value: false,
        on(v) { api.state.play = v; if (v) api.animate(a => { stepSim(a); a.draw(); return !simOf(a).dead && simOf(a).step < MAXSTEP; }); }
      }));
      const ro = DK.readout([
        ['loss', '损失 L', ''], ['grad', '梯度范数', ''], ['step', '已走步数', ''],
        ['crit', '临界 lr = 2/a', ''], ['state', '状态', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      svg.appendChild(DK.el('text', { x: 12, y: 20, class: 't-sm muted',
        text: '俯视参数平面：颜色越深损失越高，小球按所选优化器逐步移动' }));
      svg.appendChild(DK.el('text', { x: 12, y: 36, class: 't-xs faint',
        text: '示意数据：地形为人工设定的二次/四次函数，不是真实损失面。' }));

      const P = api.plot = { x: 26, y: 54, w: 344, h: 322 };
      api.cells = [];
      const cw = P.w / GX, ch = P.h / GY, gCells = DK.el('g');
      svg.appendChild(gCells);
      for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
        const r = DK.el('rect', { x: P.x + i * cw, y: P.y + j * ch, width: cw + .6, height: ch + .6 });
        gCells.appendChild(r); api.cells.push({ r, i, j });
      }
      svg.appendChild(DK.el('rect', { x: P.x, y: P.y, width: P.w, height: P.h,
        fill: 'none', stroke: 'var(--c-line-strong)' }));
      api.trail = DK.el('polyline', { fill: 'none', stroke: 'var(--c-warn)', 'stroke-width': 1.8, opacity: .92 });
      svg.appendChild(api.trail);
      api.startMark = DK.el('circle', { r: 3.5, fill: 'none', stroke: 'var(--c-fg-faint)', 'stroke-width': 1.6 });
      svg.appendChild(api.startMark);
      api.ball = DK.el('circle', { r: 6.5, fill: 'var(--c-accent)', stroke: 'var(--c-bg)', 'stroke-width': 2 });
      svg.appendChild(api.ball);
      api.terrainNote = DK.el('text', { x: 26, y: 402, class: 't-xs faint' });
      svg.appendChild(api.terrainNote);

      const C = api.chart = { x: 424, y: 68, w: 274, h: 148 };
      svg.appendChild(DK.el('text', { x: C.x, y: 58, class: 't-sm muted', text: '损失 L（对数轴）随步数' }));
      svg.appendChild(DK.el('line', { x1: C.x, y1: C.y + C.h, x2: C.x + C.w, y2: C.y + C.h, class: 'grid' }));
      svg.appendChild(DK.el('line', { x1: C.x, y1: C.y, x2: C.x, y2: C.y + C.h, class: 'grid' }));
      [0, 1, 2, 3].forEach(k => svg.appendChild(DK.el('text', {
        x: C.x - 6, y: C.y + k * C.h / 3 + 3, class: 't-xs faint', 'text-anchor': 'end', text: '1e' + (3 - 2 * k) })));
      svg.appendChild(DK.el('text', { x: C.x + C.w, y: C.y + C.h + 13, class: 't-xs faint',
        'text-anchor': 'end', text: MAXSTEP + ' 步' }));
      api.lossLine = DK.el('polyline', { fill: 'none', stroke: 'var(--c-accent)', 'stroke-width': 2 });
      svg.appendChild(api.lossLine);

      const G = api.gauge = { x: 424, y: 262, w: 274, max: 1.5 };
      svg.appendChild(DK.el('text', { x: G.x, y: G.y - 12, class: 't-sm muted', text: '当前 lr 与临界值的位置' }));
      svg.appendChild(DK.el('rect', { x: G.x, y: G.y, width: G.w, height: 12, rx: 3, fill: 'var(--c-bg-sunken)' }));
      svg.appendChild(DK.el('rect', { x: G.x, y: G.y, width: G.w, height: 12, rx: 3, fill: 'none', stroke: 'var(--c-line)' }));
      api.critTick = DK.el('line', { y1: G.y - 6, y2: G.y + 18, stroke: 'var(--c-err)', 'stroke-width': 2 });
      svg.appendChild(api.critTick);
      api.critLabel = DK.el('text', { class: 't-xs bad', 'text-anchor': 'middle', y: G.y + 32 });
      svg.appendChild(api.critLabel);
      api.lrMark = DK.el('polygon', { points: '0,0 -5,-7 5,-7', fill: 'var(--c-accent)' });
      svg.appendChild(api.lrMark);
      api.verdict = DK.el('text', { x: G.x, y: G.y + 54, class: 't-sm' });
      svg.appendChild(api.verdict);
      api.explain = DK.el('text', { x: G.x, y: G.y + 72, class: 't-xs muted' });
      svg.appendChild(api.explain);
      api.explain2 = DK.el('text', { x: G.x, y: G.y + 88, class: 't-xs muted' });
      svg.appendChild(api.explain2);
    },

    draw(api) {
      const s = simOf(api), st = api.state, T = TERRAIN[st.terrain], P = api.plot;

      if (api._terrainDrawn !== st.terrain) {
        let mx = 1e-9;
        const vals = api.cells.map(c => {
          const x = -RANGE + (c.i + .5) / GX * 2 * RANGE;
          const y = RANGE - (c.j + .5) / GY * 2 * RANGE;
          const v = T.loss(x, y); if (v > mx) mx = v; return v;
        });
        /* 连续透明度而非 4 档色阶：heatFill 只有四档，直接用在整片网格上
           会出现明显的色带断层。这里固定用最高档色，靠 opacity 做连续渐变，
           仍然是主题感知的 var(--c-heat-3)，暗色主题不会失效。 */
        api.cells.forEach((c, n) => {
          const t = Math.pow(Math.max(vals[n], 0) / mx, .42);
          c.r.setAttribute('fill', 'var(--c-heat-3)');
          c.r.setAttribute('opacity', (0.06 + 0.9 * t).toFixed(3));
        });
        api._terrainDrawn = st.terrain;
      }
      api.terrainNote.textContent = T.note;

      const toPx = (x, y) => [P.x + (x + RANGE) / (2 * RANGE) * P.w, P.y + (RANGE - y) / (2 * RANGE) * P.h];
      const b = toPx(s.x, s.y), p0 = toPx(T.start[0], T.start[1]);
      api.ball.setAttribute('cx', b[0].toFixed(1)); api.ball.setAttribute('cy', b[1].toFixed(1));
      api.ball.setAttribute('fill', s.dead ? 'var(--c-err)' : 'var(--c-accent)');
      api.startMark.setAttribute('cx', p0[0].toFixed(1)); api.startMark.setAttribute('cy', p0[1].toFixed(1));
      api.trail.setAttribute('points', s.trail.map(p => {
        const q = toPx(p[0], p[1]); return q[0].toFixed(1) + ',' + q[1].toFixed(1);
      }).join(' '));

      const C = api.chart;
      api.lossLine.setAttribute('points', s.losses.map((v, i) => {
        const x = C.x + i / MAXSTEP * C.w;
        const l = Math.log10(Math.max(v, 1e-6));
        return x.toFixed(1) + ',' + DK.clamp(C.y + (3 - l) / 6 * C.h, C.y - 6, C.y + C.h + 6).toFixed(1);
      }).join(' '));

      const G = api.gauge;
      const cx = G.x + DK.clamp(T.crit / G.max, 0, 1) * G.w;
      api.critTick.setAttribute('x1', cx.toFixed(1)); api.critTick.setAttribute('x2', cx.toFixed(1));
      api.critLabel.setAttribute('x', DK.clamp(cx, G.x + 24, G.x + G.w - 24).toFixed(1));
      api.critLabel.textContent = '临界 ' + T.crit.toFixed(2);
      api.lrMark.setAttribute('transform', 'translate(' + (G.x + DK.clamp(st.lr / G.max, 0, 1) * G.w).toFixed(1) + ',' + (G.y + 12) + ')');

      const over = st.lr > T.crit, tiny = st.lr < T.crit / 12;
      const g = T.grad(s.x, s.y), gn = Math.hypot(g[0], g[1]);
      const L = T.loss(s.x, s.y);
      api.verdict.textContent = s.dead ? '已发散：小球冲出画面'
        : over ? '超过临界值：每步都在放大误差'
        : tiny ? '远小于临界值：几乎挪不动'
        : '在临界值以内：可以收敛';
      api.verdict.setAttribute('fill', (s.dead || over) ? 'var(--c-err)' : tiny ? 'var(--c-warn)' : 'var(--c-ok)');
      /* 逐地形给可验证的解释，不做无依据断言 */
      api.explain.textContent = st.opt === 'mom'
        ? '动量把一致方向累加到约 1/(1−β) = ' + (st.beta > 0 ? (1 / (1 - st.beta)).toFixed(0) : '1') + ' 倍；β 过大则反向过冲'
        : 'SGD 只看本批梯度：平坦方向每步只挪 lr·a·距离';
      api.explain2.textContent = st.terrain === 'saddle' && gn < 0.5
        ? '梯度已趋零，但 L=' + L.toFixed(2) + ' 而谷底只有 3.59 —— 零梯度不等于最优'
        : st.opt === 'adam' ? 'Adam 把每轴步长归一到 ≈lr，对曲率差异不敏感' : '';

      if (api._ro) {
        /* 损失可以小到 1e-9，固定三位小数会一律显示成 0.000，
           读者就看不到 hint 里承诺的「收敛到 2.8e-9」。小数位不够时切科学计数。 */
        const fmtL = (v) => (v > 0 && v < 1e-3) ? v.toExponential(1) : DK.fmt(v, 3);
        api._ro.set('loss', fmtL(L));
        api._ro.set('grad', (gn > 0 && gn < 1e-3) ? gn.toExponential(1) : DK.fmt(gn, 3));
        api._ro.set('step', s.step + ' / ' + MAXSTEP);
        api._ro.set('crit', T.crit.toFixed(3));
        api._ro.set('state', s.dead ? '发散' : over ? '超临界' : tiny ? '太慢' : '收敛中');
      }
    },

    onReset(api) { resetSim(api); },

    hint: '<strong>你能改什么：</strong>学习率 lr ∈ [0.01, 1.2]（无量纲，就是「一步迈多远」的缩放）；' +
      '动量 β ∈ [0, 0.98]（保留多少历史梯度，0 = 关闭动量）；三种地形、三种优化器。<br>' +
      '<strong>拨动它你会看到：</strong>① <em>碗形</em>两轴曲率都是 a = 3：把 lr 推过 <strong>0.67</strong>，小球在第 124 步弹飞；' +
      '0.665 还安全。这不是巧合——θ ← (1 − lr·a)θ，要 |1 − lr·a| &lt; 1 就必须 lr &lt; 2/a = 0.67，' +
      '机制段第 ③ 步的不等式在这里可以直接按出来；<br>' +
      '② <em>峡谷</em>（横向 a = 3 陡、纵向 a = 0.05 平）：先用纯 SGD、lr = 0.30，横向 1 步就到位，' +
      '纵向却要 46 步才走掉一半、跑满 200 步还剩 y ≈ 0.07——因为每步位移是 lr·a·距离，a 小 60 倍就慢 60 倍。' +
      '再把优化器换成带动量、β = 0.90：同一 lr 下纵向减半只要 10 步，损失从 1.2e-4 掉到 2.8e-9。' +
      '<em>动量加速的是「平坦方向」，不是「所有方向」</em>——陡方向本来就一步到位，无需帮忙；<br>' +
      '③ 继续把 β 推到 0.98（lr = 0.50）：它<strong>不会</strong>弹飞（动量其实把稳定域放宽到 lr ≈ 1.22，' +
      '远大于 SGD 的 0.67），但<strong>永远收不下去</strong>：最后 40 步里横向仍在 ±0.4 范围内换边 17 次，' +
      '损失在 1e-2 量级上下起伏；而 β = 0.90 同一 lr 下 200 步收敛到 L = 1.5e-9。' +
      'β 的代价是<strong>反应迟钝</strong>——接近谷底时它还在按旧方向冲，而不是「等效学习率变大」；<br>' +
      '④ <em>鞍点</em>：小球放在山脊正中央，梯度读数<strong>恒为 0</strong>——点「单步」或「自动播放」它一步都不动，' +
      '可损失停在 6，而两侧谷底只有 3.59。这就是机制段第 ⑦ 步的「卡住」：<strong>零梯度不是最优的信号</strong>。' +
      '想让它滑下去，只能点「轻推一把（噪声）」——对应机制段第 ④ 步：小批量梯度的随机噪声正是干这个用的。<br>' +
      '<strong>对应机制段：</strong>第 ② 步（更新式）、第 ③ 步（lr 上限由曲率决定）、第 ⑤ 步（动量累加 1/(1−β)）、' +
      '第 ⑥ 步（Adam 自适应）、第 ⑦ 步（鞍点与高原）。'
  });
})(window.AIPrinciples);
