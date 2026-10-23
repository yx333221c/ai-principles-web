// 一次性骨架自检脚本（不入库）：语法 / 结构 / 契约一致性
const fs = require('fs');
const path = require('path');
const root = process.cwd();
let fail = 0;
const ok = (m) => console.log('  OK   ' + m);
const bad = (m) => { console.log('  FAIL ' + m); fail++; };

console.log('== 1. JS 语法 ==');
for (const f of ['assets/js/app.js', 'assets/js/demos/m05-microcalc.js']) {
  try { new Function(fs.readFileSync(path.join(root, f), 'utf8')); ok(f); }
  catch (e) { bad(f + ' -> ' + e.message); }
}

console.log('== 2. modules.json 契约 ==');
const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/modules.json'), 'utf8'));
(j.modules.length === 13 ? ok('13 modules') : bad('module count ' + j.modules.length));
(j.parts.length === 6 ? ok('6 parts') : bad('part count ' + j.parts.length));
const ids = j.modules.map(m => m.id);
j.modules.forEach(m => {
  if (!j.parts.some(p => p.id === m.part)) bad(m.id + ' part not declared: ' + m.part);
  if (!Array.isArray(m.segs) || m.segs.length !== 6) bad(m.id + ' segs != 6');
  if (!m.demo || !m.demo.id) bad(m.id + ' missing demo id');
  if (!m.acceptance) bad(m.id + ' missing acceptance');
});
const dangling = j.modules.flatMap(m => m.prereq.filter(p => !ids.includes(p)));
(dangling.length ? bad('dangling prereqs: ' + dangling.join(',')) : ok('prereq DAG references all exist'));
(ids.every((v, i) => v === 'm' + String(i + 1).padStart(2, '0')) ? ok('ids sequential') : bad('ids out of order'));

console.log('== 3. index.html 结构 ==');
const h = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const count = (re) => (h.match(re) || []).length;
count(/<section class="module"/g) === 13 ? ok('13 section.module') : bad('section.module=' + count(/<section class="module"/g));
count(/<article class="seg"/g) === 78 ? ok('78 article.seg (13x6)') : bad('article.seg=' + count(/<article class="seg"/g));
count(/class="sectionnav"/g) === 13 ? ok('13 sectionnav') : bad('sectionnav=' + count(/class="sectionnav"/g));
count(/class="modcard"/g) === 13 ? ok('13 modcard') : bad('modcard=' + count(/class="modcard"/g));
count(/class="maptree__part"/g) === 6 ? ok('6 maptree parts') : bad('maptree=' + count(/class="maptree__part"/g));
const allIds = [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = allIds.filter((v, i) => allIds.indexOf(v) !== i);
dup.length ? bad('duplicate id: ' + [...new Set(dup)].join(',')) : ok('no duplicate ids (' + allIds.length + ' total)');
// 内部锚点是否都存在
const hrefs = [...h.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
const missing = [...new Set(hrefs.filter(x => !allIds.includes(x)))];
missing.length ? bad('dead anchors: ' + missing.join(',')) : ok('all ' + new Set(hrefs).size + ' internal anchors resolve');
// data-demo 是否都在 modules.json 声明
const demoKeys = [...h.matchAll(/data-demo="([^"]+)"/g)].map(m => m[1]);
const undeclared = demoKeys.filter(d => !j.modules.some(m => m.demo.id === d));
(undeclared.length ? bad('undeclared demos: ' + undeclared.join(',')) : ok(demoKeys.length + ' demo hosts all declared in json'));
// 六段 data-seg 是否与枚举一致
const segEnum = j.site.segEnum;
const segs = [...h.matchAll(/data-seg="([^"]+)"/g)].map(m => m[1]);
const badSeg = [...new Set(segs)].filter(s => !segEnum.includes(s));
(badSeg.length ? bad('unknown data-seg: ' + badSeg.join(',')) : ok('data-seg values valid'));

console.log('== 4. 交叉引用文件存在 ==');
for (const f of ['DESIGN.md', 'README.md', 'LICENSE', '.gitignore', '.nojekyll', 'docs/writing-guide.md', 'docs/glossary.md', 'assets/css/base.css', 'assets/css/layout.css', 'assets/css/components.css', 'assets/js/app.js', 'assets/js/demos/m05-microcalc.js']) {
  fs.existsSync(path.join(root, f)) ? ok(f) : bad('missing ' + f);
}
for (let i = 1; i <= 13; i++) {
  const f = 'content/modules/m' + String(i).padStart(2, '0') + '.md';
  fs.existsSync(path.join(root, f)) ? ok(f) : bad('missing ' + f);
}

console.log('== 5. CSS 令牌自审 ==');
const css = fs.readFileSync(path.join(root, 'assets/css/base.css'), 'utf8');
['--c-bg', '--c-fg', '--c-accent', '--c-heat-0', '--dur-micro', '--measure', '--s-7', '--r-pill']
  .forEach(t => (css.includes(t + ':') ? ok('token ' + t) : bad('no token ' + t)));
css.includes('[data-theme="dark"]') ? ok('dark theme block') : bad('no dark theme');
css.includes('prefers-reduced-motion') ? ok('reduced-motion') : bad('no reduced-motion');
css.includes('prefers-color-scheme') ? ok('auto theme via media query') : bad('no auto theme');
// 组件里是否引用了未定义令牌
const used = [...new Set([...fs.readFileSync(path.join(root, 'assets/css/layout.css'), 'utf8')
  .concat(fs.readFileSync(path.join(root, 'assets/css/components.css'), 'utf8'))
  .matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))];
const undef = used.filter(u => !css.includes(u + ':'));
(undef.length ? bad('undefined tokens: ' + undef.join(',')) : ok('all ' + used.length + ' referenced tokens defined'));

console.log('\n' + (fail ? 'RESULT: ' + fail + ' problem(s)' : 'RESULT: all checks passed'));
process.exit(fail ? 1 : 0);
