/* ==========================================================================
   build.js · 站点构建器（零依赖，仅用 Node 内置模块）
   依据 DESIGN.md §10.3 / §11.2：modules.json 是唯一真相源，
   index.html 由 templates/shell.html + content/modules/*.html 生成。

   用法：node build.js
   产物：index.html（可直接提交，GitHub Pages 无需构建即可托管）

   设计取舍：内容以 HTML partial 存放而非 Markdown，因为本站内容以
   内联 SVG 图解与交互容器为主体，Markdown 反而需要额外解析依赖。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/modules.json'), 'utf8'));
const SEG_LABEL = DATA.site.segLabels;
const SEG_ORDER = DATA.site.segEnum;
const errors = [];
const warn = (m) => errors.push(m);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------------- 1. 左栏学习地图 ---------------- */
function buildSidebar() {
  const groups = DATA.parts.map((p) => {
    const mods = DATA.modules.filter((m) => m.part === p.id);
    return `        <details class="maptree__part" data-part="${p.id}"${p.order === 1 ? ' open' : ''}>
          <summary><span class="maptree__partno">${String(p.order).padStart(2, '0')}</span> ${esc(p.title)}</summary>
          <ul class="maptree__mods">
${mods.map((m) => `            <li><a href="#${m.id}" data-mod="${m.id}"><i>${String(m.num).padStart(2, '0')}</i>${esc(m.title)}</a></li>`).join('\n')}
          </ul>
        </details>`;
  });
  return groups.join('\n');
}

/* ---------------- 2. 首页模块索引卡 ---------------- */
const LEVEL = { 1: '入门', 2: '基础', 3: '进阶', 4: '深入', 5: '前沿' };

function badgeRow(m) {
  const b = [`<span class="badge badge--lvl">难度 ${m.difficulty}·${LEVEL[m.difficulty] || ''}</span>`,
             `<span class="badge badge--time">~${m.estMinutes} 分钟</span>`];
  if (/flagship/.test(m.demo.type)) b.push('<span class="badge badge--demo">旗舰演示</span>');
  if (m.formulaDense) b.push('<span class="badge badge--math">公式密集</span>');
  if (m.debate) b.push('<span class="badge badge--debate">存在争议</span>');
  return b.join('');
}
function prereqLabel(m) {
  if (!m.prereq.length) return '无';
  return m.prereq.map((p) => p.toUpperCase().slice(1)).join(' ');
}

function buildModmap() {
  return DATA.parts.map((p) => {
    const mods = DATA.modules.filter((m) => m.part === p.id);
    return `      <div class="modmap__group" id="${p.id}" data-part="${p.id}">
        <h3><span class="modmap__groupno">${String(p.order).padStart(2, '0')}</span> ${esc(p.title)}</h3>
        <p class="modmap__groupnote">${esc(p.note || '')}</p>
        <ul class="modgrid">
${mods.map((m) => `          <li><article class="modcard" data-mod="${m.id}" data-status="${m.status}">
            <header><span class="modcard__no">M${String(m.num).padStart(2, '0')}</span>${badgeRow(m)}</header>
            <h4><a href="#${m.id}">${esc(m.title)}</a></h4>
            <p class="modcard__tag">${esc(m.tagline)}</p>
            <p class="modcard__meta">~${m.estMinutes} 分钟 · 前置：${esc(prereqLabel(m))}</p>
            <label class="modcard__done"><input type="checkbox" data-done="${m.id}"><span>已读</span></label>
          </article></li>`).join('\n')}
        </ul>
      </div>`;
  }).join('\n');
}

/* ---------------- 3. 模块区：读 partial + 组装六段式 ---------------- */
/* partial 格式：content/modules/<id>.html
   内含若干 <seg name="hook"> ... </seg> 自定义标签（构建期转换，避免解析真 HTML）*/
function loadPartial(id) {
  const file = path.join(ROOT, 'content/modules', id + '.html');
  if (!fs.existsSync(file)) { warn(`缺少内容文件 content/modules/${id}.html`); return {}; }
  const src = fs.readFileSync(file, 'utf8');
  const out = {};
  const re = /<seg\s+name="([a-z-]+)"([^>]*)>([\s\S]*?)<\/seg>/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    if (!SEG_ORDER.includes(name)) { warn(`${id}: 未知段落名 data-seg="${name}"（合法值：${SEG_ORDER.join(', ')}）`); continue; }
    if (out[name]) { warn(`${id}: 段落 ${name} 重复`); continue; }
    out[name] = { attrs: m[2].trim(), body: m[3].trim() };
  }
  // 允许 partial 用 <meta title="" tag=""> 覆盖标题/tagline
  const meta = {};
  const metaRe = /<meta\s+([^>]*)>/g;
  let mm;
  while ((mm = metaRe.exec(src))) {
    const attrs = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = attrs.exec(mm[1]))) meta[a[1]] = a[2];
  }
  return { segs: out, meta };
}

function buildModule(m, prev, next) {
  const loaded = loadPartial(m.id);
  const segs = loaded.segs || {};
  const meta = loaded.meta || {};
  SEG_ORDER.forEach((s) => {
    if (!segs[s]) warn(`${m.id}: 缺少段落 ${s}（六段式硬性规则 H1）`);
  });

  const headTitle = meta.title || m.title;
  const headTag = meta.tagline || m.tagline;
  const head = `        <header class="module__head">
          <p class="module__no">M${String(m.num).padStart(2, '0')} · ${esc((DATA.parts.find(p => p.id === m.part) || {}).title || '')}</p>
          <h2 id="${m.id}-title">${esc(headTitle)}</h2>
          <p class="module__tag">${esc(headTag)}</p>
          <div class="module__badges">${badgeRow(m)}</div>
        </header>`;

  const nav = `        <div class="sectionnav" role="navigation" aria-label="M${String(m.num).padStart(2, '0')} 段落">
${SEG_ORDER.map((s) => `          <a href="#${m.id}--${s}">${esc(SEG_LABEL[s])}</a>`).join('\n')}
        </div>`;

  const body = SEG_ORDER.map((s) => {
    const seg = segs[s];
    if (!seg) return `        <article class="seg" id="${m.id}--${s}" data-seg="${s}"><h3>${esc(SEG_LABEL[s])}</h3><p class="todo">段落缺失（构建期报错项）</p></article>`;
    const extra = seg.attrs ? ' ' + seg.attrs : '';
    let inner = seg.body;
    /* demo 段若作者未写容器，按 modules.json 的 demo.id 自动注入标准宿主 */
    if (s === 'demo' && !/data-demo=/.test(inner)) {
      inner = `          <div class="demo${/flagship/.test(m.demo.type) ? ' demo--flagship' : ''}" data-demo="${m.demo.id}" data-demo-title="${esc(m.demo.title || '')}">
            <div class="demo__canvas"></div>
            <div class="demo__controls"></div>
          </div>
` + inner;
    }
    return `        <article class="seg${seg.body.length ? ' has-content' : ''}" id="${m.id}--${s}" data-seg="${s}"${extra}>
          <h3>${esc(SEG_LABEL[s])}</h3>
${inner.split('\n').map((l) => '          ' + l).join('\n')}
        </article>`;
  }).join('\n');

  const pager = `        <footer class="module__pager">
${prev ? `          <a class="module__pager-prev" href="#${prev.id}"><span>上一模块</span> M${String(prev.num).padStart(2, '0')} ${esc(prev.title)}</a>` : '          <span class="module__pager-prev"><span>第一个模块</span></span>'}
${next ? `          <a class="module__pager-next" href="#${next.id}"><span>下一模块</span> M${String(next.num).padStart(2, '0')} ${esc(next.title)}</a>` : '          <span class="module__pager-next"><span>最后一个模块</span><a href="#home">回学习地图</a></span>'}
        </footer>`;

  return `      <section class="module" id="${m.id}" data-module="${m.id}" data-part="${m.part}" data-status="${m.status}" data-prereq="${m.prereq.join(' ')}" data-demo="${m.demo.id}" aria-labelledby="${m.id}-title">
${head}
${nav}
${body}
${pager}
      </section>`;
}

function buildModules() {
  return DATA.modules.map((m, i) => buildModule(m, DATA.modules[i - 1], DATA.modules[i + 1])).join('\n\n');
}

/* ---------------- 4. demo 脚本清单（按模块顺序） ---------------- */
function buildDemoScripts() {
  const list = DATA.modules.filter((m) => fs.existsSync(path.join(ROOT, 'assets/js/demos', m.demo.id + '.js')));
  const missing = DATA.modules.filter((m) => !fs.existsSync(path.join(ROOT, 'assets/js/demos', m.demo.id + '.js')));
  if (missing.length) warn('演示文件缺失：' + missing.map((m) => m.demo.id + '.js').join(', '));
  const kit = fs.existsSync(path.join(ROOT, 'assets/js/demo-kit.js'))
    ? ['  <script src="./assets/js/demo-kit.js" defer></script>']
    : ['WARN'];
  if (kit[0] === 'WARN') warn('缺少 assets/js/demo-kit.js（所有演示依赖它）');
  return kit.concat(list.map((m) => `  <script src="./assets/js/demos/${m.demo.id}.js" defer></script>`)).join('\n');
}

/* ---------------- 5. 组装 ---------------- */
/* 站点说明只由数据推导，不含构建时钟：
   带日期的戳会让每次构建都弄脏工作树（不可复现），而且「构建于今天」
   会让读者误以为内容刚被复核过——内容新鲜度该由 §14 的逐条 [YYYY-MM] 表达。
   状态取所有模块里最弱的一环（木桶），而不是内部 phase 标识：
   读者关心「这篇能不能信」，不关心版本号。 */
const totalMin = DATA.modules.reduce((a, m) => a + (m.estMinutes || 0), 0);
/* statusEnum 在顶层（不在 site 下）。缺失时降级为不显示状态，而不是崩溃——
   构建器崩掉会让 --stdout 的陈旧比对误报成「构建器报错」。 */
const RANK = Array.isArray(DATA.statusEnum) && DATA.statusEnum.length ? DATA.statusEnum : null;
const SHORT = (DATA.site && DATA.site.statusShort) || {};
let statusNote = '';
if (!RANK) {
  warn('modules.json 缺少 statusEnum，侧栏不显示内容状态');
} else if (!DATA.modules.length) {
  /* 空列表会让 reduce 直接返回种子（最强档），等于凭空宣称「已定稿」——
     这正是本站最忌讳的不可验证声明，所以宁可不显示。 */
  warn('modules.json 没有任何模块，侧栏不显示内容状态');
} else {
  /* 种子必须是【最强】档，让任何更弱的模块把它替换掉。
     若用 RANK[0]（最弱档）起步，就没有模块能比它更弱，结果会恒为 skeleton。 */
  const weakest = DATA.modules.reduce((w, m) =>
    RANK.indexOf(m.status) < RANK.indexOf(w) ? m.status : w, RANK[RANK.length - 1]);
  if (!SHORT[weakest]) warn(`statusShort 缺少 "${weakest}" 的短标签`);
  else statusNote = ` · 内容${SHORT[weakest]}`;
}
const SITE_NOTE = `${DATA.modules.length} 个模块 · 约 ${Math.round(totalMin / 60)} 小时${statusNote}` +
  `<br>设计文档见 <a href="./DESIGN.md">DESIGN.md</a>`;

const shell = fs.readFileSync(path.join(ROOT, 'templates/shell.html'), 'utf8');
const out = shell
  .replace('<!-- @SITE_NOTE -->', SITE_NOTE)
  .replace('<!-- @SIDEBAR -->', buildSidebar())
  .replace('<!-- @MODMAP -->', buildModmap())
  .replace('<!-- @MODULES -->', buildModules())
  .replace('<!-- @DEMO_SCRIPTS -->', buildDemoScripts())
  .replace('<!-- @TOTAL_MODULES -->', String(DATA.modules.length));

if (out.includes('@SIDEBAR') || out.includes('@MODULES') || /<!-- @/.test(out)) {
  warn('模板占位符未被替换，检查 templates/shell.html');
}

/* --stdout 只输出 HTML 本身（供 selfcheck 做陈旧比对），人类可读的日志走 stderr，
   否则会混进被捕获的 HTML 里。 */
const QUIET = process.argv.includes('--stdout');
if (QUIET) {
  process.stdout.write(out);
} else {
  fs.writeFileSync(path.join(ROOT, 'index.html'), out);
  console.log(`built index.html  (${(out.length / 1024).toFixed(1)} KB, ${DATA.modules.length} modules)`);
}
if (errors.length) {
  console.error('\n构建问题 ' + errors.length + ' 项：');
  [...new Set(errors)].forEach((e) => console.error('  · ' + e));
  process.exit(1);
}
if (!QUIET) console.log('无问题');
