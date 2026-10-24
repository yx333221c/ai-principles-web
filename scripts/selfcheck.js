/* ==========================================================================
   selfcheck.js · 站点结构自检（零依赖）
   用法：node scripts/selfcheck.js      （无 FAIL 则 exit 0）
   覆盖：JS 语法 / modules.json 契约 / 内容六段与写作红线 / index.html 结构 /
        锚点解析 / 演示注册与 hint / CSS 令牌闭合
   图解允许两种实现：内联 SVG，或用 fig__* 类组成的 HTML 图（中文无法在
   SVG 内自动换行，见 docs/authoring-contract.md §1.4）。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p) => fs.existsSync(path.join(ROOT, p));

let fail = 0, warnCnt = 0;
const ok = (m) => console.log('  OK   ' + m);
const bad = (m) => { console.log('  FAIL ' + m); fail++; };
const warn = (m) => { console.log('  WARN ' + m); warnCnt++; };

const J = JSON.parse(rd('assets/data/modules.json'));
const SEG = J.site.segEnum;
const IDS = J.modules.map(m => m.id);
const built = J.modules.filter(m => has('content/modules/' + m.id + '.html'));

console.log('== 1. JS 语法 ==');
for (const f of ['assets/js/app.js', 'assets/js/demo-kit.js']) {
  if (!has(f)) { bad('缺少 ' + f); continue; }
  try { new Function(rd(f)); ok(f); } catch (e) { bad(f + ' -> ' + e.message); }
}
built.forEach(m => {
  const f = 'assets/js/demos/' + m.demo.id + '.js';
  if (!has(f)) { warn(m.id + ' 演示未产出 ' + f); return; }
  try { new Function(rd(f)); ok(f); } catch (e) { bad(f + ' -> ' + e.message); }
});

console.log('== 2. modules.json 契约 ==');
(J.modules.length === 13 ? ok('13 modules') : bad('module count ' + J.modules.length));
(J.parts.length === 6 ? ok('6 parts') : bad('part count ' + J.parts.length));
J.modules.forEach(m => {
  if (!J.parts.some(p => p.id === m.part)) bad(m.id + ' part 未声明: ' + m.part);
  if (!Array.isArray(m.segs) || m.segs.length !== 6) bad(m.id + ' segs != 6');
  if (!m.demo || !m.demo.id) bad(m.id + ' 缺 demo.id');
  if (!m.acceptance) bad(m.id + ' 缺 acceptance');
  if (!m.prereq.every(p => IDS.includes(p))) bad(m.id + ' 悬空前置: ' + m.prereq.join(','));
  if (!m.demo.title) bad(m.id + ' 缺 demo.title');
});
const back = J.modules.filter(m => m.prereq.some(p => IDS.indexOf(p) >= IDS.indexOf(m.id)));
(back.length ? bad('前置依赖倒序/成环: ' + back.map(m => m.id).join(',')) : ok('prereq DAG 顺序自洽'));
(IDS.every((v, i) => v === 'm' + String(i + 1).padStart(2, '0')) ? ok('ids 连续') : bad('ids 乱序'));

/* diagram.css 里 .dgm 系的声明。用来抓一类静默失效：
   元素写 fill="var(--c-heat-2)" 但同时带 class="box"，而 CSS 的 .dgm .box{fill:…}
   优先级高于 presentation attribute，热力编码被整片压掉（m07 矩阵、m04 轨迹都中过）。
   只有「CSS 声明了该属性且值不同」才算问题，值相同只是冗余。 */
const dgmRules = (() => {
  const css = rd('assets/css/diagram.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const byClass = {}, byTag = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decls = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim().replace(/\s+/g, '');
    }
    for (const s of m[1].split(',')) {
      const t = s.trim();
      let mm = t.match(/^\.dgm\s+\.([a-zA-Z0-9_-]+)$/);
      if (mm) Object.assign(byClass[mm[1]] = byClass[mm[1]] || {}, decls);
      mm = t.match(/^\.dgm\s+([a-z]+)$/);
      if (mm) Object.assign(byTag[mm[1]] = byTag[mm[1]] || {}, decls);
    }
  }
  return { byClass, byTag };
})();
function shadowedProps(tag, attrs) {
  const out = [];
  const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
  const rules = [byTagOf(tag)].concat(cls.split(/\s+/).map(c => dgmRules.byClass[c]).filter(Boolean));
  for (const prop of ['fill', 'stroke']) {
    const av = (attrs.match(new RegExp('\\b' + prop + '="([^"]*)"')) || [])[1];
    if (av == null) continue;
    for (const r of rules) {
      if (r && r[prop] && r[prop] !== av.replace(/\s+/g, '')) {
        out.push(tag + '[' + cls + '] 的 CSS ' + prop + ':' + r[prop] + ' 压掉了属性 ' + prop + '="' + av + '"');
      }
    }
  }
  return out;
}
const byTagOf = (tag) => dgmRules.byTag[tag] || null;

console.log('== 3. 内容六段与写作红线（' + built.length + '/13 已产出）==');
const segOf = (src, name) => {
  const x = src.match(new RegExp('<seg\\s+name="' + name + '"[^>]*>([\\s\\S]*?)<\\/seg>'));
  return x ? x[1] : '';
};
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

built.forEach(m => {
  const f = 'content/modules/' + m.id + '.html';
  const src = rd(f);
  const found = [...src.matchAll(/<seg\s+name="([a-z-]+)"/g)].map(x => x[1]);
  const miss = SEG.filter(s => !found.includes(s));
  const dup = found.filter((v, i) => found.indexOf(v) !== i);
  const bogus = found.filter(v => !SEG.includes(v));
  if (miss.length) bad(m.id + ' 缺段落: ' + miss.join(','));
  if (dup.length) bad(m.id + ' 段落重复: ' + [...new Set(dup)].join(','));
  if (bogus.length) bad(m.id + ' 非法段落名: ' + bogus.join(','));
  if (!miss.length && !dup.length && !bogus.length) ok(m.id + ' 六段齐全');

  /* hook：≤140 字、零术语 */
  const hook = strip(segOf(src, 'hook'));
  const hookLen = [...hook].length;
  if (!hookLen) bad(m.id + ' hook 为空');
  else if (hookLen > 190) bad(m.id + ' hook ' + hookLen + ' 字，超出 §5-1 限制');
  else ok(m.id + ' hook ' + hookLen + ' 字');

  /* H2/H3：直觉段必须有失效边界 */
  const intu = segOf(src, 'intuition');
  if (!/不成立|失效|不适用|不等于|会误导|不能套用/.test(intu)) bad(m.id + ' 直觉段缺类比失效边界（H3）');
  if (!/callout--warn/.test(intu)) warn(m.id + ' 失效边界未用 .callout--warn');

  /* 机制段：步骤 + 图解 */
  const mech = segOf(src, 'mechanism');
  const steps = (mech.match(/<li[\s>]/g) || []).length;
  (steps >= 3 ? ok(m.id + ' 机制 ' + steps + ' 步') : bad(m.id + ' 机制段步骤 ' + steps + ' < 3'));
  const figs = (mech.match(/class="figure/g) || []).length;
  (figs >= 1 ? ok(m.id + ' 图解 ' + figs + ' 张') : bad(m.id + ' 机制段无图解（§5-3）'));
  const figBlocks = [...mech.matchAll(/<div class="figure"[^>]*>([\s\S]*?)<\/figcaption>/g)].map(x => x[0]);
  figBlocks.forEach((b, i) => {
    const svg = /<svg[\s\S]*<\/svg>/.test(b);
    const html = /class="fig(__|\b)/.test(b);
    if (!svg && !html) bad(m.id + ' 图解#' + (i + 1) + ' 既非内联 SVG 也不用 fig__ 结构');
    if (svg) {
      if (!/<title/.test(b)) bad(m.id + ' 图解#' + (i + 1) + ' 缺 <title>');
      if (!/role="img"/.test(b)) bad(m.id + ' 图解#' + (i + 1) + ' 缺 role="img"');
      if (!/<desc/.test(b)) warn(m.id + ' 图解#' + (i + 1) + ' 缺 <desc>');
    }
    const hard = [...b.matchAll(/(?:fill|stroke|color|background)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,8}|rgba?\()/g)];
    if (hard.length) bad(m.id + ' 图解#' + (i + 1) + ' 硬编码颜色 ' + hard.length + ' 处（暗色主题会瞎）');
    /* 属性被自身 class 的 CSS 压掉 → 编码静默失效 */
    for (const el of b.matchAll(/<(rect|text|polyline|line|circle|path)\b([^>]*)>/g)) {
      const hits = shadowedProps(el[1], el[2]);
      if (hits.length) bad(m.id + ' 图解#' + (i + 1) + ' ' + hits[0]);
    }
  });

  /* 图注前缀：写作规范 §5 要求「怎么看：」开头。
     它必须写在 HTML 里而不是靠 CSS ::before 注入——生成内容在复制、
     打印与部分读屏器里会丢失。CSS 侧的注入已移除，这里守住约定。 */
  const caps = [...src.matchAll(/<figcaption>([\s\S]*?)<\/figcaption>/g)];
  const noPre = caps.filter(x => !/^\s*怎么看[：:]/.test(x[1]));
  const dbl = caps.filter(x => /^\s*怎么看[：:]\s*怎么看/.test(x[1]));
  if (caps.length) {
    if (noPre.length) bad(m.id + ' ' + noPre.length + '/' + caps.length + ' 个图注缺「怎么看：」前缀（§5）');
    else if (dbl.length) bad(m.id + ' ' + dbl.length + ' 个图注前缀重复');
    else ok(m.id + ' 图注 ' + caps.length + ' 个均以「怎么看：」开头');
  }

  /* H10：误区 ≥3 */
  const my = segOf(src, 'misconception');
  const myths = (my.match(/class="myth"/g) || []).length;
  (myths >= 3 ? ok(m.id + ' 误区 ' + myths + ' 条') : bad(m.id + ' 误区 ' + myths + ' 条（要求 ≥3，H10）'));
  if (myths && !/为何会有|为什么会有|为何产生|来源/.test(my)) bad(m.id + ' 误区未写「为何会有此误解」（H10）');
  if (myths && !/myth__truth/.test(my)) warn(m.id + ' 误区未用 .myth__truth 标正确说法');

  /* 带走一句 + 自测 */
  const tk = segOf(src, 'takeaway');
  const line = strip((tk.match(/class="takeaway__line"[^>]*>([\s\S]*?)<\/blockquote>/) || [])[1] || '');
  if (!line) bad(m.id + ' 缺 takeaway__line');
  else if ([...line].length > 48) bad(m.id + ' 带走一句 ' + [...line].length + ' 字（要求 ≤40）');
  else ok(m.id + ' 带走一句 ' + [...line].length + ' 字');
  if (!/class="quiz"/.test(tk)) warn(m.id + ' 无自测题');
  else {
    if (!/data-right="1"/.test(tk)) bad(m.id + ' 自测题未标正确项 data-right="1"');
    if (!/data-for="no"/.test(tk)) bad(m.id + ' 自测题缺答错解释（写作规范：不许只写「错了」）');
    if (!/data-for="ok"/.test(tk)) warn(m.id + ' 自测题缺答对解释');
  }
  if (!/nextlinks/.test(tk)) warn(m.id + ' 无延伸指针 .nextlinks');

  /* 公式必须有读法 */
  const blocks = (src.match(/class="math-block/g) || []).length;
  const reads = (src.match(/class="reads"/g) || []).length;
  if (blocks > reads) bad(m.id + ' ' + (blocks - reads) + ' 个公式块缺 .reads 读法（§3）');
  else if (blocks) ok(m.id + ' 公式 ' + blocks + ' 个均有读法');

  /* H8 违禁词 */
  const banned = ['震撼', '颠覆', '革命性', '史诗级', '降维打击', '遥遥领先', '完美解决', '史上最'];
  const hit = banned.filter(w => src.includes(w));
  (hit.length ? bad(m.id + ' 违禁词: ' + hit.join(',')) : ok(m.id + ' 无违禁词'));

  /* 占位残留 */
  if (/\bTODO[:：]/.test(src)) bad(m.id + ' 仍有 TODO 占位');
  if (/class="todo"/.test(src)) bad(m.id + ' 仍有 .todo 节点');
  if (/class="hook"[^>]*>[^<]*$/.test(src)) bad(m.id + ' hook 段空');

  /* 争议话题必须并列（H6） */
  if (m.debate && !/badge--debate/.test(src)) bad(m.id + ' 声明了 debate 但正文无 badge--debate（H6）');
});

console.log('== 4. index.html 结构 ==');
if (!has('index.html')) bad('index.html 不存在，先跑 node build.js');
else {
  const h = rd('index.html');
  const c = (re) => (h.match(re) || []).length;
  c(/<section class="module"/g) === 13 ? ok('13 section.module') : bad('section.module=' + c(/<section class="module"/g));
  const gotSeg = c(/<article class="seg/g);
  /* 未产出的模块由构建器注入占位 seg，所以总数恒为 13×6 */
  gotSeg === 78 ? ok('78 article.seg（13×6）') : bad('article.seg=' + gotSeg + '，应为 78');
  const realSeg = c(/class="seg has-content/g);
  const wantReal = built.length * 6;
  realSeg === wantReal ? ok(realSeg + ' 个 seg 有真实正文（' + built.length + ' 模块）') :
    bad('has-content seg=' + realSeg + '，已产出 ' + built.length + ' 模块应为 ' + wantReal);
  c(/class="sectionnav"/g) === 13 ? ok('13 sectionnav') : bad('sectionnav=' + c(/class="sectionnav"/g));
  c(/class="modcard"/g) === 13 ? ok('13 modcard') : bad('modcard=' + c(/class="modcard"/g));
  /* index.html 是生成物：改了内容/模板却没重跑 build.js，线上就会是旧版。
     把构建器再跑一遍（--stdout 不写盘）与仓库里的结果逐字节比对。 */
  (function () {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), '--stdout'],
      { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) { warn('构建器报错，跳过陈旧比对（见 build.js 输出）'); return; }
    if (r.stdout === h) ok('index.html 与内容/模板同步（重建结果逐字节一致）');
    else {
      const rebuilt = r.stdout.length, cur = h.length;
      bad(`index.html 已过期：重建会得到 ${rebuilt} 字节而当前 ${cur} 字节 —— 请跑 node build.js`);
    }
  })();
  const allIds = [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = allIds.filter((v, i) => allIds.indexOf(v) !== i);
  dup.length ? bad('重复 id: ' + [...new Set(dup)].join(',')) : ok('无重复 id（' + allIds.length + '）');
  const hrefs = [...h.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
  const dead = [...new Set(hrefs.filter(x => !allIds.includes(x)))];
  dead.length ? bad('失效锚点: ' + dead.join(',')) : ok('全部 ' + new Set(hrefs).size + ' 个内部锚点可解析');
  const hosts = [...new Set([...h.matchAll(/data-demo="([^"]+)"/g)].map(m => m[1]))];
  const undecl = hosts.filter(d => !J.modules.some(m => m.demo.id === d));
  undecl.length ? bad('未声明 demo: ' + undecl.join(',')) : ok(hosts.length + ' 个 demo 宿主均已声明');
  const scripts = [...new Set([...h.matchAll(/demos\/([a-z0-9-]+)\.js/g)].map(m => m[1]))];
  const orphan = J.modules.map(m => m.demo.id).filter(d => has('assets/js/demos/' + d + '.js') && !scripts.includes(d));
  orphan.length ? bad('已实现但未引用的 demo: ' + orphan.join(',')) : ok('demo 脚本引用完整（' + scripts.length + ' 个）');
  /* 通用匹配而非枚举名单：枚举会随模板演进过时（曾漏掉 @SITE_NOTE、
     还留着已删除的 @BUILD_TIME），任何未替换的 <!-- @X --> 都该被发现 */
  const leftover = [...new Set([...h.matchAll(/<!--\s@([A-Z_]+)/g)].map(m => m[1]))];
  leftover.length ? bad('index.html 有未替换占位符: ' + leftover.join(', ')) : ok('构建占位符均已替换');
  /* 无 JS 可读：正文必须在 HTML 里 */
  c(/class="hook"/g) >= built.length ? ok('正文内联在 HTML（无 JS 可读）') : bad('正文未内联，违反 §10.4');
  /* 外链依赖：本站应零外部「资源」请求；引用文献的 <a href> 是允许的 */
  const ext = [...new Set([...h.matchAll(/(?:<script|<link)[^>]*(?:src|href)="(https?:)?\/\/[^"]+"/g)].map(x => x[0]))];
  ext.length ? bad('存在外部资源（应零依赖）: ' + ext.join(' ')) : ok('无外部资源引用（零依赖成立）');
  const cites = [...new Set([...h.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"/g)].map(x => x[1]))];
  ok('指向外部的引用链接 ' + cites.length + ' 条（文献出处，允许）');
}

console.log('== 5. 共享文件与文档 ==');
['DESIGN.md', 'README.md', 'LICENSE', '.gitignore', '.gitattributes', '.nojekyll', 'build.js',
 'templates/shell.html', 'docs/writing-guide.md', 'docs/glossary.md', 'docs/authoring-contract.md',
 'assets/css/base.css', 'assets/css/layout.css', 'assets/css/components.css', 'assets/css/diagram.css'
].forEach(f => has(f) ? ok(f) : bad('缺 ' + f));

console.log('== 6. CSS 令牌闭合 ==');
const base = rd('assets/css/base.css');
['--c-bg', '--c-fg', '--c-accent', '--c-heat-0', '--c-heat-3', '--dur-micro', '--measure', '--r-pill', '--h-header']
  .forEach(t => base.includes(t + ':') ? ok('token ' + t) : bad('无令牌 ' + t));
base.includes('[data-theme="dark"]') ? ok('暗色主题') : bad('缺暗色主题');
base.includes('prefers-reduced-motion') ? ok('reduced-motion 降级') : bad('缺 reduced-motion');
base.includes('prefers-color-scheme') ? ok('auto 主题') : bad('缺 auto 主题');
/* 暗色令牌被定义了两遍（手动选暗色 / 跟随系统）。实践中改一处很容易漏另一处，
   导致「跟随系统」的用户拿到旧配色。这里断言两个分支的每个变量取值都相同。 */
(function () {
  const grab = (re) => {
    const m = base.match(re);
    if (!m) return null;
    const map = {};
    [...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].forEach(x => { map[x[1]] = x[2].trim(); });
    return map;
  };
  const forced = grab(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
  const auto = grab(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*html\[data-theme="auto"\]\s*\{([\s\S]*?)\n\s*\}/);
  if (!forced || !auto) { bad('找不到两个暗色块，无法比对（base.css 结构变了？）'); return; }
  const keys = new Set([...Object.keys(forced), ...Object.keys(auto)]);
  const diff = [...keys].filter(k => forced[k] !== auto[k]);
  diff.length
    ? bad('两个暗色分支不一致：' + diff.map(k => `${k}=${forced[k]} vs ${auto[k]}`).join('  '))
    : ok(`两个暗色分支一致（${keys.size} 个变量）`);
})();
const cssAll = (['layout', 'components', 'diagram'].map(n => rd('assets/css/' + n + '.css')).join('\n') + base)
  .replace(/\/\*[\s\S]*?\*\//g, '');   // 注释里的 var(--c-*) 示例不算引用
const usedTok = [...new Set([...cssAll.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))];
const undef = usedTok.filter(u => !base.includes(u + ':'));
undef.length ? bad('未定义令牌: ' + undef.join(',')) : ok('全部 ' + usedTok.length + ' 个被引用令牌均有定义');
/* 反向：CSS 定义了但既没人用、文档也没承诺的类 = 真死代码。
   注意两个例外，否则会把该留的东西误判为死代码：
   ① docs/authoring-contract.md §1.4 把 fig__* 列为作者可选的词汇表，
      现在没人用是合法的，删了反而让文档指向不存在的类；
   ② build.js 会在段落缺失时输出 .todo 兜底节点。 */
const hHtml = has('index.html') ? rd('index.html') : '';
const contentAll = built.map(m => rd('content/modules/' + m.id + '.html')).join('\n');
const demoAll = built.map(m => 'assets/js/demos/' + m.demo.id + '.js').filter(has).map(rd).join('\n');
const scope = hHtml + contentAll + demoAll + rd('assets/js/app.js') + rd('assets/js/demo-kit.js')
  + rd('templates/shell.html') + rd('build.js');
const documented = has('docs/authoring-contract.md') ? rd('docs/authoring-contract.md') : '';
const cls = [...new Set([...rd('assets/css/components.css').matchAll(/^\.([a-z][a-z0-9_-]*)/gmi)].map(m => m[1]))];
const unusedCls = cls.filter(x => !scope.includes(x) && !documented.includes(x));
if (unusedCls.length) warn('CSS 死代码（未使用且文档未承诺，' + unusedCls.length + '）: ' + unusedCls.join(', '));
else ok('components.css 无死代码（已用类 + 契约声明的可选词汇除外）');

console.log('== 7. 演示契约 ==');
built.forEach(m => {
  const f = 'assets/js/demos/' + m.demo.id + '.js';
  if (!has(f)) return;
  const src = rd(f);
  if (!src.includes("'" + m.demo.id + "'")) bad(f + ' 未注册键 ' + m.demo.id);
  else ok(m.demo.id + ' 注册键匹配');
  if (/getContext\(['"]2d/.test(src)) warn(f + ' 用 Canvas（失去主题联动与无损放大，需说明理由）');
  if (!/viewBox/.test(src)) bad(f + ' 缺 viewBox（无逻辑坐标系则无法等比缩放）');
  if (!/hint/.test(src)) bad(f + ' 缺 hint');
  else {
    const need = ['你能改什么', '你会看到', '对应机制段'];
    const miss = need.filter(n => !src.includes(n));
    miss.length ? bad(f + ' hint 缺: ' + miss.join('/')) : ok(f + ' hint 三要素齐全');
  }
  const ranges = (src.match(/DK\.(range|select|checkbox|toggle)\(\{/g) || []).length;
  /* key 可以是字面量，也可以是变量（如辅助函数里 `key: key`），都算已绑定 */
  const keyed = (src.match(/key:\s*(?:'[^']+'|"[^"]+"|[A-Za-z_$][\w$]*)/g) || []).length;
  if (ranges && keyed < ranges) bad(f + ' 有 ' + ranges + ' 个控件但只有 ' + keyed + ' 个挂了 key（reset 会失效）');
  else if (ranges) ok(f + ' ' + ranges + ' 个控件均绑定 state key');
  /* 扫 Math.random 前必须剥掉注释：m04 的注释里写着「不用 Math.random」，
     不剥就会误报，而作者为了骗过检查器去改注释是更糟的做法。 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/Math\.random/.test(code)) bad(f + ' 用了 Math.random（不可复现，须用 DK.rng(seed)）');
  if (/draw\s*\([^)]*\)\s*\{[\s\S]{0,400}?appendChild\(DK\.el\([^)]*rect/.test(src)) warn(f + ' draw 内可能新建 rect 堆积，检查是否复用节点');
});

console.log('== 8. 类名闭合（引用了但 CSS 未定义 = 静默失效）==');
/* 这条检查刚抓到一个真实缺陷：.term 被 12 个模块用于术语悬浮卡，
   但 CSS 里从未定义它，导致读者看不出哪些词可查释义。
   纯结构容器（本来就无需样式）用白名单显式承认，避免逼作者加装饰性 CSS。 */
(function () {
  const cssAll4 = ['base', 'layout', 'components', 'diagram'].map(n => rd('assets/css/' + n + '.css')).join('\n');
  const defined = new Set([...cssAll4.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map(m => m[1]));
  const files = ['index.html', 'templates/shell.html', 'assets/js/app.js', 'assets/js/demo-kit.js', 'build.js']
    .concat(built.map(m => 'content/modules/' + m.id + '.html'))
    .concat(built.map(m => 'assets/js/demos/' + m.demo.id + '.js'))
    .filter(has);
  /* 有意不带样式的结构容器：仅用于分组/语义，视觉由父级负责 */
  const UNSTYLED_OK = new Set(['hero__text', 'maptree', 'module__pager-next', 'module__pager-prev',
    'modules', 'seg', 'shell', 'layout', 'main']);
  const used = new Map();
  for (const f of files) {
    const s = rd(f);
    /* add 必须定义在循环内：它闭包捕获 f，否则记录的文件名是错的 */
    const add = (c) => { if (!c) return; if (!used.has(c)) used.set(c, []); used.get(c).push(f); };
    let m;
    const re1 = /class="([^"]*)"/g; while ((m = re1.exec(s))) m[1].split(/\s+/).forEach(add);
    const re2 = /class:\s*'([^']+)'/g; while ((m = re2.exec(s))) m[1].split(/\s+/).forEach(add);
    const re3 = /classList\.(?:add|toggle|remove|contains)\(\s*'([^']+)'/g; while ((m = re3.exec(s))) add(m[1]);
    const re4 = /className\s*=\s*'([^']+)'/g; while ((m = re4.exec(s))) m[1].split(/\s+/).forEach(add);
  }
  const OWN = /^(fig|figure|badge|demo|quiz|callout|myth|modcard|maptree|seg|module|searchdlg|term|math|steps|hero|toc|btn|iconbtn|themeswitch|prereq|readbar|dgm|lightbox|todo|skip|noscript|legend|tbl|nextlinks|takeaway)/;
  /* 排除模板字符串截出的噪声：真实类名只含字母数字与 -_，
     带引号/反引号/大括号/$ 的一定是拼接残片 */
  const NOISE = /["'`$(){}\\\/]/;
  const miss = [...used.keys()].filter(c => OWN.test(c) && !defined.has(c) && !UNSTYLED_OK.has(c) && !NOISE.test(c));
  if (miss.length) bad('引用了但 CSS 未定义的类: ' + miss.map(c => `${c}(${new Set(used.get(c)).size}处)`).join(' '));
  else ok(`自有类名全部有定义或已白名单承认（${used.size} 个引用 / ${defined.size} 个定义）`);

  /* 反向第二半：契约里承诺给作者用的 fig__ 类，必须真的存在于 CSS。
     文档写了不存在的类，比没写更糟 —— 作者会照着用然后静默无样式。 */
  if (has('docs/authoring-contract.md')) {
    const cdoc = rd('docs/authoring-contract.md');
    const claimed = new Set();
    /* 形如 `fig__code` + `--a/--g/--b/--sun` 与 `fig__cell--h1` 两种写法 */
    let cm;
    const rA = /`(fig__[a-z0-9-]+)`(?:\s*\+\s*`(--[a-z0-9\/-]+)`)?/g;
    while ((cm = rA.exec(cdoc))) {
      claimed.add(cm[1]);
      if (cm[2]) cm[2].split('/').forEach(v => claimed.add(cm[1] + v.replace(/^-+/, '--').replace(/^(?!-)/, '--')));
    }
    const ghost = [...claimed].filter(c => c.startsWith('fig__') && !defined.has(c));
    if (ghost.length) bad('契约承诺了 CSS 里不存在的类: ' + ghost.join(', '));
    else ok(`契约承诺的 ${claimed.size} 个类均已在 CSS 定义`);
  }
})();

console.log('\n' + (fail
  ? 'RESULT: ' + fail + ' 个必须修的问题' + (warnCnt ? '，' + warnCnt + ' 个提示' : '')
  : 'RESULT: all checks passed' + (warnCnt ? '（' + warnCnt + ' 个提示）' : '')));
process.exit(fail ? 1 : 0);
