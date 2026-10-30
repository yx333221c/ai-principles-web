/* ==========================================================================
   og-images.js · 生成分享用 OG 图（DESIGN §12.2「每模块一张自动生成的分享图」）

   为什么不接进 build.js：
   ① build.js 必须零依赖且确定性极强（闸门 3 逐字节比对 index.html）。一旦构建
      依赖 Chrome，CI 与不同机器的字体渲染差异就会把「构建幂等」变成随机失败。
   ② 图片是静态资产，改动频率远低于正文。所以这里生成、产物入库，闸门只校验
      「存在 + 尺寸 + 非空白 + 与模块清单一致」，不重新生成。

   渲染方式：自包含 HTML（内联样式、零外部资源）+ headless Chrome 截图。
   为什么截图而不是手写 SVG 再转 PNG：站内字体栈依赖系统中文字体，截图用的是
   真实排版，中文换行与字宽由浏览器负责；手写 SVG 转 PNG 在零依赖前提下没有
   可用的栅格化器（不想为此引入 sharp/rsvg）。
   主题固定 light：分享卡片不该跟随读者系统而变成两种观感。

   用法：node scripts/og-images.js [--only=m07]
   产物：assets/og/<模块 id>.png（1200×630）与 assets/og/site.png
   ========================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/og');
const W = 1200, H = 630;

/* Chrome 探测与 verify-demos.js 同一思路（不写死 Windows 路径），但这里刻意不
   require 那个文件：闸门脚本之间互相依赖会让一个的改动波及另一个。 */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const plat = process.platform;
  const cand = plat === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
       'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
       (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe']
    : plat === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'];
  for (const c of cand) { try { if (fs.existsSync(c)) return c; } catch { /* ignore */ } }
  const which = plat === 'win32' ? 'where' : 'which';
  for (const bin of ['google-chrome', 'chromium', 'chrome']) {
    try {
      const r = spawnSync(which, [bin], { encoding: 'utf8' });
      if (r.status === 0) { const p = (r.stdout || '').split(/\r?\n/)[0].trim(); if (p) return p; }
    } catch { /* ignore */ }
  }
  return cand[0];
}
const CHROME = findChrome();

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/modules.json'), 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* §12.2 要求「标题 + 该模块主图」。但实测决定版面：站内主图按 640 viewBox 排、
   标签 13px，缩到聊天链接卡的 300px 宽时字高只有 6.1px（移动端 3.3px）——那是
   一团糊的装饰。所以主图放右栏、只占约 42% 宽，文字区保持大号字号优先可读；
   大图场景（Twitter 1200px 全宽）里主图字高约 11px 勉强能读，小图场景读者看的是
   标题。两版式共用同一套 CSS，差别只在有没有右栏。
   主图是 .dgm 系 SVG，其 CSS 只依赖 .dgm 自身（不依赖 .figure 祖先），
   因此可以连 base.css + diagram.css 一起内联独立渲染；主题写死 light，
   分享卡不该跟随读者系统翻成两种观感。 */
const CSS_LIGHT = (() => {
  const base = fs.readFileSync(path.join(ROOT, 'assets/css/base.css'), 'utf8');
  const dgm = fs.readFileSync(path.join(ROOT, 'assets/css/diagram.css'), 'utf8');
  /* 只保留 :root 与 [data-theme="light"] 两支变量：把暗色分支整段切掉，
     比留着再靠 html[data-theme=light] 覆盖更可靠（少一个出错面）。 */
  const cut = (s) => s.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '')
    .replace(/\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/g, '')
    .replace(/@supports[^{]*\{[\s\S]*?\n\}/g, '');
  return cut(base) + '\n' + cut(dgm);
})();

/* 取模块首张【静态 SVG】主图。m10/m11 的首图是 fig__* HTML 表格（契约 §1.4
   允许的另一种实现，中文没法在 SVG 里自动换行），没有可内联的 svg —— 这两张
   退回纯文字版式，而不是硬凑一个假图。 */
function firstSvg(id) {
  const src = fs.readFileSync(path.join(ROOT, 'content/modules', id + '.html'), 'utf8');
  const fig = src.match(/<div class="figure"[\s\S]*?data-fig="([^"]+)"[\s\S]*?(<svg\b[\s\S]*?<\/svg>)/);
  if (!fig) return null;
  let svg = fig[2];
  /* 图解里的 data-step 会被 .figure.is-focus 规则淡出；OG 卡没有聚焦态，
     但保险起见去掉属性，避免任何依赖祖先的样式在这里生效。 */
  svg = svg.replace(/\sdata-step="[^"]*"/g, '');
  if (!/class="[^"]*\bdgm\b/.test(svg)) svg = svg.replace(/<svg\b/, '<svg class="dgm"');
  return svg;
}

/* 版式：左上站点名、中间大号模块标题、下方 tagline、底部一条进度式说明。
   字号刻意大：OG 图在聊天软件里常被缩到 300px 宽，小字直接糊掉。 */
function page(o) {
  const twoCol = !!o.fig;
  return `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><style>
  ${CSS_LIGHT}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:#fbfaf7}
  body{color:#0d1117;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    padding:60px 72px;display:flex;flex-direction:column;position:relative}
  .brand{font-size:26px;font-weight:600;letter-spacing:.04em;color:#3b4cca}
  .no{font-size:26px;color:#3a4556;letter-spacing:.14em;margin-top:auto;font-family:ui-monospace,Consolas,monospace}
  h1{font-size:${o.titleSize}px;line-height:1.16;font-weight:750;letter-spacing:-.01em;margin:18px 0 0}
  .tag{font-size:${twoCol ? 28 : 31}px;line-height:1.45;color:#3a4556;margin-top:20px;max-width:${twoCol ? 600 : 940}px}
  .foot{margin-top:30px;padding-top:20px;border-top:2px solid #e5e2d9;font-size:23px;color:#3a4556;
    display:flex;justify-content:space-between;align-items:baseline}
  .foot b{color:#0d1117;font-weight:650}
  .mark{position:absolute;right:72px;top:60px;font-size:22px;color:#3a4556;font-family:ui-monospace,Consolas,monospace}
  .cols{display:flex;gap:44px;align-items:center;flex:1;min-height:0}
  .colL{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
  .colR{flex:0 0 440px;min-width:0}
  .colR svg{width:440px;height:auto}
  </style></head><body>
  <div class="brand">AI 原理图解 · Explainable AI Primer</div>
  ${o.no ? `<div class="no">${esc(o.no)}</div>` : `<div class="mark">${esc(o.mark)}</div>`}
  <div class="cols">
    <div class="colL">
      <h1>${esc(o.title)}</h1>
      <div class="tag">${esc(o.tag)}</div>
    </div>
    ${twoCol ? `<div class="colR">${o.fig}</div>` : ''}
  </div>
  <div class="foot"><span><b>${esc(o.part)}</b> · ${esc(o.meta)}</span><span>13 模块 · 13 交互演示 · 零依赖</span></div>
  </body></html>`;
}

/* 标题长度决定字号：M06/M12 的标题比 M11 长一倍，固定字号会溢出或挤成两行难看。 */
function titleSize(t) { return t.length <= 10 ? 92 : t.length <= 14 ? 82 : t.length <= 18 ? 72 : 62; }

/* 截图前先量版式：body 是 overflow:hidden + 固定 630px，标题换行/tagline 过长/
   右栏图过高都会【静默】被裁——图看起来"正常"其实少了半行字，而分享卡没人会去
   比对原文。所以这里注入探针量一次，不合格就不写文件（宁可少一张，不出一张错的）。
   代价是每张多起一次 Chrome（14 张约 +25s），但生成是手动跑的，不在 CI 关键路径上。 */
const PROBE = `<script>
addEventListener('load', () => {
  const out = [];
  ['.brand','.no','.mark','h1','.tag','.foot','.colR','.colR svg'].forEach(s => {
    const e = document.querySelector(s); if (!e) return;
    const b = e.getBoundingClientRect();
    if (b.bottom > ${H} + 1) out.push(s + ' 底边 ' + Math.round(b.bottom));
    if (b.right > ${W} - 30) out.push(s + ' 右边 ' + Math.round(b.right));
    if (b.width < 1 || b.height < 1) out.push(s + ' 零尺寸');
  });
  if (document.documentElement.scrollHeight > ${H} + 1) out.push('scrollH=' + document.documentElement.scrollHeight);
  if (document.documentElement.scrollWidth > ${W} + 1) out.push('scrollW=' + document.documentElement.scrollWidth);
  document.title = 'OGCHK::' + (out.length ? 'BAD:' + out.join('|') : 'ok');
});
</script>`;
function probe(html) {
  const base = process.env.AIP_TMP || os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'aip-ogchk-'));
  const f = path.join(dir, 'p.html'), d = path.join(dir, 'out.html');
  fs.writeFileSync(f, html.replace('</head>', PROBE + '</head>'), 'utf8');
  spawnSync('"' + CHROME + '" --headless=new --disable-gpu --no-sandbox --user-data-dir="' + path.join(dir, 'prof') +
    '" --window-size=' + W + ',' + H + ' --virtual-time-budget=6000 --dump-dom "file:///' + f.replace(/\\/g, '/') +
    '" > "' + d + '" 2> nul', { shell: true, stdio: 'ignore' });
  let r = '(探针没跑到)';
  try { r = (fs.readFileSync(d, 'utf8').match(/<title>OGCHK::([^<]*)<\/title>/) || [])[1] || r; } catch { /* 判为失败 */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome 句柄未放，不盖结论 */ }
  return r;
}

function shot(html, png) {
  /* 临时目录走 AIP_TMP：C 盘空间不足时 Chrome 建不了 profile，会伪装成「截图失败」
     （闸门 4 有过同样的假失败，见 verify-demos.js 的注释）。 */
  const base = process.env.AIP_TMP || os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const tmp = path.join(fs.mkdtempSync(path.join(base, 'aip-og-')), 'card.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const prof = path.join(path.dirname(tmp), 'profile');
  const r = spawnSync('"' + CHROME + '" --headless=new --disable-gpu --no-sandbox --hide-scrollbars ' +
    `--user-data-dir="${prof}" --force-device-scale-factor=1 --window-size=${W},${H} ` +
    `--virtual-time-budget=6000 --screenshot="${png}" "file:///${tmp.replace(/\\/g, '/')}"`,
    { shell: true, stdio: 'ignore' });
  try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch { /* Windows 句柄未放 */ }
  return r.status === 0 && fs.existsSync(png);
}

/* 导出给 tmp/og-check.js 复用：那份检查必须量【同一套版式】，否则它证明的是
   一个不存在的页面。用 CJS 顶层 return 早退，避免 require 时真的去截图。 */
module.exports = { page, firstSvg, titleSize, W, H, DATA };
if (require.main !== module) return;

const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
fs.mkdirSync(OUT, { recursive: true });
const jobs = [];
if (!only || only === 'site') {
  jobs.push({ id: 'site', html: page({ mark: '总览', no: '', title: '不讲新闻，不卖课', tag: '只讲「它到底怎么工作」——13 个模块，从压缩即智能到智能体与安全评测，每个原理都配一个能动手拨弄的图解。', part: '全站', meta: '约 6 小时 · 开源可离线', titleSize: 88 }) });
}
DATA.modules.forEach(m => {
  if (only && only !== m.id) return;   // --only=site 时这里全部跳过，只出站点图
  const part = DATA.parts.find(p => p.id === m.part);
  const fig = firstSvg(m.id);
  jobs.push({
    id: m.id,
    html: page({
      mark: 'M' + String(m.num).padStart(2, '0'),
      no: 'M' + String(m.num).padStart(2, '0') + ' / ' + DATA.modules.length,
      title: m.title, tag: m.tagline,
      part: part ? part.title : m.part,
      meta: '约 ' + m.estMinutes + ' 分钟 · 前置 ' + (m.prereq.length ? m.prereq.map(p => p.toUpperCase().slice(1)).join(' ') : '无'),
      titleSize: titleSize(m.title),
      fig: fig || '',          // m10/m11 首图是 fig__* HTML 表，没有可内联的 svg → 纯文字版式
    }),
    hasFig: !!fig,
  });
});

let fail = 0;
jobs.forEach(j => {
  const png = path.join(OUT, j.id + '.png');
  /* 先量版式再截图：不合格直接跳过，坏图不落盘 */
  const p = probe(j.html);
  if (p !== 'ok') { console.error('  ✗ ' + j.id + ' 版式溢出，未生成：' + p); fail++; return; }
  const ok = shot(j.html, png);
  if (!ok) { console.error('  ✗ ' + j.id + ' 截图失败（Chrome: ' + CHROME + '）'); fail++; return; }
  const b = fs.readFileSync(png);
  /* PNG 头：8 字节签名 + 4 长度 + "IHDR" + 宽(4) + 高(4)。读出来确认尺寸，
     不靠"看起来生成了"就交差。 */
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const dimOk = w === W && h === H;
  if (!dimOk) fail++;
  /* 带右栏图解的卡要确认图真的画进去了：文件体积是最便宜的正信号（纯文字卡
     ~50KB，带图 ~65-95KB）。这里只报体积，闸门那边再断言尺寸与存在性。 */
  console.log('  ' + (dimOk ? '✓' : '✗') + ' ' + j.id + '.png  ' + w + '×' + h +
    '  ' + (b.length / 1024).toFixed(1) + ' KB' + (j.hasFig ? '  含图解' : '  纯文字'));
});
console.log(fail ? '\n' + fail + ' 张不合格（未写入）' : '\n共生成 ' + jobs.length + ' 张（' + W + '×' + H + '）');
process.exit(fail ? 1 : 0);
