/* ==========================================================================
   demo-kit.js · 演示公共工具箱（DESIGN.md §6.3 统一 Demo 契约）
   零依赖。所有 assets/js/demos/*.js 通过 DK.define(key, spec) 注册，
   由本文件统一实现 mount/update/reset/pause/resume/destroy 生命周期、
   控件生成、可复现随机数与 SVG 绘制助手。

   为什么用 SVG 而不是 Canvas：① 颜色走 CSS 变量，亮暗主题自动跟随；
   ② 可被 lightbox 无损放大；③ 屏幕阅读器可读；④ 无 DPR 适配成本。
   ========================================================================== */
(function (AIP) {
  'use strict';
  if (!AIP) { console.error('[demo-kit] AIPrinciples 未加载，请检查 script 顺序'); return; }

  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------------- SVG 助手 ---------------- */
  function el(tag, attrs, kids) {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') { for (const s in attrs[k]) n.style[s] = attrs[k][s]; }
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (kids) [].concat(kids).forEach(c => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  /** 建立带 viewBox 的 svg 根节点；viewBox 让 demo 在任意尺寸与缩放下保持比例 */
  function stage(host, w, h, cls) {
    const svg = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h, class: 'demo-svg ' + (cls || ''),
      role: 'img', preserveAspectRatio: 'xMidYMid meet'
    });
    host.appendChild(svg);
    return svg;
  }

  /* ---------------- 可复现随机数（教学场景必须可复现）---------------- */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {            // xorshift32
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------------- 数值助手 ---------------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (v, d) => {
    if (!isFinite(v)) return v > 0 ? '∞' : (v < 0 ? '−∞' : 'NaN');
    const s = v.toFixed(d == null ? 2 : d);
    return s.replace(/^-/, '−');
  };
  /** 热力档：0..1 → 4 档 CSS 变量色阶 + 透明度渐变（§8.2 单色相，禁彩虹） */
  function heatFill(t) {
    t = clamp(t, 0, 1);
    const step = t <= 0.001 ? 0 : t < 0.25 ? 1 : t < 0.6 ? 2 : 3;
    return 'var(--c-heat-' + step + ')';
  }
  /** 画在 heatFill 色块【上面】的文字该用什么墨。
   *  阈值必须与 heatFill 同源：第 3 档在亮色主题是很深的蓝、在暗色主题是很浅的
   *  紫，两种情况下正文色（近黑/近白）都会糊掉（实测 1.96:1），所以那一档要换成
   *  随主题翻转的反色墨。CSS 侧用同名令牌 --c-on-heat-hi 解决过同一个问题。 */
  function heatInk(t) {
    t = clamp(t, 0, 1);
    return t < 0.6 ? 'var(--c-fg)' : 'var(--c-on-heat-hi)';
  }

  /* ---------------- 控件生成（一律用原生元素，保证键盘可达，§6.3）---------------- */
  function field(labelText, input, outEl) {
    const f = document.createElement('div');
    f.className = 'demo__field';
    const l = document.createElement('label');
    l.textContent = labelText;
    if (input.id) l.htmlFor = input.id;
    f.appendChild(l); f.appendChild(input);
    if (outEl) f.appendChild(outEl);
    return f;
  }
  let uid = 0;
  /* 控件声明自己绑定的 state 键（opt.key），并挂 _dkRestore(state)。
     reset 时先还原 state，再让每个控件按新 state 刷新自己的 DOM 值。 */
  function mark(wrap, key, restore) {
    if (key) { wrap._dkKey = key; wrap._dkRestore = restore; }
    return wrap;
  }

  function range(opt) {
    const inp = document.createElement('input');
    inp.type = 'range'; inp.id = 'dk-r-' + (++uid);
    inp.min = opt.min; inp.max = opt.max; inp.step = opt.step != null ? opt.step : 1;
    inp.value = opt.value;
    const out = document.createElement('output');
    out.setAttribute('aria-live', 'polite');
    const paint = () => { out.textContent = (opt.fmt ? opt.fmt(+inp.value) : inp.value) + (opt.unit || ''); };
    inp.addEventListener('input', () => { paint(); opt.on(+inp.value); });
    paint();
    return mark(opt.label ? field(opt.label, inp, out) : inp, opt.key,
      (st) => { inp.value = st[opt.key]; paint(); });
  }
  function select(opt) {
    const sel = document.createElement('select'); sel.id = 'dk-s-' + (++uid);
    opt.options.forEach(o => {
      const way = document.createElement('option');
      way.value = o.value != null ? o.value : o; way.textContent = o.label != null ? o.label : o;
      sel.appendChild(way);
    });
    sel.value = opt.value;
    sel.addEventListener('change', () => opt.on(sel.value));
    return mark(opt.label ? field(opt.label, sel) : sel, opt.key, (st) => { sel.value = st[opt.key]; });
  }
  function checkbox(opt) {
    const inp = document.createElement('input'); inp.type = 'checkbox';
    inp.checked = !!opt.value;
    inp.addEventListener('change', () => opt.on(inp.checked));
    return mark(field(opt.label, inp), opt.key, (st) => { inp.checked = !!st[opt.key]; });
  }
  /** 开关按钮：比 checkbox 更适合「模式切换」语义 */
  function toggle(opt) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn--sm dk-toggle'; b.textContent = opt.label;
    const paint = () => b.setAttribute('aria-pressed', String(!!b._val));
    b._val = !!opt.value; paint();
    b.addEventListener('click', () => { b._val = !b._val; paint(); opt.on(b._val); });
    return mark(b, opt.key, (st) => { b._val = !!st[opt.key]; paint(); });
  }
  function button(label, on, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn--sm ' + (cls || ''); b.textContent = label;
    b.addEventListener('click', on);
    return b;
  }
  /** 数值读数条：demo 的「反馈区」，aria-live 让读屏能播报（§13.1） */
  function readout(items) {
    const box = document.createElement('div');
    box.className = 'demo__readout';
    box.setAttribute('aria-live', 'polite');
    const map = {};
    items.forEach(([key, label, init]) => {
      const s = document.createElement('span');
      s.className = 'demo__stat';
      s.innerHTML = '<em>' + label + '</em><b></b>';
      s.dataset.k = key; map[key] = s.querySelector('b');
      if (init != null) map[key].textContent = init;
      box.appendChild(s);
    });
    box.set = (key, v) => { if (map[key]) map[key].textContent = typeof v === 'number' ? fmt(v) : v; };
    return box;
  }

  /* ---------------- 简易坐标绘图 ---------------- */
  /** 把数据坐标映射到 viewBox 像素 */
  function scales(x0, x1, y0, y1, pad) {
    pad = pad || { t: 14, r: 14, b: 26, l: 40 };
    return function (W, H, flipY) {
      const px = (v) => pad.l + (v - x0) / (x1 - x0) * (W - pad.l - pad.r);
      const py = (v) => flipY === false ? (pad.t + (v - y0) / (y1 - y0) * (H - pad.t - pad.b))
                                        : (H - pad.b - (v - y0) / (y1 - y0) * (H - pad.t - pad.b));
      return { px, py, W, H, pad };
    };
  }
  function axis(g, sc, opt) {
    opt = opt || {};
    if (opt.xTicks) opt.xTicks.forEach(v => {
      g.appendChild(el('line', { x1: sc.px(v), y1: opt.axisY != null ? sc.py(opt.axisY) : sc.H - sc.pad.b, x2: sc.px(v), y2: sc.H - sc.pad.b + 4, class: 'grid-l' }));
      const t = el('text', { x: sc.px(v), y: sc.H - sc.pad.b + 15, class: 't-xs muted', 'text-anchor': 'middle', text: opt.xFmt ? opt.xFmt(v) : String(v) });
      g.appendChild(t);
    });
    if (opt.yTicks) opt.yTicks.forEach(v => {
      const y = sc.py(v);
      g.appendChild(el('line', { x1: sc.pad.l - 4, y1: y, x2: sc.W - sc.pad.r, y2: y, class: 'grid-l', 'stroke-dasharray': '2 4' }));
      g.appendChild(el('text', { x: sc.pad.l - 7, y: y + 3.5, class: 't-xs muted', 'text-anchor': 'end', text: opt.yFmt ? opt.yFmt(v) : String(v) }));
    });
    if (opt.xlabel) g.appendChild(el('text', { x: sc.W / 2, y: sc.H - 4, class: 't-xs faint', 'text-anchor': 'middle', text: opt.xlabel }));
    if (opt.ylabel) g.appendChild(el('text', { x: 10, y: 10, class: 't-xs faint', text: opt.ylabel }));
  }

  /* ---------------- 定义一个 demo（实现 §6.3 契约）---------------- */
  /* spec = {
       title?, viewBox:[w,h], cls?,            // 画布
       controls(el, api) -> void               // 往 el(.demo__controls) 添加控件
       build(svg, api) -> void                 // 首次构建静态元素
       draw(api) -> void                        // 每次状态变化重绘
       onReset?(api) -> void                    // 额外重置逻辑
       hint: '你能改什么 / 会观察到什么 / 对应哪一步'   // §14 §6 文案三要素
     }
     api = { state, set(key,val), svg, sc?, el(建元素), draw(), reset(), rand() } */
  function define(key, spec) {
    AIP.register(key, function () {
      let host = null, svg = null, ctr = null, paused = false, frameReq = null;
      const state = Object.assign({}, spec.state || {});
      /* §6.3「状态入 URL」：?demo=<key>&<stateKey>=<值> 可分享某个具体参数组合，
         也供 iframe 嵌入与自动化验证使用。此前这条承诺从未实现，后果是
         闸门 4 只能验初始状态——队友加长 m01 的说明文字后，切到「语言式」
         才会触发的标签叠印静态检查看不见、探针也因为跑不到那个状态而看不见。
         类型按 spec.state 里的初值推断（number/string/boolean），不认识的键忽略。
         必须在 controls() 之前套用：控件建自己那格时读的就是 api.state。 */
      (function applyUrlState() {
        let q;
        try { q = new URLSearchParams(location.search); } catch { return; }
        const which = q.get('demo');
        if (which && which !== key) return;      // 指定了别的演示就不动本演示
        for (const k of Object.keys(state)) {
          if (!q.has(k)) continue;
          const raw = q.get(k), base = state[k];
          if (typeof base === 'number') {
            const n = Number(raw);
            if (isFinite(n)) state[k] = n;
          } else if (typeof base === 'boolean') {
            state[k] = !(raw === '0' || raw === 'false' || raw === '');
          } else {
            state[k] = String(raw);
          }
        }
      })();
      const listeners = [];
      const api = {
        key, state, spec,
        set(k, v) { state[k] = v; },
        on(node, type, fn) { node.addEventListener(type, fn); listeners.push([node, type, fn]); },
        el, rand: rng(spec.seed != null ? spec.seed : 42),
        ctr: null,   // .demo__controls
        host: null,  // .demo 容器（读数条、图例挂这里）
        draw() { if (!paused && svg) { try { spec.draw(api); } catch (e) { console.error('[demo ' + key + ']', e); } } },
        reset() {
          Object.assign(state, spec.state || {});
          if (spec.onReset) spec.onReset(api);
          // 让每个绑定了 state 键的控件按还原后的 state 刷新自己
          if (host) host.querySelectorAll('.demo__ctrlgrid > *, .demo__controls > *').forEach(n => {
            if (n._dkRestore && n._dkKey) n._dkRestore(state);
          });
          api.draw();
        },
        pause() { paused = true; if (frameReq) { cancelAnimationFrame(frameReq); frameReq = null; } },
        resume() { paused = false; api.draw(); },
        /* 需要连续动画的 demo 用 api.animate(fn)：自动尊重 prefers-reduced-motion */
        animate(fn) {
          if (frameReq) return;
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          const tick = () => { if (paused) { frameReq = null; return; } if (fn(api) === false) { frameReq = null; return; } frameReq = requestAnimationFrame(tick); };
          if (reduce) { fn(api); return; }        // 降级：只画一帧
          frameReq = requestAnimationFrame(tick);
        },
        stopAnim() { if (frameReq) { cancelAnimationFrame(frameReq); frameReq = null; } }
      };

      const inst = {
        mount(h) {
          host = h;
          const canvas = h.querySelector('.demo__canvas') || h;
          svg = stage(canvas, spec.viewBox[0], spec.viewBox[1], spec.cls);
          svg.setAttribute('aria-label', (spec.title || key) + ' 交互演示');
          ctr = h.querySelector('.demo__controls') || canvas;
          api.ctr = ctr;
          api.host = h;
          if (spec.controls) {
            const holder = document.createElement('div');
            holder.className = 'demo__ctrlgrid';
            ctr.appendChild(holder);            // 先入 DOM，controls 才能往 api.ctr / api.host 追加节点
            spec.controls(holder, api);
          }
          // 重置按钮（§6.3 硬性要求）
          const rb = button('重置', () => inst.reset(), 'demo__reset');
          rb.textContent = '⟲ 重置';
          ctr.appendChild(rb);
          // 说明条（§6 文案三要素）
          if (spec.hint) {
            const lg = document.createElement('p');
            lg.className = 'demo__legend';
            lg.innerHTML = spec.hint;
            h.appendChild(lg);
          }
          if (spec.build) spec.build(svg, api);
          api.draw();
          inst._canvas = canvas;
          return inst;
        },
        update(k, v) { api.set(k, v); api.draw(); return inst; },
        reset() { api.reset(); return inst; },
        pause() { api.pause(); },
        resume() { api.resume(); },
        destroy() {
          api.stopAnim();
          listeners.forEach(([n, t, f]) => n.removeEventListener(t, f));
          if (host) { const c = host.querySelector('.demo__canvas'); if (c) c.innerHTML = ''; const l = host.querySelector('.demo__legend'); if (l) l.remove(); }
          ctr = null; svg = null; host = null;
        },
        api
      };
      if (spec.frames) inst.frames = spec.frames(api);
      return inst;
    });
  }

  AIP.DK = {
    el, stage, rng, clamp, lerp, fmt, heatFill, heatInk, range, select, checkbox, toggle, button,
    readout, scales, axis, define, SVGNS
  };
})(window.AIPrinciples);
