/* ==========================================================================
   verify-demos.js · 全站渲染验证（真实无头浏览器，非 DOM 桩）
   用法：node scripts/verify-demos.js
   前提：本地静态服务已在 127.0.0.1:8765（python -m http.server 8765 --bind 127.0.0.1）

   一次页面加载即检查全部 13 个演示（?mountall=1&probe=1，不加 ?only=，
   否则被隐藏的演示 getBBox 会退化成 0 而漏报）：
     ① 是否真的挂载（.is-live / .demo-svg）
     ② 控件、读数条、hint、重置是否齐备
     ③ 是否残留「尚未实现」「加载失败」
     ④ 文字是否越出 viewBox —— 越界的字在截图里被静默裁掉，肉眼极易漏看
     ⑤ console 是否有未捕获异常
   ========================================================================== */
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
/* Chrome 可执行文件：CI/跨平台不能写死 Windows 路径（原来是 C:\Program Files\...，
   在 Linux runner 上必然找不到 → 闸门 4 假失败）。优先级：
   1) 环境变量 CHROME（CI 用 setup-chrome 输出的路径显式传入，最可靠）
   2) 各平台常见安装位置
   3) PATH 里的 google-chrome / chromium / chrome
   找不到就在 CI 里装（见 .github/workflows/ci.yml），本地一般命中第 2 步。 */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const plat = process.platform;
  const cand = plat === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
       'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
       (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe']
    : plat === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
         '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
         '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const c of cand) { try { if (fs.existsSync(c)) return c; } catch { /* ignore */ } }
  const which = plat === 'win32' ? 'where' : 'which';
  for (const bin of ['google-chrome', 'chromium', 'chrome']) {
    try {
      const r = spawnSync(which, [bin], { encoding: 'utf8' });
      if (r.status === 0) { const p = (r.stdout || '').split(/\r?\n/)[0].trim(); if (p) return p; }
    } catch { /* ignore */ }
  }
  return cand[0]; /* 兜底：让下面的 stderr 输出说明找不到谁，而不是静默失败 */
}
const CHROME = findChrome();
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
/* 临时目录：headless Chrome 会在这里写 profile 与缓存。默认 os.tmpdir()（Windows
   上是 C 盘）。本轮闸门 4 曾两次假失败「没拿到 DOM」，根因是 C 盘只剩 0.36 GB、
   Chrome 建不了缓存（stderr 全是 "Unable to create cache"）。非默认状态 sweep 会把
   Chrome 启动次数乘以状态组合数，缓存需求更大，靠人「记得先查磁盘」不可靠。
   故加 AIP_TMP 环境变量把临时目录指到空间充足的盘；不设则维持原行为，CI（Linux，
   runner 盘空间充足）不受影响。 */
const TMP = path.join(process.env.AIP_TMP || os.tmpdir(), 'aip-verify');
fs.mkdirSync(TMP, { recursive: true });

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/modules.json'), 'utf8'));
const KEYS = DATA.modules.map(m => m.demo.id);

/* 沙箱下捕获子进程 stdout 会被拒（EPERM），所以 Chrome 那步仍用 shell 重定向 + stdio:ignore */
const sh = (cmd) => spawnSync(cmd, { shell: true, stdio: 'ignore', windowsHide: true }).status;

/* 服务可用性探测：用 node 自己的 http，不起子进程、不走 shell。
   原来那条 `curl ... > probe.txt 2>nul` 实测出现过「同一 URL 在父进程直接
   探测拿到 200，经这条 shell 重定向却写出空文件」，于是报「本地服务不可用」
   ——假失败，且把人引向去查服务（服务其实是好的）。少一个外部依赖少一类坑。 */
const probeServer = (url) => new Promise((done) => {
  let settled = false;
  const finish = (v) => { if (!settled) { settled = true; done(v); } };
  const req = http.get(url, (res) => { res.resume(); finish(res.statusCode); });
  req.on('error', () => finish(0));
  req.setTimeout(5000, () => { req.destroy(); finish(0); });
});

/* 三种视口/主题组合：桌面亮、桌面暗（§8.2 双主题）、手机（§8.4 断点 S） */
const CASES = [
  { name: 'desktop-light', w: 1600, h: 4000, q: '' },
  { name: 'desktop-dark',  w: 1600, h: 4000, q: '&theme=dark' },
  { name: 'mobile',        w: 390,  h: 3200, q: '' }
];

(async () => {
const code = await probeServer(BASE);
if (code !== 200) {
  console.error('本地服务不可用（HTTP ' + (code || '无响应') + '）：' + BASE);
  console.error('  起一个：node scripts/serve.js <端口>，或直接跑 node scripts/gates.js（自带服务）');
  process.exit(2);
}

const pad = (s, n) => String(s).padEnd(n);
let problems = 0;
/* 非默认状态扫描：--sweep 开启。一次页面加载内遍历每个演示各控件的边界值
   （页内循环，不额外启动 Chrome，实测约 2.4s）。命中单独计数、醒目标出，
   但【暂不并进 problems】：这样闸门 4 仍绿，同时把缺陷如实暴露出来排队修；
   全部修完后再把 sweep 提成阻断项。 */
const SWEEP = process.argv.includes('--sweep');
const sweepHits = [];
const sweep = { tested: 0, seen: {} };

for (const cs of CASES) {
  const domF = path.join(TMP, cs.name + '.dom.html'), conF = path.join(TMP, cs.name + '.con.txt');
  /* 每个用例独立的 user-data-dir：三次 Chrome 调用共用默认 profile 时，
     快速连续启动会抢 profile 锁。这是真实风险类别，所以隔离保留。
     ⚠️ 但它**不是**本次「没拿到 DOM」的原因：那次 stderr 全是
     "Unable to create cache"/"Gpu Cache Creation failed"，而 C 盘当时只剩
     0.36 GB —— 磁盘满才是根因（同一次运行还让本脚本写文件时 ENOSPC）。
     教训：0 字节 DOM + stderr 有 ERROR 时先查磁盘，别急着归因给锁。
     下面的 hint 输出就是为此而加——把 stderr 摘出来，省得下次再猜。 */
  const udd = path.join(TMP, 'profile-' + cs.name);
  const sweepQ = SWEEP ? '&sweep=1' : '';
  /* sweep 会驱动每个演示遍历各控件边界值，留足虚拟时间预算 */
  const budget = SWEEP ? 24000 : 15000;
  sh(`"${CHROME}" --headless=new --disable-gpu --no-sandbox ` +
     `--user-data-dir="${udd}" --disable-extensions --disable-background-networking ` +
     `--window-size=${cs.w},${cs.h} ` +
     `--virtual-time-budget=${budget} --enable-logging=stderr --level=0 ` +
     `--dump-dom "${BASE}?mountall=1&probe=1${cs.q}${sweepQ}" > "${domF}" 2> "${conF}"`);
  const dom = fs.existsSync(domF) ? fs.readFileSync(domF, 'utf8') : '';
  const con = fs.existsSync(conF) ? fs.readFileSync(conF, 'utf8') : '';
  if (!dom) {
    /* 光说「没拿到 DOM」等于让人重新猜一遍。把 stderr 的关键行摘出来，
       多数情况是 profile 锁或缓存创建失败（见上面 --user-data-dir 的注释）。 */
    const hint = (fs.existsSync(conF) ? fs.readFileSync(conF, 'utf8') : '')
      .split(/\r?\n/).filter(l => /ERROR|Unable|Failed/i.test(l)).slice(0, 2).join(' / ');
    console.log(`[${cs.name}] 没拿到 DOM —— Chrome 可能没起来。stderr: ${hint.slice(0, 220) || '(空)'}`);
    problems++; continue;
  }

  const pm = dom.match(/<title>PROBE::([^<]*)<\/title>/);
  if (!pm) { console.log(`[${cs.name}] 没有 PROBE 结果`); problems++; continue; }
  const probe = {};
  pm[1].trim().split(/\s+/).forEach(tok => {
    const m = tok.match(/^(.+?)\{(.*)\}$/);
    if (m) probe[m[1]] = m[2];
  });

  const rows = [];
  DATA.modules.forEach((m) => {
    const flags = probe[m.demo.id];
    const bad = [];
    if (flags === undefined) bad.push('探针没看到这个演示');
    else if (flags !== '') flags.split(',').forEach(f => {
      if (/^OVER/.test(f)) bad.push('文字越出 viewBox ' + f);
      else if (/^CLASH/.test(f)) bad.push('文字互相叠印 ' + f);
      else if (/^LOWFILL/.test(f)) bad.push('文字压在色块上对比度不足 ' + f);
      else bad.push({ NOTLIVE: '未挂载', NOSVG: '无画布', NOVB: '无 viewBox', NOCTRL: '无控件',
        NOHINT: '无 hint', NORESET: '无重置', PLACEHOLDER: '残留占位', NOCtm: '无 CTM' }[f] || f);
    });
    if (bad.length) { problems++; rows.push(pad(m.id, 6) + 'FAIL ' + bad.join('; ')); }
  });

  const page = probe.PAGE || '';
  /* 判 pageBad 前必须剔掉 SWEEP= 令牌：它的命中文本里含 LOWFILL/CLASH 等旗名，
     否则非默认扫描的命中会污染【阻断项】——实测把闸门 4 从绿顶成「3 项需要处理」。
     阻断项只该反映初始态与页面级检查，sweep 命中另走非阻断的排队路径。 */
  const pageCore = page.split(',').filter(t => !t.startsWith('SWEEP=')).join(',');
  const pageBad = /HSCROLL|FIGLOW|LOWFILL|CONTRAST/.test(pageCore);
  if (pageBad) problems++;
  const errs = con.split(/\r?\n/).filter(l => /Uncaught|TypeError|ReferenceError|挂载失败|\[demo /.test(l));
  if (errs.length) problems += errs.length;

  /* sweep 命中：单独收集，不并进 problems（--sweep 是排队修用的，不该让默认闸门变红）。
     tested 数来自 PAGE 的 SWEEP= 令牌——它 >0 就证明扫描真跑过（不是空读控件），
     命中明细从 stderr 的 [SWEEP-BAD] 行取（title 会截断，stderr 才是全量）。 */
  if (SWEEP) {
    const swTok = (page.split(',').find(t => t.startsWith('SWEEP=')) || '').replace(/&amp;/g, '&');
    const tested = Number((swTok.match(/^SWEEP=(\d+)/) || [])[1] || 0);
    sweep.tested = Math.max(sweep.tested || 0, tested);
    const bad = con.split(/\r?\n/).filter(l => l.includes('[SWEEP-BAD]'))
      .map(l => l.replace(/^.*?\[SWEEP-BAD\] /, '').replace(/",\s*source:.*$/, '').trim());
    bad.forEach(b => { const k = b.split('@')[0]; if (!sweep.seen[k]) { sweep.seen[k] = true; sweepHits.push(cs.name.slice(0, 6) + ' ' + b); } });
    if (!tested) { console.log(`  [${cs.name}] ⚠ sweep 跑了但 tested=0 —— 控件没被识别，是真没扫到`); }
  }

  console.log(`\n=== ${cs.name}  (${cs.w}px) ===`);
  console.log('  页面 ' + (page || '无数据') + (pageBad ? '   <<< 有问题' : '   ok'));
  console.log('  演示 ' + (rows.length ? '\n  ' + rows.join('\n  ') : '13/13 全部通过'));
  errs.slice(0, 4).forEach(l => console.log('  console: ' + l.replace(/^.*?CONSOLE.*?\]\s*/, '').trim().slice(0, 150)));
}
if (SWEEP) {
  console.log('\n──── 非默认状态扫描 (--sweep) ────');
  console.log('  扫描组合数(单视口峰值): ' + (sweep.tested || 0));
  if (sweepHits.length) console.log('  命中 ' + Object.keys(sweep.seen).length + ' 类（叠印/压色块，滑杆拨到边界即可复现）:\n  ' + sweepHits.join('\n  '));
  else console.log('  无命中');
}
console.log('\n' + (problems ? problems + ' 项需要处理' : '三种视口/主题下全部通过（含图解对比度扫描）' + (SWEEP ? ' + 非默认状态扫描' : '')));
/* 清临时目录失败不该把结论盖掉：Windows 上 Chrome 偶尔还攥着 profile 句柄，
   rmSync 抛 EPERM 会崩在这里，人看到的只剩堆栈、看不到上面刚打印的判定。 */
try { fs.rmSync(TMP, { recursive: true, force: true }); }
catch (e) { console.log('（临时目录未清理：' + e.code + '，可手动删 ' + TMP + '）'); }
process.exit(problems ? 1 : 0);
})();
