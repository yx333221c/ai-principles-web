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

/* 版式：左上站点名、中间大号模块标题、下方 tagline、底部一条进度式说明。
   字号刻意大：OG 图在聊天软件里常被缩到 300px 宽，小字直接糊掉。 */
function page(o) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{background:#fbfaf7;color:#0d1117;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    padding:64px 72px;display:flex;flex-direction:column;position:relative}
  .brand{font-size:26px;font-weight:600;letter-spacing:.04em;color:#3b4cca}
  .no{font-size:26px;color:#3a4556;letter-spacing:.14em;margin-top:auto;font-family:ui-monospace,Consolas,monospace}
  h1{font-size:${o.titleSize}px;line-height:1.16;font-weight:750;letter-spacing:-.01em;margin:18px 0 0}
  .tag{font-size:31px;line-height:1.45;color:#3a4556;margin-top:22px;max-width:940px}
  .foot{margin-top:34px;padding-top:22px;border-top:2px solid #e5e2d9;font-size:24px;color:#3a4556;
    display:flex;justify-content:space-between;align-items:baseline}
  .foot b{color:#0d1117;font-weight:650}
  .mark{position:absolute;right:72px;top:60px;font-size:22px;color:#3a4556;font-family:ui-monospace,Consolas,monospace}
  </style></head><body>
  <div class="brand">AI 原理图解 · Explainable AI Primer</div>
  <!-- 编号只出现一次：模块卡用 .no（M07 / 13），站点卡没有编号才用右上角角标。
       原先两处都放 M07，看着像没排版。 -->
  ${o.no ? `<div class="no">${esc(o.no)}</div>` : `<div class="mark">${esc(o.mark)}</div>`}
  <h1>${esc(o.title)}</h1>
  <div class="tag">${esc(o.tag)}</div>
  <div class="foot"><span><b>${esc(o.part)}</b> · ${esc(o.meta)}</span><span>13 模块 · 13 交互演示 · 零依赖</span></div>
  </body></html>`;
}

/* 标题长度决定字号：M06/M12 的标题比 M11 长一倍，固定字号会溢出或挤成两行难看。 */
function titleSize(t) { return t.length <= 10 ? 92 : t.length <= 14 ? 82 : t.length <= 18 ? 72 : 62; }

function shot(html, png) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aip-og-')), 'card.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const prof = path.join(path.dirname(tmp), 'profile');
  const r = spawnSync('"' + CHROME + '" --headless=new --disable-gpu --no-sandbox --hide-scrollbars ' +
    `--user-data-dir="${prof}" --force-device-scale-factor=1 --window-size=${W},${H} ` +
    `--virtual-time-budget=6000 --screenshot="${png}" "file:///${tmp.replace(/\\/g, '/')}"`,
    { shell: true, stdio: 'ignore' });
  try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch { /* Windows 句柄未放 */ }
  return r.status === 0 && fs.existsSync(png);
}

const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
fs.mkdirSync(OUT, { recursive: true });
const jobs = [];
if (!only || only === 'site') {
  jobs.push({ id: 'site', html: page({ mark: '总览', no: '', title: '不讲新闻，不卖课', tag: '只讲「它到底怎么工作」——13 个模块，从压缩即智能到智能体与安全评测，每个原理都配一个能动手拨弄的图解。', part: '全站', meta: '约 6 小时 · 开源可离线', titleSize: 88 }) });
}
DATA.modules.forEach(m => {
  if (only && only !== m.id) return;   // --only=site 时这里全部跳过，只出站点图
  const part = DATA.parts.find(p => p.id === m.part);
  jobs.push({
    id: m.id,
    html: page({
      mark: 'M' + String(m.num).padStart(2, '0'),
      no: 'M' + String(m.num).padStart(2, '0') + ' / ' + DATA.modules.length,
      title: m.title, tag: m.tagline,
      part: part ? part.title : m.part,
      meta: '约 ' + m.estMinutes + ' 分钟 · 前置 ' + (m.prereq.length ? m.prereq.map(p => p.toUpperCase().slice(1)).join(' ') : '无'),
      titleSize: titleSize(m.title),
    }),
  });
});

let fail = 0;
jobs.forEach(j => {
  const png = path.join(OUT, j.id + '.png');
  const ok = shot(j.html, png);
  if (!ok) { console.error('  ✗ ' + j.id + ' 截图失败（Chrome: ' + CHROME + '）'); fail++; return; }
  const b = fs.readFileSync(png);
  /* PNG 头：8 字节签名 + 4 长度 + "IHDR" + 宽(4) + 高(4)。读出来确认尺寸，
     不靠"看起来生成了"就交差。 */
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const dimOk = w === W && h === H;
  if (!dimOk) fail++;
  console.log('  ' + (dimOk ? '✓' : '✗') + ' ' + j.id + '.png  ' + w + '×' + h +
    '  ' + (b.length / 1024).toFixed(1) + ' KB');
});
console.log(fail ? '\n' + fail + ' 张不合格' : '\n共生成 ' + jobs.length + ' 张（' + W + '×' + H + '）');
process.exit(fail ? 1 : 0);
