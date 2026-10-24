/* ==========================================================================
   m07-attn-map.js · 旗舰演示：注意力矩阵热力图（DESIGN.md §6.4 D-M07）
   诚实性声明：本机无法下载模型权重（CDN 与 objects.githubusercontent 不通），
   因此权重是**合成示意数据**。合成规则刻意复现三种真实存在的注意力模式：
     头 0 = 局部性（偏向前一个词，呈对角带）
     头 1 = 句法主干（指向名词/谓语，呈竖条纹）
     头 2 = 首词汇聚 attention sink（第一列整列发亮）
     头 3 = 近似均匀（接近休眠的头）
   同 seed 保证每次打开、每次重置得到同一张表（教学可复现）。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  const TOK = ['猫', '追', '着', '那', '只', '追', '了', '很', '久'];
  const ROLE = ['主语', '谓语', '助词', '指示词', '量词', '谓语', '助词', '副词', '补语'];
  const N = TOK.length;
  const HEADS = [
    { name: '局部 · 前一个词', desc: '预算集中在紧邻的上一个词，这是语言里最强的规律' },
    { name: '句法主干', desc: '预算流向名词与谓语，跨距离也能对上' },
    { name: '首词汇聚 sink', desc: '第一列整列发亮：大量头把「多余」的注意力倒进第一个词' },
    { name: '近似均匀', desc: '这一头几乎不做区分——真实模型里不少头接近休眠' }
  ];

  /** 单个未归一化分数：确定性函数（不用随机，保证同输入同图） */
  function score(i, j, head) {
    if (j > i) return null;                       // 因果掩码
    const d = i - j;
    switch (head) {
      case 0: return d === 1 ? 1.0 : d === 0 ? 0.35 : Math.max(0.02, 0.3 / (d + 1));
      case 1: {
        const backbone = (j === 0 || j === 4 || j === 8) ? 0.55 : (j === 1 || j === 5) ? 0.4 : 0.06;
        return backbone + (j === i ? 0.15 : 0);
      }
      case 2: return j === 0 ? 0.85 : (j === i ? 0.3 : 0.07);
      default: return 1;                          // 均匀
    }
  }

  /** 行归一化（模拟 softmax 输出：每行和为 1） */
  function rowOf(i, head, log) {
    const raw = [];
    for (let j = 0; j <= i; j++) {
      const w = score(i, j, head);
      raw.push(log ? Math.log(Math.max(w, 1e-3)) : w);
    }
    if (log) {
      const mx = Math.max(...raw);
      const ex = raw.map(v => Math.exp(v - mx));
      const s = ex.reduce((a, b) => a + b, 0);
      return ex.map(v => v / s);
    }
    const s = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map(v => v / s);
  }
  const entropy = (p) => p.reduce((s, v) => v > 0 ? s - v * Math.log2(v) : s, 0);

  DK.define('m07-attn-map', {
    title: '注意力矩阵：它到底在看哪里',
    viewBox: [700, 372],
    state: { head: 0, row: 5, log: false, mask: true },

    controls(holder, api) {
      holder.appendChild(DK.range({
        key: 'head', label: '头', min: 0, max: HEADS.length - 1, value: api.state.head,
        fmt: v => '#' + v,
        on(v) { api.state.head = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'row', label: 'query 行', min: 0, max: N - 1, value: api.state.row,
        fmt: v => '#' + (v + 1),
        on(v) { api.state.row = v; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'log', label: '对数刻度', value: api.state.log,
        on(c) { api.state.log = c; api.draw(); }
      }));
      holder.appendChild(DK.toggle({
        key: 'mask', label: '遮住未来位置', value: api.state.mask,
        on(c) { api.state.mask = c; api.draw(); }
      }));
      const ro = DK.readout([
        ['head', '当前头的模式', ''],
        ['top', '最强 key', ''],
        ['ent', '行的熵 (bit)', ''],
        ['spread', '是否集中', '']
      ]);
      api._readout = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      const cell = 30, ox = 84, oy = 74;
      api.geo = { cell, ox, oy };

      svg.appendChild(DK.el('text', { x: 12, y: 20, class: 't-sm muted',
        text: '横轴 = 被读取的词（key）· 纵轴 = 正在读的词（query）· 一格 = 一个位置给另一个位置的预算' }));
      /* 头部只能占两行：列号画在 oy-22=52，第三行若留在 y=52 会与列号完全同行 */
      svg.appendChild(DK.el('text', { x: 12, y: 36, class: 't-xs faint',
        text: '示意数据（合成权重，非真实模型输出）；四种模式本身都是真实存在的现象 · 点任意格子 = 选中该 query 行，右侧列出它的预算分配' }));

      const gTok = DK.el('g');
      TOK.forEach((t, j) => {
        gTok.appendChild(DK.el('text', { x: ox + j * cell + cell / 2, y: oy - 8,
          class: 't-sm', 'text-anchor': 'middle', 'data-col': j, text: t }));
        gTok.appendChild(DK.el('text', { x: ox + j * cell + cell / 2, y: oy - 22,
          class: 't-xs faint', 'text-anchor': 'middle', text: String(j + 1) }));
        gTok.appendChild(DK.el('text', { x: ox - 10, y: oy + j * cell + cell / 2 + 4,
          class: 't-sm', 'text-anchor': 'end', 'data-row': j, text: TOK[j] }));
      });
      svg.appendChild(gTok);

      const gCells = DK.el('g');
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const r = DK.el('rect', {
          x: ox + j * cell + 1, y: oy + i * cell + 1, width: cell - 2, height: cell - 2, rx: 3,
          'data-i': i, 'data-j': j, style: 'cursor:pointer'
        });
        r.setAttribute('role', 'button');
        r.setAttribute('aria-label', '第 ' + (i + 1) + ' 行第 ' + (j + 1) + ' 列');
        r.addEventListener('click', () => {
          if (j > i) return;
          api.state.row = i; api.draw();
        });
        gCells.appendChild(r);
      }
      svg.appendChild(gCells);
      api.gCells = gCells;
      api.gTok = gTok;
      api.gSide = DK.el('g');
      svg.appendChild(api.gSide);
    },

    draw(api) {
      const { cell, ox, oy } = api.geo;
      const s = api.state;
      const rows = [];
      for (let i = 0; i < N; i++) rows.push(rowOf(i, s.head, s.log));
      const flat = rows.flat().filter(v => isFinite(v));
      const maxW = Math.max(...flat, 1e-6);

      api.gCells.querySelectorAll('rect').forEach(r => {
        const i = +r.getAttribute('data-i'), j = +r.getAttribute('data-j');
        if (j > i) {
          r.setAttribute('fill', s.mask ? 'var(--c-bg-sunken)' : 'var(--c-bg-elev)');
          r.setAttribute('stroke', 'var(--c-line)');
          r.setAttribute('stroke-width', .5);
          r.setAttribute('opacity', s.mask ? .95 : .3);
          return;
        }
        const t = rows[i][j] / maxW;
        r.setAttribute('fill', DK.heatFill(t));
        r.setAttribute('stroke', i === s.row ? 'var(--c-accent)' : 'var(--c-line)');
        r.setAttribute('stroke-width', i === s.row ? 2 : .5);
        r.setAttribute('opacity', i === s.row || s.row < 0 ? 1 : .78);
      });

      // 选中行的 query 标签加粗
      api.gTok.querySelectorAll('[data-row]').forEach(t => {
        t.style.fontWeight = (+t.getAttribute('data-row') === s.row) ? 700 : 400;
        t.setAttribute('fill', (+t.getAttribute('data-row') === s.row) ? 'var(--c-accent)' : 'var(--c-fg)');
      });

      // 右侧条形：选中行的预算分配
      const g = api.gSide;
      while (g.firstChild) g.removeChild(g.firstChild);
      const bx = ox + N * cell + 30;
      const row = rows[s.row];
      const rmax = Math.max(...row, 1e-6);
      g.appendChild(DK.el('text', { x: bx, y: oy - 22, class: 't-sm muted',
        text: '「' + TOK[s.row] + '」把预算给了谁' }));
      let rank = 0;
      for (let j = 0; j <= s.row; j++) {
        const yy = oy + rank * 18;
        g.appendChild(DK.el('rect', { x: bx, y: yy, width: Math.max(2, 110 * (row[j] / rmax)),
          height: 12, rx: 2, fill: DK.heatFill(row[j] / rmax) }));
        g.appendChild(DK.el('text', { x: bx + 114, y: yy + 10, class: 't-xs',
          text: TOK[j] + ' · ' + (row[j] * 100).toFixed(0) + '%' }));
        rank++;
      }
      g.appendChild(DK.el('text', { x: bx, y: oy + rank * 18 + 14, class: 't-xs faint',
        text: '句法角色：' + ROLE[s.row] }));
      g.appendChild(DK.el('text', { x: bx, y: oy + rank * 18 + 28, class: 't-xs faint',
        text: HEADS[s.head].desc }));

      // 读数
      if (api._readout) {
        const top = row.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0])[0];
        const ent = entropy(row);
        api._readout.set('head', HEADS[s.head].name);
        api._readout.set('top', '「' + TOK[top[1]] + '」' + (top[0] * 100).toFixed(0) + '%');
        api._readout.set('ent', ent.toFixed(2));
        api._readout.set('spread', ent < 0.8 ? '高度集中' : ent < 2 ? '中等分散' : '接近均匀');
      }
    },

    hint: '<strong>你能改什么：</strong>「头」0–3（同一层并行的 4 次注意力，各学一种关系）；' +
      '「query 行」= 正在被处理的是第几个词；「对数刻度」把差距放大到肉眼可读；' +
      '「遮住未来位置」开关对应机制第 ⑤ 步。<br>' +
      '<strong>拨动它你会看到：</strong>头 0 永远贴着对角线（局部性）；头 2 的第一列整列发亮（sink）；' +
      '把「遮住未来位置」关掉会发现上三角本来就没有意义——它不是被「遗忘」，而是从未参与计算。<br>' +
      '<strong>对应机制段：</strong>第 ② 步（点积出分数）、第 ⑤ 步（因果掩码）、第 ⑥ 步（多头分工）、第 ⑦ 步（顺序从哪来）。'
  });})(window.AIPrinciples);
