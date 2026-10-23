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
  function initDebugQuery() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.has('mountall')) doc.querySelectorAll('.demo[data-demo]').forEach(mountOne);
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
