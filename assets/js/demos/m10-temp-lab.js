/* ==========================================================================
   m10-temp-lab.js · 旗舰演示：温度采样实验室（DESIGN.md §6.4 D-M10）
   读者看到的核心因果：温度只改变分布的「陡峭程度」，不改变排序；
   top-p 先截断长尾再重归一化；两者共同决定「翻车率」。
   诚实性：logits 为人工设定的示意数据，不是任何真实模型的输出——画面上写明。
   抽样用 DK.rng(seed)，因此同参数 + 同 seed ⇒ 同一结果（教学可复现）。
   ========================================================================== */
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  /* 场景：「早上习惯喝一杯热___」的候选词元 */
  const CAND = ['咖啡', '茶', '牛奶', '豆浆', '白开水', '橙汁', '可乐', '矿泉水'];
  /* 被标为「翻车」的答案：热可乐 / 热矿泉水 —— 语法通顺但语义不当 */
  const WRONG = new Set([6, 7]);
  const SCENES = [
    { key: 'sharp', name: '分布尖锐（模型很确定）',
      z: [6.2, 4.4, 2.6, 1.9, 0.4, -0.3, -1.6, -2.1] },
    { key: 'flat', name: '分布平坦（模型不确定）',
      z: [1.3, 1.2, 1.15, 1.1, 1.0, 0.95, 0.9, 0.85] },
    { key: 'dual', name: '双峰（两个答案都对）',
      z: [5.4, 5.2, 1.2, 0.9, 0.1, -0.4, -1.8, -2.0] }
  ];

  const softmax = (z, T) => {
    const s = z.map(v => v / T);
    const mx = Math.max(...s);
    const ex = s.map(v => Math.exp(v - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    return ex.map(v => v / sum);
  };
  /** top-p 核：按概率降序累计到 p 的最小集合 */
  const nucleus = (p, topP) => {
    const idx = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const keep = new Set();
    let acc = 0;
    for (const [v, i] of idx) { keep.add(i); acc += v; if (acc >= topP - 1e-9) break; }
    return keep;
  };
  const entropy = (p) => p.reduce((s, v) => v > 1e-12 ? s - v * Math.log2(v) : s, 0);

  DK.define('m10-temp-lab', {
    title: '温度采样实验室',
    viewBox: [720, 400],
    state: { T: 1.0, topP: 1.0, n: 200, scene: 0, seed: 1 },

    controls(holder, api) {
      holder.appendChild(DK.range({
        key: 'T', label: '温度 T', min: 0.05, max: 2, step: 0.05, value: api.state.T,
        fmt: v => v.toFixed(2) + (v <= 0.06 ? '（≈贪心）' : ''),
        on(v) { api.state.T = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'topP', label: 'top-p 核', min: 0.1, max: 1, step: 0.05, value: api.state.topP,
        fmt: v => v.toFixed(2) + (v >= 0.999 ? '（不截断）' : ''),
        on(v) { api.state.topP = v; api.draw(); }
      }));
      holder.appendChild(DK.range({
        key: 'n', label: '抽样次数', min: 20, max: 500, step: 20, value: api.state.n,
        on(v) { api.state.n = v; api.draw(); }
      }));
      holder.appendChild(DK.select({
        key: 'scene', label: '场景', value: String(api.state.scene),
        options: SCENES.map((s, i) => ({ value: String(i), label: s.name })),
        on(v) { api.state.scene = +v; api.draw(); }
      }));
      holder.appendChild(DK.button('换一批随机', () => { api.state.seed = (api.state.seed % 998) + 1; api.draw(); }));
      const ro = DK.readout([
        ['p0', '首选概率', ''],
        ['ent', '熵 (bit)', ''],
        ['perp', '困惑度（等效选项数）', ''],
        ['err', '翻车率', ''],
        ['keep', '核内候选数', '']
      ]);
      api._ro = ro;
      api.host.appendChild(ro);
    },

    build(svg, api) {
      const g = api.spec.viewBox;
      api.L = { x: 66, w: 250, y: 62, h: 250 };      // 概率图
      api.R = { x: 400, w: 250, y: 62, h: 250 };     // 抽样频次图
      const mk = (side, title) => {
        svg.appendChild(DK.el('text', { x: side.x, y: side.y - 18, class: 't-sm muted', text: title }));
        svg.appendChild(DK.el('line', { x1: side.x, y1: side.y + side.h, x2: side.x + side.w, y2: side.y + side.h, class: 'grid' }));
        const bars = [], labs = [], vals = [];
        CAND.forEach((c, i) => {
          const bw = side.w / CAND.length;
          const x = side.x + i * bw;
          const b = DK.el('rect', { x: x + 3, y: side.y + side.h, width: bw - 6, height: 0,
            rx: 2, fill: DK.heatFill(0.2) });
          svg.appendChild(b); bars.push(b);
          const t = DK.el('text', { x: x + bw / 2, y: side.y + side.h + 14, class: 't-xs',
            'text-anchor': 'middle', text: c });
          if (WRONG.has(i)) t.setAttribute('fill', 'var(--c-err)');
          svg.appendChild(t); labs.push(t);
          const v = DK.el('text', { x: x + bw / 2, y: side.y + side.h - 4, class: 't-xs muted',
            'text-anchor': 'middle', text: '' });
          svg.appendChild(v); vals.push(v);
        });
        return { bars, labs, vals };
      };
      api.left = mk(api.L, '模型给出的概率（经温度与 top-p 处理后）');
      api.right = mk(api.R, '按这个分布实际抽样 N 次的结果');

      svg.appendChild(DK.el('text', { x: 12, y: 22, class: 't-sm muted',
        text: '题目：「早上习惯喝一杯热＿＿」　红字 = 语义不当的答案（热可乐 / 热矿泉水）' }));
      svg.appendChild(DK.el('text', { x: 12, y: 380, class: 't-xs faint',
        text: '示意数据：logits 为人工设定的三组场景，不是任何真实模型的输出。' }));
      svg.appendChild(DK.el('text', { x: 12, y: 394, class: 't-xs faint',
        text: '斜纹柱 = 被 top-p 截断（概率清零后重归一化）。' }));
      api.strip = DK.el('defs');
      const pat = DK.el('pattern', { id: 'm10-strip', width: 6, height: 6, patternTransform: 'rotate(45)', patternUnits: 'userSpaceOnUse' });
      pat.appendChild(DK.el('rect', { width: 6, height: 6, fill: 'var(--c-bg-sunken)' }));
      pat.appendChild(DK.el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--c-line-strong)', 'stroke-width': 2 }));
      api.strip.appendChild(pat);
      svg.insertBefore(api.strip, svg.firstChild);
      api._sceneLabel = DK.el('text', { x: 400, y: 22, class: 't-sm accent', text: SCENES[0].name });
      svg.appendChild(api._sceneLabel);
    },

    draw(api) {
      const s = api.state;
      const scene = SCENES[s.scene];
      const raw = softmax(scene.z, s.T);
      const keep = nucleus(raw, s.topP);
      const kept = raw.map((v, i) => keep.has(i) ? v : 0);
      const sum = kept.reduce((a, b) => a + b, 0) || 1;
      const p = kept.map(v => v / sum);

      /* 抽样：同 seed 同参数 ⇒ 同结果 */
      const rand = DK.rng(s.seed * 7919 + s.scene * 131 + Math.round(s.T * 100) * 17 + Math.round(s.topP * 100) * 7 + s.n);
      const cum = []; let acc = 0;
      p.forEach(v => { acc += v; cum.push(acc); });
      const cnt = CAND.map(() => 0);
      for (let k = 0; k < s.n; k++) {
        const r = rand() * acc;
        let i = 0;
        while (i < cum.length - 1 && r > cum[i]) i++;
        cnt[i]++;
      }

      const maxP = Math.max(...p, 1e-9);
      const maxC = Math.max(...cnt, 1);
      CAND.forEach((c, i) => {
        const lh = p[i] / maxP * api.L.h;
        const lb = api.left.bars[i];
        lb.setAttribute('y', api.L.y + api.L.h - lh);
        lb.setAttribute('height', Math.max(p[i] > 0 ? 1 : 0, lh));
        lb.setAttribute('fill', keep.has(i) ? DK.heatFill(p[i] / maxP) : 'url(#m10-strip)');
        api.left.vals[i].textContent = p[i] > 0.005 ? (p[i] * 100).toFixed(0) + '%' : '';
        api.left.vals[i].setAttribute('y', api.L.y + api.L.h - lh - 4);

        const rh = cnt[i] / maxC * api.R.h;
        const rb = api.right.bars[i];
        rb.setAttribute('y', api.R.y + api.R.h - rh);
        rb.setAttribute('height', Math.max(cnt[i] > 0 ? 1 : 0, rh));
        rb.setAttribute('fill', WRONG.has(i) ? 'var(--c-err)' : DK.heatFill(cnt[i] / maxC));
        api.right.vals[i].textContent = cnt[i] ? String(cnt[i]) : '';
        api.right.vals[i].setAttribute('y', api.R.y + api.R.h - rh - 4);
      });

      const H = entropy(p);
      const err = cnt.reduce((a, v, i) => a + (WRONG.has(i) ? v : 0), 0) / s.n;
      if (api._ro) {
        api._ro.set('p0', (Math.max(...p) * 100).toFixed(1) + '%');
        api._ro.set('ent', H.toFixed(2));
        api._ro.set('perp', Math.pow(2, H).toFixed(1) + ' 个');
        api._ro.set('err', (err * 100).toFixed(0) + '%');
        api._ro.set('keep', keep.size + ' / ' + CAND.length);
      }
      if (api._sceneLabel) api._sceneLabel.textContent = scene.name;
    },

    hint: '<strong>你能改什么：</strong>温度 T ∈ [0.05, 2]（0.05 ≈ 贪心解码，即每次只取最高分）；' +
      'top-p ∈ [0.1, 1]（1 = 不截断）；抽样次数 N ∈ [20, 500]；三组人工 logits 场景。<br>' +
      '<strong>拨动它你会看到：</strong>① T 从 0.05 升到 2，<em>柱子的高低顺序一次都没变</em>——温度只改陡峭度，不改排序；' +
      '② 在「尖锐」场景里 T 的影响很小，切到「平坦」场景同样的 T 变化会让首选概率从九成掉到两成——' +
      '<em>温度是否危险，取决于模型自己有多确定</em>；③ 关掉 top-p（=1）时红色柱会随 T 上升而变高，翻车率随之上升；' +
      '④ 把 top-p 压到 0.2，长尾柱变成斜纹（被截断），翻车率归零但答案也变得单调。<br>' +
      '<strong>对应机制段：</strong>第 ② 步（温度公式）、第 ③ 步（不改排序）、第 ④ 步（核采样）、第 ⑤ 步（为什么会翻车）。'
  });
})(window.AIPrinciples);
