/* ==========================================================================
   app.js · v0.1 骨架交互层（零依赖，DESIGN.md §6.3 §9 §10.3）
   职责：主题三段切换 / 抽屉导航 / scroll-spy / 阅读进度 / 已读进度 /
        键盘快捷键 / Demo 挂载注册表
   约束：不使用 scroll 事件做高亮（IntersectionObserver）；
        尊重 prefers-reduced-motion；无 JS 时页面文字仍可读。
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var STORE = { theme: 'aip.theme', done: 'aip.done', map: 'aip.map' };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 全局命名空间（Demo 契约，§6.3） ---------------- */
  var AIP = window.AIPrinciples = {
    version: '0.1.0',
    /* 每个 demo 文件注册一个工厂：{ mount, update, reset, destroy, pause, frames? } */
    demos: {},
    registry: {},      // key -> instance
    register: function (key, factory) { this.demos[key] = factory; },
    /* TODO(v0.2): 依 §6.3 约定实现视口懒挂载，见下方 mountDemos() */
    mountDemos: mountDemos
  };

  /* ========================================================================
     1. 主题：跟随系统 / 亮 / 暗（§8.2），选择持久化
     ======================================================================== */
  var themeButtons = Array.prototype.slice.call(doc.querySelectorAll('.themeswitch__btn'));

  function applyTheme(value) {
    root.setAttribute('data-theme', value);
    var resolved = value;
    if (value === 'auto') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    doc.querySelectorAll('meta[name="color-scheme"]').forEach(function (m) {
      m.setAttribute('content', resolved === 'dark' ? 'dark light' : 'light dark');
    });
    themeButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeValue === value));
    });
  }

  function initTheme() {
    var saved;
    try { saved = localStorage.getItem(STORE.theme) || 'auto'; } catch (e) { saved = 'auto'; }
    applyTheme(saved);
    themeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.dataset.themeValue;
        applyTheme(v);
        try { localStorage.setItem(STORE.theme, v); } catch (e) { /* 隐私模式忽略 */ }
      });
    });
    // 跟随系统时，响应系统切换
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      var cur; try { cur = localStorage.getItem(STORE.theme) || 'auto'; } catch (e) { cur = 'auto'; }
      if (cur === 'auto') applyTheme('auto');
    });
  }

  /* ========================================================================
     2. 抽屉导航（<768 断点，§8.4）
     ======================================================================== */
  var navToggle = doc.getElementById('nav-toggle');

  function setNav(open) {
    doc.body.classList.toggle('nav-open', open);
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '关闭学习地图' : '打开学习地图');
    }
  }

  function initNav() {
    if (navToggle) {
      navToggle.addEventListener('click', function () {
        setNav(!doc.body.classList.contains('nav-open'));
      });
    }
    // 点遮罩关闭
    doc.addEventListener('click', function (ev) {
      if (!doc.body.classList.contains('nav-open')) return;
      var t = ev.target;
      if (t.closest('#sitenav') || t.closest('#nav-toggle')) return;
      setNav(false);
    });
    // 窄屏点击地图链接后自动收起
    doc.querySelectorAll('#sitenav a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (window.matchMedia('(max-width:880px)').matches) setNav(false);
      });
    });
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && doc.body.classList.contains('nav-open')) {
        setNav(false); if (navToggle) navToggle.focus();
      }
    });
    // 折叠态持久化（§9.1）
    doc.querySelectorAll('.maptree__part').forEach(function (d) {
      var key = STORE.map + '.' + d.dataset.part;
      try {
        var s = localStorage.getItem(key);
        if (s !== null) d.open = s === '1';
      } catch (e) { /* noop */ }
      d.addEventListener('toggle', function () {
        try { localStorage.setItem(key, d.open ? '1' : '0'); } catch (e) { /* noop */ }
      });
    });
  }

  /* ========================================================================
     3. scroll-spy：模块高亮 + 当前模块六段高亮（§9.1，不用 scroll 事件）
     ======================================================================== */
  var modules = Array.prototype.slice.call(doc.querySelectorAll('.module'));
  var segsByModule = {};
  modules.forEach(function (m) {
    segsByModule[m.id] = Array.prototype.slice.call(m.querySelectorAll('.seg'));
  });

  var tocList = doc.getElementById('toc-list');
  var sectionnavs = doc.querySelectorAll('.sectionnav');
  var mapLinks = doc.querySelectorAll('.maptree__mods a');
  var topLinks = doc.querySelectorAll('.topnav a');
  var currentModuleId = null;

  /* 把 TOC 条目重建为「当前模块」的六段（右栏 TOC 是模块级的） */
  function renderTocFor(moduleId) {
    if (!tocList) return;
    var mod = doc.getElementById(moduleId);
    if (!mod) return;
    var items = mod.querySelectorAll('.seg');
    tocList.innerHTML = '';
    Array.prototype.forEach.call(items, function (seg) {
      var li = doc.createElement('li');
      var a = doc.createElement('a');
      a.href = '#' + seg.id;
      a.dataset.seg = seg.dataset.seg;
      var h = seg.querySelector('h3');
      a.textContent = h ? h.textContent : seg.dataset.seg;
      li.appendChild(a);
      tocList.appendChild(li);
    });
  }

  function setCurrentModule(id) {
    if (id === currentModuleId) return;
    currentModuleId = id;
    var mod = doc.getElementById(id);
    var part = mod ? mod.dataset.part : null;

    mapLinks.forEach(function (a) {
      a.setAttribute('aria-current', String(a.dataset.mod === id));
    });
    renderTocFor(id);
    if (part) {
      topLinks.forEach(function (a) {
        a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + part));
      });
      // 展开所属 Part 分组（若被折叠）
      var group = doc.querySelector('.maptree__part[data-part="' + part + '"]');
      if (group && !group.open) group.open = true;
    }
  }

  function markSeg(moduleId, segId) {
    var mod = doc.getElementById(moduleId);
    var nav = mod ? mod.querySelector('.sectionnav') : null;
    if (nav) {
      nav.querySelectorAll('a').forEach(function (a) {
        a.classList.toggle('is-current', a.getAttribute('href') === '#' + segId);
      });
    }
    if (tocList) {
      tocList.querySelectorAll('a').forEach(function (a) {
        a.classList.toggle('is-current', a.getAttribute('href') === '#' + segId);
      });
    }
    var seg = doc.getElementById(segId);
    if (seg) seg.classList.add('is-current');
    doc.querySelectorAll('.seg.is-current').forEach(function (s) {
      if (s !== seg) s.classList.remove('is-current');
    });
  }

  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;

    // 模块可见性：以「进入视口最多的那个」为当前模块
    var visible = {};
    var modObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        visible[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0;
      });
      var best = null, bestRatio = 0;
      Object.keys(visible).forEach(function (id) {
        if (visible[id] > bestRatio) { bestRatio = visible[id]; best = id; }
      });
      if (best) setCurrentModule(best);
    }, { rootMargin: '-30% 0px -50% 0px', threshold: [0, .1, .25, .5, .75, 1] });
    modules.forEach(function (m) { modObs.observe(m); });

    // 段落可见性：驱动 sectionnav 与 TOC 高亮
    var segObs = new IntersectionObserver(function (entries) {
      var top = null;
      entries.forEach(function (e) {
        if (e.isIntersecting && (!top || e.boundingClientRect.top < top.boundingClientRect.top)) top = e;
      });
      if (top) {
        var seg = top.target;
        markSeg(seg.closest('.module').id, seg.id);
      }
    }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });
    doc.querySelectorAll('.seg').forEach(function (s) { segObs.observe(s); });
  }

  /* ========================================================================
     4. 阅读进度条（§9.2）—— 用 rAF 节流，不用 passive scroll 里的重计算
     ======================================================================== */
  function initReadBar() {
    var fill = doc.getElementById('readbar-fill');
    if (!fill) return;
    var ticking = false;
    function update() {
      var h = doc.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var pct = max > 0 ? Math.min(100, Math.max(0, (h.scrollTop || doc.body.scrollTop) / max * 100)) : 0;
      fill.style.width = pct.toFixed(2) + '%';
      ticking = false;
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ========================================================================
     5. 已读进度：localStorage + 首页环形（§9.1）
     ======================================================================== */
  var TOTAL_MODULES = modules.length;

  function readDone() {
    try { return JSON.parse(localStorage.getItem(STORE.done) || '[]'); } catch (e) { return []; }
  }
  function writeDone(list) {
    try { localStorage.setItem(STORE.done, JSON.stringify(list)); } catch (e) { /* noop */ }
  }
  function paintProgress() {
    var done = readDone();
    doc.querySelectorAll('.modcard__done input').forEach(function (cb) {
      cb.checked = done.indexOf(cb.dataset.done) >= 0;
    });
    mapLinks.forEach(function (a) {
      a.classList.toggle('is-done', done.indexOf(a.dataset.mod) >= 0);
    });
    var counter = doc.getElementById('progress-count');
    if (counter) counter.textContent = done.length + '/' + TOTAL_MODULES + ' 已完成';
    var ring = doc.getElementById('hero-ring');
    if (ring) {
      var C = 176; // 2πr, r=28
      var offset = C * (1 - (TOTAL_MODULES ? done.length / TOTAL_MODULES : 0));
      ring.style.strokeDashoffset = offset.toFixed(1);
      var label = doc.querySelector('.ring-label');
      if (label) label.textContent = Math.round(done.length / TOTAL_MODULES * 100) + '%';
    }
  }
  function initProgress() {
    doc.querySelectorAll('.modcard__done input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.dataset.done;
        var done = readDone();
        var i = done.indexOf(id);
        if (cb.checked && i < 0) done.push(id);
        if (!cb.checked && i >= 0) done.splice(i, 1);
        writeDone(done); paintProgress();
      });
    });
    var reset = doc.getElementById('progress-reset');
    if (reset) reset.addEventListener('click', function () {
      writeDone([]); paintProgress();
    });
    paintProgress();
  }

  /* ========================================================================
     6. 键盘快捷键（§9.2）：t 主题 / j k 段间跳 / [ ] 换模块 / Esc
     ======================================================================== */
  function initKeys() {
    var order = modules.map(function (m) { return m.id; });
    doc.addEventListener('keydown', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      var tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable) return;

      var k = ev.key.toLowerCase();
      if (k === 't') {
        var cur; try { cur = localStorage.getItem(STORE.theme) || 'auto'; } catch (e) { cur = 'auto'; }
        var next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
        applyTheme(next); try { localStorage.setItem(STORE.theme, next); } catch (e) { /* noop */ }
        return;
      }
      if (k === 'j' || k === 'k') {
        var list = currentModuleId ? segsByModule[currentModuleId] : null;
        if (!list || !list.length) return;
        var idx = -1;
        list.forEach(function (s, i) { if (s.classList.contains('is-current')) idx = i; });
        idx = k === 'j' ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
        list[idx].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        ev.preventDefault(); return;
      }
      if (k === '[' || k === ']') {
        var i = order.indexOf(currentModuleId);
        if (i < 0) i = 0;
        i = k === ']' ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
        location.hash = order[i];
        ev.preventDefault(); return;
      }
    });
  }

  /* ========================================================================
     7. 图解 Lightbox（§9.2）
     ======================================================================== */
  function initLightbox() {
    var dlg = doc.getElementById('lightbox');
    var stage = doc.getElementById('lightbox-stage');
    var close = doc.getElementById('lightbox-close');
    if (!dlg || !stage) return;
    doc.querySelectorAll('.figure').forEach(function (fig) {
      var slot = fig.querySelector('.figure__slot');
      if (!slot) return;
      slot.setAttribute('data-zoomable', '');
      slot.setAttribute('tabindex', '0');
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-label', '放大查看这张图解');
      function open() {
        var cap = fig.querySelector('figcaption');
        stage.innerHTML = '';
        stage.appendChild(fig.cloneNode(true).querySelector('.figure__slot'));
        var t = dlg.querySelector('.lightbox__title');
        if (t) t.textContent = (fig.dataset.fig || '图解') + (cap ? ' · ' + cap.textContent : '');
        if (typeof dlg.showModal === 'function') dlg.showModal();
      }
      slot.addEventListener('click', open);
      slot.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
    if (close) close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  }

  /* ========================================================================
     8. Demo 懒挂载（§6.3 / §10.3）
     骨架阶段：注册表为空，占位画布保留视觉结构；v0.2 起每个 demo 文件
     调 AIPrinciples.register('m07-attn-map', factory) 后自动生效。
     ======================================================================== */
  function mountDemos() {
    var hosts = Array.prototype.slice.call(doc.querySelectorAll('.demo[data-demo]'));
    if (!hosts.length) return;
    if (!('IntersectionObserver' in window)) {
      hosts.forEach(function (h) { console.warn('[AIP] 无 IntersectionObserver，demo 不自动挂载：', h.dataset.demo); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var host = e.target, key = host.dataset.demo;
        if (e.isIntersecting) {
          if (AIP.registry[key]) { if (AIP.registry[key].resume) AIP.registry[key].resume(); return; }
          var factory = AIP.demos[key];
          if (!factory) {                     // 尚未实现（骨架期的正常状态）
            var slot = host.querySelector('.demo__canvas');
            if (slot && !slot.dataset.marked) {
              slot.dataset.marked = '1';
              slot.textContent = '演示「' + key + '」待实现（DESIGN.md §6）';
            }
            return;
          }
          try { AIP.registry[key] = factory().mount(host); } catch (err) {
            console.error('[AIP] demo 挂载失败', key, err);
          }
        } else if (AIP.registry[key] && AIP.registry[key].pause) {
          AIP.registry[key].pause();
        }
      });
    }, { rootMargin: '200px 0px', threshold: 0 });
    hosts.forEach(function (h) { io.observe(h); });
  }

  /* ========================================================================
     9. 锚点直达：从搜索/外链进来时展开对应分组并滚动到位
     ======================================================================== */
  function initHash() {
    function handle() {
      var id = location.hash.replace(/^#/, '');
      if (!id) return;
      var el = doc.getElementById(id.split('--')[0]);
      if (el && el.classList.contains('module')) {
        var part = el.dataset.part;
        var group = doc.querySelector('.maptree__part[data-part="' + part + '"]');
        if (group) group.open = true;
        setCurrentModule(el.id);
      }
    }
    window.addEventListener('hashchange', handle);
    handle();
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initTheme();
    initNav();
    initProgress();
    initScrollSpy();
    initReadBar();
    initKeys();
    initLightbox();
    initHash();
    mountDemos();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
