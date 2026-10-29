/* ==========================================================================
   app.js · 站点交互层（零依赖）
   职责：主题 / 抽屉 / scroll-spy / 阅读进度 / 已读进度 / 键盘 / lightbox /
        站内搜索 / 术语卡片 / 自测题 / 步骤联动 / Demo 懒挂载
   约束：不用 scroll 事件做高亮（IntersectionObserver）；尊重
        prefers-reduced-motion；无 JS 时正文与图解仍完整可读。
   ========================================================================== */
(function () {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const STORE = { theme: 'aip.theme', done: 'aip.done', map: 'aip.map' };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const AIP = window.AIPrinciples = window.AIPrinciples || {};
  AIP.version = '0.2.0';
  AIP.demos = AIP.demos || {};        // key -> factory（由 demo-kit.define 填充）
  AIP.registry = AIP.registry || {};  // key -> instance
  AIP.register = AIP.register || function (key, factory) { AIP.demos[key] = factory; };

  /* ========================================================================
     1. 主题：跟随系统 / 亮 / 暗
     ======================================================================== */
  const themeButtons = [...doc.querySelectorAll('.themeswitch__btn')];

  function applyTheme(value) {
    root.setAttribute('data-theme', value);
    const resolved = value === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
    const cs = doc.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', resolved === 'dark' ? 'dark light' : 'light dark');
    themeButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeValue === value)));
    return resolved;
  }
  function savedTheme() { try { return localStorage.getItem(STORE.theme) || 'auto'; } catch (e) { return 'auto'; } }
  function setTheme(v) { applyTheme(v); try { localStorage.setItem(STORE.theme, v); } catch (e) { /* 隐私模式 */ } }

  function initTheme() {
    applyTheme(savedTheme());
    themeButtons.forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeValue)));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (savedTheme() === 'auto') applyTheme('auto');
    });
  }

  /* ========================================================================
     2. 抽屉导航
     ======================================================================== */
  const navToggle = doc.getElementById('nav-toggle');

  function setNav(open) {
    doc.body.classList.toggle('nav-open', open);
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '关闭学习地图' : '打开学习地图');
    }
  }
  function initNav() {
    if (navToggle) navToggle.addEventListener('click', () => setNav(!doc.body.classList.contains('nav-open')));
    doc.addEventListener('click', (ev) => {
      if (!doc.body.classList.contains('nav-open')) return;
      if (ev.target.closest('#sitenav') || ev.target.closest('#nav-toggle')) return;
      setNav(false);
    });
    doc.querySelectorAll('#sitenav a').forEach(a => a.addEventListener('click', () => {
      if (window.matchMedia('(max-width:880px)').matches) setNav(false);
    }));
    doc.querySelectorAll('.maptree__part').forEach(d => {
      const key = STORE.map + '.' + d.dataset.part;
      try { const s = localStorage.getItem(key); if (s !== null) d.open = s === '1'; } catch (e) { /* noop */ }
      d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch (e) { /* noop */ } });
    });
  }

  /* ========================================================================
     3. scroll-spy
     ======================================================================== */
  const modules = [...doc.querySelectorAll('.module')];
  const order = modules.map(m => m.id);
  const segsByModule = {};
  modules.forEach(m => { segsByModule[m.id] = [...m.querySelectorAll('.seg')]; });

  const tocList = doc.getElementById('toc-list');
  const mapLinks = [...doc.querySelectorAll('.maptree__mods a')];
  const topLinks = [...doc.querySelectorAll('.topnav a')];
  let currentModuleId = null;

  function renderTocFor(id) {
    if (!tocList) return;
    const mod = doc.getElementById(id);
    if (!mod) return;
    tocList.innerHTML = '';
    mod.querySelectorAll('.seg').forEach(seg => {
      const li = doc.createElement('li');
      const a = doc.createElement('a');
      a.href = '#' + seg.id;
      a.dataset.seg = seg.dataset.seg;
      const h = seg.querySelector('h3');
      a.textContent = h ? h.textContent.trim() : seg.dataset.seg;
      li.appendChild(a); tocList.appendChild(li);
    });
  }
  function setCurrentModule(id) {
    if (id === currentModuleId) return;
    currentModuleId = id;
    const mod = doc.getElementById(id);
    const part = mod ? mod.dataset.part : null;
    mapLinks.forEach(a => a.setAttribute('aria-current', String(a.dataset.mod === id)));
    renderTocFor(id);
    if (part) {
      topLinks.forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + part)));
      const g = doc.querySelector('.maptree__part[data-part="' + part + '"]');
      if (g && !g.open) g.open = true;
    }
  }
  function markSeg(modId, segId) {
    const mod = doc.getElementById(modId);
    const nav = mod ? mod.querySelector('.sectionnav') : null;
    if (nav) nav.querySelectorAll('a').forEach(a =>
      a.classList.toggle('is-current', a.getAttribute('href') === '#' + segId));
    if (tocList) tocList.querySelectorAll('a').forEach(a =>
      a.classList.toggle('is-current', a.getAttribute('href') === '#' + segId));
    doc.querySelectorAll('.seg.is-current').forEach(s => { if (s.id !== segId) s.classList.remove('is-current'); });
    const seg = doc.getElementById(segId);
    if (seg) seg.classList.add('is-current');
  }
  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    const vis = {};
    const modObs = new IntersectionObserver((entries) => {
      entries.forEach(e => { vis[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      let best = null, r = 0;
      for (const k in vis) if (vis[k] > r) { r = vis[k]; best = k; }
      if (best) setCurrentModule(best);
    }, { rootMargin: '-15% 0px -55% 0px', threshold: [0, .05, .2, .4, .7] });
    modules.forEach(m => modObs.observe(m));

    const segObs = new IntersectionObserver((entries) => {
      let top = null;
      entries.forEach(e => {
        if (e.isIntersecting && (!top || e.boundingClientRect.top < top.boundingClientRect.top)) top = e;
      });
      if (top) markSeg(top.target.closest('.module').id, top.target.id);
    }, { rootMargin: '-12% 0px -70% 0px', threshold: 0 });
    doc.querySelectorAll('.seg').forEach(s => segObs.observe(s));
  }

  /* ========================================================================
     4. 阅读进度
     ======================================================================== */
  function initReadBar() {
    const fill = doc.getElementById('readbar-fill');
    if (!fill) return;
    let tick = false;
    const upd = () => {
      const max = root.scrollHeight - root.clientHeight;
      fill.style.width = (max > 0 ? clampV(scrollY / max * 100, 0, 100) : 0).toFixed(2) + '%';
      tick = false;
    };
    const onScroll = () => { if (!tick) { tick = true; requestAnimationFrame(upd); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    upd();
  }
  const clampV = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ========================================================================
     5. 已读进度（localStorage）
     ======================================================================== */
  const TOTAL = modules.length;
  const readDone = () => { try { return JSON.parse(localStorage.getItem(STORE.done) || '[]'); } catch (e) { return []; } };
  const writeDone = (l) => { try { localStorage.setItem(STORE.done, JSON.stringify(l)); } catch (e) { /* noop */ } };

  function paintProgress() {
    const done = readDone();
    doc.querySelectorAll('.modcard__done input').forEach(cb => { cb.checked = done.indexOf(cb.dataset.done) >= 0; });
    mapLinks.forEach(a => a.classList.toggle('is-done', done.indexOf(a.dataset.mod) >= 0));
    modules.forEach(m => m.classList.toggle('is-done', done.indexOf(m.id) >= 0));
    const c = doc.getElementById('progress-count');
    if (c) c.textContent = done.length + '/' + TOTAL + ' 已完成';
    const ring = doc.getElementById('hero-ring');
    if (ring) {
      const C = 2 * Math.PI * 28;
      ring.style.strokeDasharray = C.toFixed(1);
      ring.style.strokeDashoffset = (C * (1 - (TOTAL ? done.length / TOTAL : 0))).toFixed(1);
      const lb = doc.querySelector('.ring-label');
      if (lb) lb.textContent = Math.round(done.length / (TOTAL || 1) * 100) + '%';
    }
  }
  function initProgress() {
    doc.querySelectorAll('.modcard__done input').forEach(cb => cb.addEventListener('change', () => {
      const id = cb.dataset.done, done = readDone(), i = done.indexOf(id);
      if (cb.checked && i < 0) done.push(id);
      if (!cb.checked && i >= 0) done.splice(i, 1);
      writeDone(done); paintProgress();
    }));
    const r = doc.getElementById('progress-reset');
    if (r) r.addEventListener('click', () => { writeDone([]); paintProgress(); });
    paintProgress();
  }

  /* ========================================================================
     6. 术语卡片（§9.2）：hover/focus 浮出释义，触屏点按
     ======================================================================== */
  function initTerms() {
    let pop = null, cur = null;
    function hide() { if (pop) { pop.remove(); pop = null; cur = null; } }
    function show(term) {
      const def = term.dataset.def || term.getAttribute('title');
      if (!def) return;
      hide();
      pop = doc.createElement('div');
      pop.className = 'term-pop';
      pop.setAttribute('role', 'tooltip');
      const en = term.dataset.en;
      pop.innerHTML = (en ? '<strong>' + escH(en) + '</strong>' : '') + escH(def) +
        (en ? '' : '');
      doc.body.appendChild(pop);
      const r = term.getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      let x = r.left + r.width / 2 - pr.width / 2;
      let y = r.bottom + 8;
      if (y + pr.height > innerHeight - 8) y = r.top - pr.height - 8;
      pop.style.left = clampV(x, 8, innerWidth - pr.width - 8) + 'px';
      pop.style.top = Math.max(8, y) + 'px';
      cur = term;
    }
    const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    doc.querySelectorAll('.term').forEach(t => {
      t.setAttribute('tabindex', '0');
      t.removeAttribute('title');               // 用自建卡片，避免与原生 tooltip 重复
      t.addEventListener('mouseenter', () => show(t));
      t.addEventListener('mouseleave', hide);
      t.addEventListener('focus', () => show(t));
      t.addEventListener('blur', hide);
      t.addEventListener('click', (ev) => {    // 触屏：点按切换
        if (!matchMedia('(hover:none)').matches) return;
        ev.preventDefault();
        cur === t ? hide() : show(t);
      });
    });
    doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && pop) hide(); });
    addEventListener('scroll', () => { if (pop) hide(); }, { passive: true });
  }

  /* ========================================================================
     7. 自测题（§7.3 .quiz）：答错给针对性解释
     ======================================================================== */
  function initQuiz() {
    doc.querySelectorAll('.quiz').forEach(q => {
      const opts = [...q.querySelectorAll('.quiz__opt')];
      const fb = q.querySelector('.quiz__fb');
      if (!opts.length || !fb) return;
      const grade = () => {
        const picked = opts.filter(o => o.querySelector('input').checked);
        if (!picked.length) return;
        q.classList.add('is-graded');
        const right = opts.filter(o => o.querySelector('input').dataset.right === '1');
        opts.forEach(o => {
          o.classList.toggle('is-right', right.includes(o));
          const inp = o.querySelector('input');
          o.classList.toggle('is-wrong', inp.checked && inp.dataset.right !== '1');
        });
        const wrong = picked.some(o => o.querySelector('input').dataset.right !== '1');
        fb.querySelectorAll('[data-for]').forEach(n => { n.hidden = (n.dataset.for === 'no') !== wrong; });
        const ann = q.querySelector('.quiz__result');
        if (ann) ann.textContent = wrong ? '答错了，看下面的解释' : '答对了';
      };
      opts.forEach(o => o.querySelector('input').addEventListener('change', grade));
      const reset = buttonSm('重做', () => {
        opts.forEach(o => { const i = o.querySelector('input'); i.checked = false; o.classList.remove('is-right', 'is-wrong'); });
        q.classList.remove('is-graded');
      });
      q.appendChild(reset);
    });
    function buttonSm(label, fn) {
      const b = doc.createElement('button');
      b.type = 'button'; b.className = 'linkbtn quiz__redo'; b.textContent = label;
      b.addEventListener('click', fn); return b;
    }
  }

  /* ========================================================================
     8. 步骤联动：hover/click .steps > li 高亮对应图解
     ======================================================================== */
  function initSteps() {
    doc.querySelectorAll('.module').forEach(mod => {
      const steps = [...mod.querySelectorAll('.steps > li')];
      const figNodes = [...mod.querySelectorAll('[data-step]')];
      if (!steps.length || !figNodes.length) return;
      const targetFig = mod.querySelector('.figure');
      const focus = (n) => {
        if (!n) return;
        const on = n.dataset.step;
        targetFig && targetFig.classList.add('is-focus');
        figNodes.forEach(f => f.classList.toggle('is-current', f.dataset.step === on));
        steps.forEach(s => s.classList.toggle('is-current', s === n));
      };
      steps.forEach(s => {
        s.tabIndex = 0;
        s.addEventListener('mouseenter', () => focus(s));
        s.addEventListener('focus', () => focus(s));
        s.addEventListener('click', () => focus(s));
      });
      const clear = () => {
        targetFig && targetFig.classList.remove('is-focus');
        figNodes.forEach(f => f.classList.remove('is-current'));
        steps.forEach(s => s.classList.remove('is-current'));
      };
      mod.querySelectorAll('.steps').forEach(st => st.addEventListener('mouseleave', clear));
    });
  }

  /* ========================================================================
     9. Lightbox（含缩放）
     ======================================================================== */
  function initLightbox() {
    const dlg = doc.getElementById('lightbox');
    const stage = doc.getElementById('lightbox-stage');
    if (!dlg || !stage) return;
    let zoom = 1, base = null;
    const applyZoom = () => { if (base) base.style.transform = 'scale(' + zoom + ')'; };
    doc.querySelectorAll('.figure').forEach(fig => {
      const box = fig.querySelector('.figure__inner') || fig.querySelector('svg');
      if (!box) return;
      fig.tabIndex = 0;
      fig.setAttribute('role', 'button');
      fig.setAttribute('aria-label', '放大查看这张图解');
      const open = () => {
        stage.innerHTML = '';
        base = fig.querySelector('.figure__inner').cloneNode(true);
        base.style.transformOrigin = '0 0';
        stage.appendChild(base);
        zoom = 1; applyZoom();
        const cap = fig.querySelector('figcaption');
        const t = dlg.querySelector('.lightbox__title');
        if (t) t.textContent = (fig.dataset.fig || '图解') + (cap ? ' · ' + cap.textContent.trim() : '');
        if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      };
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
    });
    dlg.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      zoom = b.dataset.zoom === 'in' ? Math.min(4, zoom * 1.3)
           : b.dataset.zoom === 'out' ? Math.max(0.4, zoom / 1.3) : 1;
      applyZoom();
    }));
    const close = doc.getElementById('lightbox-close');
    if (close) close.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target === stage) dlg.close(); });
  }

  /* ========================================================================
     10. 站内搜索：标题 + tagline + 术语 + 带走一句 + 段落标题
     ======================================================================== */
  function buildIndex() {
    const rows = [];
    modules.forEach(m => {
      rows.push({ kind: '模块', id: m.id, title: m.id.toUpperCase().slice(1) + ' · ' + m.querySelector('h2').textContent.trim(),
                  text: (m.querySelector('.module__tag') || {}).textContent || '' });
      m.querySelectorAll('.seg').forEach(s => {
        rows.push({ kind: '段落', id: s.id, title: s.querySelector('h3').textContent.trim(),
                    text: m.querySelector('h2').textContent.trim(), modId: m.id });
      });
    });
    doc.querySelectorAll('.takeaway__line').forEach(n => {
      rows.push({ kind: '结论', id: n.closest('.seg').id, title: n.textContent.trim(),
                  text: n.closest('.module').querySelector('h2').textContent.trim() });
    });
    doc.querySelectorAll('.term').forEach(t => {
      const seg = t.closest('.seg');
      rows.push({ kind: '术语', id: seg ? seg.id : 'home', title: t.textContent.trim(),
                  text: (t.dataset.en || '') + ' ' + (t.dataset.def || '') });
    });
    return rows;
  }
  let SEARCH_INDEX = null;

  function runSearch(q) {
    if (!SEARCH_INDEX) SEARCH_INDEX = buildIndex();
    q = q.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    return SEARCH_INDEX.map(r => {
      const title = r.title.toLowerCase(), text = (r.text || '').toLowerCase();
      let s = 0;
      terms.forEach(t => {
        if (title.includes(t)) s += 6;
        else if (text.includes(t)) s += 2;
        else if (title.startsWith(t)) s += 3;
      });
      return { r, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map(x => x.r);
  }

  function initSearch() {
    const dlg = doc.getElementById('search-dlg');
    const open = doc.getElementById('search-open');
    const input = doc.getElementById('search-input');
    const list = doc.getElementById('search-results');
    if (!dlg || !input || !list) return;
    let sel = 0;

    const show = () => {
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      input.value = ''; list.innerHTML = ''; input.focus();
    };
    if (open) { open.disabled = false; open.addEventListener('click', show); }

    function render(res) {
      list.innerHTML = '';
      if (!input.value.trim()) {
        list.innerHTML = '<li class="searchdlg__empty">输入关键词，或按模块编号（如 m07）跳转</li>';
        sel = -1; return;
      }
      if (!res.length) { list.innerHTML = '<li class="searchdlg__empty">没有匹配项</li>'; sel = -1; return; }
      res.forEach((r, i) => {
        const li = doc.createElement('li');
        li.className = 'searchdlg__item' + (i === 0 ? ' is-sel' : '');
        li.setAttribute('role', 'option');
        li.dataset.href = '#' + r.id;
        li.innerHTML = '<span class="searchdlg__kind">' + r.kind + '</span>' +
          '<span class="searchdlg__title">' + escTxt(r.title) + '</span>' +
          (r.text ? '<span class="searchdlg__text">' + escTxt(r.text.trim().slice(0, 90)) + '</span>' : '');
        li.addEventListener('click', () => go(li));
        li.addEventListener('mouseenter', () => { sel = i; repaint(); });
        list.appendChild(li);
      });
      sel = 0;
    }
    const escTxt = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const repaint = () => list.querySelectorAll('.searchdlg__item')
      .forEach((n, i) => n.classList.toggle('is-sel', i === sel));
    function go(li) {
      location.hash = li.dataset.href;
      dlg.close();
      const t = doc.getElementById(li.dataset.href.slice(1));
      if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => render(runSearch(input.value)), 90);
    });
    input.addEventListener('keydown', (ev) => {
      const items = [...list.querySelectorAll('.searchdlg__item')];
      if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(items.length - 1, sel + 1); repaint(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(0, sel - 1); repaint(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (items[sel]) go(items[sel]); }
    });
    doc.addEventListener('keydown', (ev) => {
      const tag = (ev.target.tagName || '').toLowerCase();
      if (ev.key === '/' && tag !== 'input' && tag !== 'textarea' && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault(); show();
      }
    });
  }

  /* ========================================================================
     11. 键盘快捷键
     ======================================================================== */
  function initKeys() {
    doc.addEventListener('keydown', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable) return;
      if (doc.getElementById('search-dlg') && doc.getElementById('search-dlg').open) return;
      const k = ev.key.toLowerCase();
      if (k === 't') { const c = savedTheme(); setTheme(c === 'auto' ? 'light' : c === 'light' ? 'dark' : 'auto'); return; }
      if (k === 'j' || k === 'k') {
        const list = currentModuleId ? segsByModule[currentModuleId] : null;
        if (!list || !list.length) return;
        let i = list.findIndex(s => s.classList.contains('is-current'));
        i = k === 'j' ? Math.min(list.length - 1, i + 1) : Math.max(0, (i < 0 ? 0 : i) - 1);
        list[i].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        ev.preventDefault();
      }
      if (k === '[' || k === ']') {
        let i = order.indexOf(currentModuleId); if (i < 0) i = 0;
        i = k === ']' ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
        location.hash = order[i]; ev.preventDefault();
      }
    });
  }

  /* ========================================================================
     12. 前置依赖提示（§3.3：提示而不拦截）
     ======================================================================== */
  function paintPrereqHints() {
    doc.querySelectorAll('.prereq-hint').forEach(n => n.remove());
    if (doc.body.classList.contains('first-visit')) return;   // 全新读者不拦截
    const done = readDone();
    modules.forEach(m => {
      const pre = (m.dataset.prereq || '').split(' ').filter(Boolean);
      const undone = pre.filter(p => done.indexOf(p) < 0);
      if (!undone.length) return;
      const bar = doc.createElement('p');
      bar.className = 'prereq-hint';
      bar.innerHTML = '建议先读：' + undone.map(u => {
        const t = doc.getElementById(u);
        const h2 = t ? t.querySelector('h2') : null;
        return '<a href="#' + u + '">' + u.toUpperCase() + (h2 ? ' ' + escAttr(h2.textContent.trim()) : '') + '</a>';
      }).join(' ');
      const head = m.querySelector('.module__head');
      if (head) head.appendChild(bar);
    });
  }
  function initPrereqHint() {
    // 首次到访（无已读记录）不打扰；一旦读者勾过若干模块，才提示未读前置
    if (!readDone().length) doc.body.classList.add('first-visit');
    paintPrereqHints();
    doc.querySelectorAll('.modcard__done input').forEach(cb =>
      cb.addEventListener('change', () => setTimeout(paintPrereqHints, 0)));
  }

  /* ========================================================================
     13. Demo 懒挂载（§6.3 / §10.3）
     ======================================================================== */
  function mountDemos() {
    const hosts = [...doc.querySelectorAll('.demo[data-demo]')];
    if (!hosts.length) return;
    if (!('IntersectionObserver' in window)) { mountAll(hosts); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { mountOne(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '300px 0px', threshold: 0 });
    hosts.forEach(h => io.observe(h));
  }
  function mountOne(host) {
    const key = host.dataset.demo;
    if (AIP.registry[key]) return;
    const factory = AIP.demos[key];
    const canvas = host.querySelector('.demo__canvas');
    if (!factory) {
      console.warn('[AIP] demo 未注册：' + key);
      if (canvas) canvas.innerHTML = '<p class="demo__unavailable">演示「' + key + '」尚未实现</p>';
      return;
    }
    if (canvas) canvas.innerHTML = '';            // 清掉可能残留的占位提示
    try {
      const inst = factory().mount(host);
      AIP.registry[key] = inst;
      host.classList.add('is-live');
      // 视口外暂停（省 CPU，不销毁状态）
      const vio = new IntersectionObserver((ens) => {
        ens.forEach(en => {
          if (en.isIntersecting) { inst.resume && inst.resume(); }
          else { inst.pause && inst.pause(); }
        });
      }, { rootMargin: '80px 0px' });
      vio.observe(host);
    } catch (err) {
      console.error('[AIP] demo 挂载失败', key, err);
      const c = host.querySelector('.demo__canvas');
      if (c) c.innerHTML = '<p class="demo__unavailable">演示加载失败：' + escAttr(err.message) + '</p>';
    }
  }
  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function mountAll(hosts) { hosts.forEach(mountOne); }

  /* ========================================================================
     14. 锚点直达
     ======================================================================== */
  function initHash() {
    const handle = () => {
      const id = location.hash.replace(/^#/, '');
      if (!id) return;
      const mod = doc.getElementById(id.split('--')[0]);
      if (mod && mod.classList.contains('module')) {
        const g = doc.querySelector('.maptree__part[data-part="' + mod.dataset.part + '"]');
        if (g) g.open = true;
        setCurrentModule(mod.id);
      }
    };
    addEventListener('hashchange', handle);
    handle();
  }

  /* ========================================================================
     15. 作者预览参数（也用于自动化截图验证）
       ?only=m07--demo   只显示该段落，其余区块隐藏（单段预览）
       ?mountall         立即挂载全部演示，跳过懒加载
     ======================================================================== */
  /* 对比度扫描：找出「有文字、有非透明背景、但两者对比不足」的元素。
     这正是 .fig__cell--h3 在暗色主题下白字压浅底那一类缺陷的通用检测器。

     颜色的坑：getComputedStyle 对 color-mix() 会返回 `color(srgb .109 .486 .353 / .12)`
     这种新式写法，且带 alpha。按「前三个数字 ÷ 255」解析会得到完全错误的结果
     （srgb 分量本来就是 0–1）。所以一律用 canvas 归一化成 rgb/rgba 再解析，
     并把半透明的背景逐层合成到不透明的底层上。 */
  function contrastSweep() {
    const cvs = doc.createElement('canvas');
    cvs.width = cvs.height = 1;
    const cx = cvs.getContext('2d', { willReadFrequently: true });
    if (!cx) return [];
    /** 任意 CSS 颜色 → [r,g,b,a]（0–255 / 0–1）；无法解析返回 null */
    function parse(c) {
      if (!c) return null;
      cx.fillStyle = '#010203';                 // 哨兵：赋值失败时 fillStyle 不变
      cx.fillStyle = c;
      const v = cx.fillStyle;
      if (v === '#010203') return null;         // 浏览器没接受这个颜色
      if (v.charAt(0) === '#') {
        const h = v.slice(1);
        if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
      }
      const m = v.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(s => s !== '').map(Number);
      if (p.length < 3) return null;
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    const lum = (c) => {
      const s = c.slice(0, 3).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    };
    /** 沿祖先链收集背景，遇到不透明层即止，再把半透明层逐层压上去 */
    function bgOf(el) {
      const stack = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const b = parse(getComputedStyle(n).backgroundColor);
        if (!b) continue;
        if (b[3] > 0.02) { stack.push(b); if (b[3] >= 0.999) break; }
      }
      if (!stack.length) return [255, 255, 255, 1];
      let acc = stack[stack.length - 1].slice();      // 最外层（不透明底）
      for (let i = stack.length - 2; i >= 0; i--) {
        const s = stack[i];
        acc = [0, 1, 2].map(k => s[k] * s[3] + acc[k] * (1 - s[3])).concat([1]);
      }
      return acc;
    }
    const hexOf = (c) => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const hits = [];
    doc.querySelectorAll('.fig__cell, .fig__pill, .fig__box, .fig__tok, .badge, .demo__stat b, .todo, .callout, .myth__body p, .takeaway__line, .quiz__opt, .modcard__tag, .demo__legend').forEach(el => {
      const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      if (!own.length) return;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color), bg = bgOf(el);
      if (!fg || !bg) return;
      const lf = lum(fg), lb = lum(bg);
      const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
      const small = parseFloat(cs.fontSize) < 18.5;
      if (ratio < (small ? 4.5 : 3)) {
        hits.push(el.className.toString().split(' ')[0] + ':' + ratio.toFixed(2) +
          hexOf(fg) + 'on' + hexOf(bg));
      }
    });
    return hits;
  }

  /* SVG 文字压在色块上的对比度扫描。演示与图解共用同一份实现，
     因为两边的故障模式一样：文字继承 var(--c-fg)，底色却是深色的热力档。
     三个曾各自造成误报的建模细节都写在这里：
     ① 有效不透明度 = 填充 alpha × 自身与祖先的 opacity；
     ② 全透明（rgba(0,0,0,0)）不是颜色，否则底色链会停在透明黑上，
        半透明色块被合成到纯黑，产出 1.42 这类假阳性；
     ③ SVG 是画家算法，只有文档序在文字【之前】的矩形才是背景，
        之后的矩形是盖在文字上的高亮带与光标条。 */
  function svgFillContrast(svg) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const parseCol = (c) => {
      const cv = doc.createElement('canvas'); cv.width = cv.height = 1;
      const x2 = cv.getContext('2d'); x2.fillStyle = '#010203'; x2.fillStyle = c;
      const v = x2.fillStyle;
      if (v === '#010203') return null;
      if (v.charAt(0) === '#') {
        const t = v.slice(1);
        return [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16), 1];
      }
      const mm = v.match(/rgba?\(([^)]+)\)/);
      if (!mm) return null;
      const pp = mm[1].split(/[,\s/]+/).filter(s => s !== '').map(Number);
      const alpha = pp.length > 3 ? pp[3] : 1;
      if (alpha === 0) return null;
      return [pp[0], pp[1], pp[2], alpha];
    };
    const relum = (c) => {
      const s = c.slice(0, 3).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    };
    const hexOf = (c) => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    /* 沿祖先链累积 opacity：卡片整体淡出时文字与色块的实际渲染色都是淡的 */
    const effAlpha = (el) => {
      let a = 1;
      for (let n = el; n && n.nodeType === 1 && n !== svg; n = n.parentElement) {
        const o = parseFloat(getComputedStyle(n).opacity);
        a *= isFinite(o) ? o : 1;
      }
      return a;
    };
    let bgSelf = parseCol(getComputedStyle(svg).backgroundColor);
    for (let n = svg.parentElement; !bgSelf && n && n.nodeType === 1; n = n.parentElement) {
      bgSelf = parseCol(getComputedStyle(n).backgroundColor);
    }
    const pageBg = bgSelf || parseCol(getComputedStyle(doc.body).backgroundColor) || [255, 255, 255, 1];
    const rects = [];
    let low = 0, worst = '';
    [...svg.querySelectorAll('rect, text')].forEach((node) => {
      if (String(node.tagName).toLowerCase() === 'rect') {
        const col = parseCol(getComputedStyle(node).fill);
        if (!col) return;
        const eff = col[3] * effAlpha(node);
        if (eff < 0.5) return;
        col[3] = eff;
        let b; try { b = node.getBBox(); } catch (e) { return; }
        const m = inv.multiply(node.getScreenCTM());
        if (!m) return;
        rects.push({
          x0: m.a * b.x + m.c * b.y + m.e, y0: m.b * b.x + m.d * b.y + m.f,
          x1: m.a * (b.x + b.width) + m.c * (b.y + b.height) + m.e,
          y1: m.b * (b.x + b.width) + m.d * (b.y + b.height) + m.f,
          col: col, cls: (node.getAttribute('class') || 'rect') + ''
        });
        return;
      }
      const t = node;
      if (!t.textContent.trim()) return;
      let b; try { b = t.getBBox(); } catch (e) { return; }
      const tm = inv.multiply(t.getScreenCTM());
      if (!tm) return;
      const cx = tm.a * (b.x + b.width / 2) + tm.c * (b.y + b.height / 2) + tm.e;
      const cy = tm.b * (b.x + b.width / 2) + tm.d * (b.y + b.height / 2) + tm.f;
      let bg = null, hitCls = '';
      for (const r of rects) {          // rects 只含更早的矩形，天然满足画家算法
        if (cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1) { bg = r.col; hitCls = r.cls.replace(/[\s,，]+/g, '-'); }
      }
      if (!bg) return;
      const fgRaw = parseCol(getComputedStyle(t).fill);
      if (!fgRaw) return;
      const bgEff = bg[3] >= 0.999 ? bg : [0, 1, 2].map(k => bg[k] * bg[3] + pageBg[k] * (1 - bg[3])).concat([1]);
      const ta = effAlpha(t);
      const fg = ta >= 0.999 ? fgRaw : [0, 1, 2].map(k => fgRaw[k] * ta + bgEff[k] * (1 - ta)).concat([1]);
      const a = relum(fg), c = relum(bgEff);
      const ratio = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
      if (ratio < 4.5) {
        low++;
        /* 诊断串只用 | 分隔：验证器按空白切 token，空格会把一个 flag 劈开 */
        if (!worst) worst = t.textContent.trim().replace(/[\s,，]+/g, '').slice(0, 8) + '@' + ratio.toFixed(2) +
          '|fg=' + hexOf(fg) + '|bg=' + hexOf(bgEff) + '|on=' + (hitCls || '?');
      }
    });
    return { low: low, worst: worst };
  }

  /* 一个演示 svg 在【当前状态】下的几何故障：越界 / 叠印 / 文字压色块对比度不足。
     runProbe（初始状态）与 runSweep（非默认状态）共用这一份实现——绝不允许两处各写
     一套判据，否则 sweep 用弱判据会得到「扫了其实没扫」的假绿。 */
  function geomFlags(svg) {
    const f = [];
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (vb.length !== 4) { f.push('NOVB'); return f; }
    const [vx, vy, vw, vh] = vb, eps = 2;
    const svgCTM = svg.getScreenCTM();
    if (!svgCTM) { f.push('NOCtm'); return f; }
    const inv = svgCTM.inverse();
    let over = 0, worst = '';
    const boxes = [];
    svg.querySelectorAll('text').forEach(t => {
      if (!t.textContent.trim()) return;
      /* 隐藏的刻度/标签（opacity:0 或 visibility:hidden）读者看不见，不该计入
         越界或叠印——否则一个「切换状态后只设 opacity=0、没清 textContent」的
         残留文字会被判成与可见标签重叠（实测 m08 双对数开关切换后就是这样，
         而纯 URL 单态加载复现不出，反证这是检测器盲区而非内容缺陷）。 */
      const st = getComputedStyle(t);
      if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) < 0.05) return;
      let b, ctm;
      try { b = t.getBBox(); ctm = t.getScreenCTM(); } catch (e) { return; }
      if (!ctm) return;
      /* getBBox 是元素【局部】坐标；被 transform 的组里的文字必须映射回
         svg 用户坐标，否则会被误判成越界。m = inv(svg)·elem 变换四角。 */
      const m = inv.multiply(ctm);
      /* 手写仿射变换：DOMMatrix.transformPoint 在部分上下文里不可用，
         而 a/b/c/d/e/f 是规范保证有的属性。
         (x,y) -> (a·x + c·y + e, b·x + d·y + f) */
      const A = m.a, B = m.b, C = m.c, D = m.d, E = m.e, F = m.f;
      const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach(([px, py]) => {
        const qx = A * px + C * py + E, qy = B * px + D * py + F;
        x0 = Math.min(x0, qx); y0 = Math.min(y0, qy);
        x1 = Math.max(x1, qx); y1 = Math.max(y1, qy);
      });
      if (x1 > vx + vw + eps || y1 > vy + vh + eps || x0 < vx - eps || y0 < vy - eps) {
        over++;
        if (!worst) worst = t.textContent.trim().replace(/[\s,，]+/g, '').slice(0, 12) +
          '@' + Math.round(x0) + ',' + Math.round(y0) + '~' + Math.round(x1) + ',' + Math.round(y1);
      }
      /* 样本串必须既无空格也无逗号：验证器按空白切分 key{...}、再按逗号切分 flag */
      boxes.push({ x0, y0, x1, y1, s: t.textContent.trim().replace(/[\s,，]+/g, '').slice(0, 10) });
    });
    if (over) f.push('OVER' + over + '|' + worst);

    /* 文字互相重叠：越界检测看不见「两段文字叠在一起」，
       而这在手工排坐标的 SVG 里是最常见的故障（m01/m03 就是这么发现的）。 */
    let clash = 0; const pairs = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      /* 两个方向都要有实质重叠（>2px），避免把紧贴的标签误判成重叠 */
      const iw = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
      const ih = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
      if (iw > 2 && ih > 2) {
        clash++;
        /* 分隔符不能含空格：验证器按空白切分 key{...} 令牌 */
        if (pairs.length < 6) pairs.push(a.s + '×' + c.s + '@' + Math.round(iw) + 'x' + Math.round(ih));
      }
    }
    if (clash) f.push('CLASH' + clash + '|' + pairs.join(';'));

    /* SVG 文字压在色块上的对比度。HTML 侧的 contrastSweep 只看
       background-color，看不见这种情形——m01 的条内标签就是这么溜过去的
       （黑字压 heat-3 深蓝 = 1.96:1）。算法与图解共用一份实现。 */
    const fc = svgFillContrast(svg);
    if (fc && fc.low) f.push('LOWFILL' + fc.low + '|' + fc.worst);
    return f;
  }

  /* 非默认状态扫描：一次页面加载内驱动所有演示遍历各自控件的边界值。
     §6.3「状态入 URL」实现了，但闸门只验初始态；标签叠印/越界常常只在某个
     非默认值才出现（m01 切到「语言式」并加长说明文字后才暴露，正是这一类）。

     不按 URL 组合启动 Chrome：全站 83 个 state 键、单演示最多 13 键，全笛卡尔积
     会爆炸，而起浏览器的开销正是记录在案要避免的。改为【页内循环】：
     - 每个键单独取边界值、其余键保持初值（一次只动一个，测完即恢复）；
     - 取值不靠正则猜，读控件本身：mark() 把 _dkKey 标在控件上，原生 range 自带
       min/max、select 自带 options、checkbox/toggle 就是两态；没有控件的键
       （seed/idx/sample 这类派生或播种值）不影响布局，跳过；
     - 驱动前先 pause() 停掉 rAF 循环——否则动画会在检查间隙把我们设的值覆盖掉，
       得到「扫了但没真扫」的假绿；绘制直接调 spec.draw(api)，绕过 api.draw()
       的 paused 守卫（就是要暂停状态下也能强制重绘）。 */
  function runSweep() {
    let tested = 0; const bad = [];
    doc.querySelectorAll('.demo[data-demo]').forEach(host => {
      const key = host.dataset.demo;
      const inst = AIP.registry[key];
      if (!inst || !host.classList.contains('is-live')) return;
      const svg = host.querySelector('.demo-svg');
      const api = inst.api;
      if (!svg || !api || !api.spec || typeof api.spec.draw !== 'function') return;
      api.pause();
      const base = Object.assign({}, api.state);
      const controls = [];
      host.querySelectorAll('*').forEach(el => {
        if (el._dkKey && Object.prototype.hasOwnProperty.call(base, el._dkKey)) controls.push(el);
      });
      const byKey = {};
      controls.forEach(w => {
        const k = w._dkKey;
        const rng = w.matches && w.matches('input[type=range]') ? w : w.querySelector && w.querySelector('input[type=range]');
        const sel = w.matches && w.matches('select') ? w : w.querySelector && w.querySelector('select');
        const chk = w.matches && w.matches('input[type=checkbox]') ? w : w.querySelector && w.querySelector('input[type=checkbox]');
        let vals = byKey[k] || [];
        if (rng) {
          const mn = Number(rng.min), mx = Number(rng.max);
          if (isFinite(mn) && isFinite(mx) && mx > mn) vals = vals.concat([mn, mx]);
        } else if (sel) {
          Array.prototype.forEach.call(sel.options, o => vals.push(o.value));
        } else if (chk || (w.classList && w.classList.contains('dk-toggle'))) {
          vals = vals.concat([true, false]);
        }
        if (vals.length) byKey[k] = vals;
      });
      Object.keys(byKey).forEach(k => {
        byKey[k].forEach(raw => {
          let v = raw;
          if (typeof base[k] === 'number') v = Number(raw);
          if (typeof base[k] === 'boolean') v = (raw === true || raw === 'true');
          api.state[k] = v;
          controls.forEach(w => { if (w._dkKey === k && w._dkRestore) w._dkRestore(api.state); });
          tested++;
          const restoreNow = () => {
            api.state[k] = base[k];
            controls.forEach(w => { if (w._dkKey === k && w._dkRestore) w._dkRestore(api.state); });
            try { api.spec.draw(api); } catch (e) { /* 恢复失败不掩盖已记录的判定 */ }
          };
          let drew = true;
          try { api.spec.draw(api); }
          catch (e) { drew = false; bad.push(key + ':' + k + '=' + String(v).replace(/[^\w.一-鿿-]/g, '') + '@DRAWERR'); }
          if (drew) {
            const flags = geomFlags(svg).filter(x => /^OVER|^CLASH|^LOWFILL|^NOVB|^NOCtm/.test(x));
            if (flags.length) bad.push(key + ':' + k + '=' + String(v).replace(/[^\w.一-鿿-]/g, '') + '@' + flags[0].replace(/[ ,;]/g, '/').slice(0, 46));
          }
          restoreNow();   // 无论成败都恢复，保证下一键仍从初值出发（一次只动一个键）
        });
      });
      api.resume();
    });
    return { tested, bad };
  }

  function runProbe(sweepOn) {
    const out = [];
    doc.querySelectorAll('.demo[data-demo]').forEach(host => {
      const key = host.dataset.demo;
      const svg = host.querySelector('.demo-svg');
      const f = [];
      if (!host.classList.contains('is-live')) f.push('NOTLIVE');
      if (!svg) { out.push(key + '{' + (f.join(',') || 'NOSVG') + '}'); return; }
      if (!host.querySelector('.demo__field, .demo__controls select, .dk-toggle')) f.push('NOCTRL');
      if (!host.querySelector('.demo__legend')) f.push('NOHINT');
      if (!/重置/.test(host.textContent || '')) f.push('NORESET');
      if (/尚未实现|演示加载失败/.test(host.textContent || '')) f.push('PLACEHOLDER');
      // 几何故障（越界/叠印/压色块）与 sweep 共用 geomFlags 同一份判据
      f.push.apply(f, geomFlags(svg));
      out.push(key + '{' + f.join(',') + '}');
    });

    /* 页面级检查：横向溢出（移动端最常见故障）、主题是否真的生效、
       正文对比度是否够（§13.1 要求正文 7:1） */
    const de = doc.documentElement;
    const pg = [];
    const over = de.scrollWidth - de.clientWidth;
    if (over > 2) {
      /* 找出最宽的元凶，方便定位 */
      let culprit = '', widest = 0;
      doc.querySelectorAll('body *').forEach(el => {
        const w = el.getBoundingClientRect().right;
        if (w > widest) { widest = w; culprit = (el.tagName + '.' + (el.className || '')).toString().replace(/\s+/g, '-').slice(0, 40); }
      });
      pg.push('HSCROLL+' + Math.round(over) + '|' + culprit);
    }
    const cs = getComputedStyle(doc.body);
    const bg = cs.backgroundColor, fg = cs.color;
    const lum = (c) => {
      const m = c.match(/(\d+(?:\.\d+)?)/g);
      if (!m) return 0;
      const [r, g, b] = m.slice(0, 3).map(v => {
        const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (Math.max(lum(bg), lum(fg)) + 0.05) / (Math.min(lum(bg), lum(fg)) + 0.05);
    pg.push('THEME=' + (root.getAttribute('data-theme') || '?') + '/' + (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'LOW' + ratio.toFixed(1)));
    const tocShown = getComputedStyle(doc.getElementById('toc') || doc.body).display !== 'none';
    const navShown = getComputedStyle(doc.getElementById('sitenav') || doc.body).display !== 'none';
    pg.push('W=' + de.clientWidth + '/toc=' + (tocShown ? 'y' : 'n') + '/nav=' + (navShown ? 'y' : 'n'));
    /* 对比度扫描：暗色主题下最容易出现「有背景色的格子用了同色系文字」 */
    try {
      const hits = contrastSweep();
      if (hits.length) pg.push('CONTRAST' + hits.length + '|' + hits.slice(0, 3).join('/'));
    } catch (e) { pg.push('CONTRASTERR'); }
    /* 图解扫描：静态内容里的 18 张内联 SVG 与演示有同样的故障模式
       （文字继承 var(--c-fg)，底色却是深色热力档），
       此前「对比度已逐个验证」的声明只覆盖了 HTML 与演示，这里是补齐。 */
    let dLow = 0, dWorst = '', dScanned = 0;
    doc.querySelectorAll('.figure svg').forEach(s => {
      if (!s.getBoundingClientRect().width) return;   // 未显示的段（?only=）跳过
      dScanned++;
      const r = svgFillContrast(s);
      if (r && r.low) { dLow += r.low; if (!dWorst) dWorst = (s.closest('.figure').dataset.fig || '?') + ':' + r.worst; }
    });
    pg.push('FIGSCAN=' + dScanned);
    if (dLow) pg.push('FIGLOW' + dLow + '|' + dWorst);

    /* 非默认状态扫描放在页面级检查【之后】：sweep 会驱动演示状态（一次只动一个键、
       测完恢复），放在最后就不扰动上面那些基于初始态的判定。
       必须报告扫了多少组：只报「有没有命中」分不清「扫过且干净」与「根本没扫到控件」。
       tested 由控件的 min/max/options 推出来，控件缺失或键没绑上就会是 0 → 空跑可见。 */
    if (sweepOn) {
      const sw = runSweep();
      /* 必须报告扫了多少组：只报「有没有命中」分不清「扫过且干净」与「根本没扫到控件」。
         tested 由控件的 min/max/options 推出来，控件缺失或键没绑上就会是 0 → 空跑可见。 */
      const toks = sw.bad.slice(0, 8).map(b => b.replace(/[ ,;]/g, '/'));
      pg.push('SWEEP=' + sw.tested + (toks.length ? '/BAD' + sw.bad.length + ':' + toks.join('&') : ''));
      /* title 里的 token 要截断（属性长度有限），但命中一条都不该被藏起来：
         完整清单走 console.error，--enable-logging=stderr 会收到，验证脚本逐行读。 */
      if (typeof console !== 'undefined' && console.error) {
        sw.bad.slice(0, 40).forEach(b => console.error('[SWEEP-BAD] ' + b));
      }
    }

    out.push('PAGE{' + pg.join(',') + '}');

    root.setAttribute('data-probe', out.join(' '));
    doc.title = 'PROBE::' + out.join(' ');
  }

  function initDebugQuery() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.has('mountall')) doc.querySelectorAll('.demo[data-demo]').forEach(mountOne);
    /* ?theme=dark 强制切主题：无头浏览器每次都是全新 profile，
       没法靠 localStorage 复现暗色，自动化验证需要一个显式开关 */
    const th = q.get('theme');
    if (th === 'dark' || th === 'light' || th === 'auto') applyTheme(th);
    /* 探针要等一帧，让刚插入的 SVG 完成布局后 getBBox 才有真实尺寸 */
    if (q.has('probe')) {
      const doSweep = q.has('sweep');
      requestAnimationFrame(() => setTimeout(() => runProbe(doSweep), 80));
    }
    const only = q.get('only');
    if (!only) return;
    const t = doc.getElementById(only);
    if (!t) { console.warn('[AIP] ?only= 找不到元素 ' + only); return; }
    root.style.scrollBehavior = 'auto';
    // grid 子项 display:none 后不再占位，会让 main 掉进 260px 的侧栏列，
    // 因此必须同时把 .layout 改成单列。
    const lay = doc.querySelector('.layout');
    if (lay) lay.style.gridTemplateColumns = 'minmax(0,1fr)';
    ['.hero', '.modmap', '.sitefooter', '.readbar', '.sidebar', '.toc', '.sectionnav']
      .forEach(sel => doc.querySelectorAll(sel).forEach(n => { n.style.display = 'none'; }));
    const mod = t.closest('.module');
    doc.querySelectorAll('.module').forEach(m => { if (m !== mod) m.style.display = 'none'; });
    if (mod) {
      mod.querySelectorAll('.module__pager').forEach(n => n.style.display = 'none');
      if (t.classList.contains('seg')) mod.querySelectorAll('.seg').forEach(s => { if (s !== t) s.style.display = 'none'; });
      const head = mod.querySelector('.module__head');
      if (head) head.style.display = '';
    }
    doc.body.classList.add('debug-only');
    if (mod && mod.dataset.demo) mountOne(mod.querySelector('.demo[data-demo]') || { dataset: {} });
    requestAnimationFrame(() => t.scrollIntoView({ block: 'start' }));
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    try { initTheme(); } catch (e) { console.error('[AIP theme]', e); }
    try { initNav(); } catch (e) { console.error('[AIP nav]', e); }
    try { initProgress(); } catch (e) { console.error('[AIP progress]', e); }
    try { initScrollSpy(); } catch (e) { console.error('[AIP spy]', e); }
    try { initReadBar(); } catch (e) { console.error('[AIP readbar]', e); }
    try { initTerms(); } catch (e) { console.error('[AIP terms]', e); }
    try { initQuiz(); } catch (e) { console.error('[AIP quiz]', e); }
    try { initSteps(); } catch (e) { console.error('[AIP steps]', e); }
    try { initLightbox(); } catch (e) { console.error('[AIP lightbox]', e); }
    try { initSearch(); } catch (e) { console.error('[AIP search]', e); }
    try { initKeys(); } catch (e) { console.error('[AIP keys]', e); }
    try { initPrereqHint(); } catch (e) { console.error('[AIP prereq]', e); }
    try { initHash(); } catch (e) { console.error('[AIP hash]', e); }
    try { mountDemos(); } catch (e) { console.error('[AIP demos]', e); }
    try { initDebugQuery(); } catch (e) { console.error('[AIP debug]', e); }
  }
  /* ---------------- 启动 ----------------
     注意时序：本文件以 defer 加载，先于 demo-kit.js 与各 demo 脚本执行，
     此时 AIP.demos 注册表还是空的。因此必须等 DOMContentLoaded
     （defer 脚本全部执行完之后才触发）再 boot，否则 mountall 找不到工厂。 */
  if (doc.readyState === 'complete') boot();
  else addEventListener('DOMContentLoaded', boot, { once: true });
})();
