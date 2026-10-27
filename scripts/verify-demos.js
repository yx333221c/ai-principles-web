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
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const TMP = path.join(os.tmpdir(), 'aip-verify');
fs.mkdirSync(TMP, { recursive: true });

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/modules.json'), 'utf8'));
const KEYS = DATA.modules.map(m => m.demo.id);

/* 沙箱下捕获子进程 stdout 会被拒（EPERM），所以一律用 shell 重定向 + stdio:ignore */
const sh = (cmd) => spawnSync(cmd, { shell: true, stdio: 'ignore', windowsHide: true }).status;
/* 空设备名必须按平台取：Linux 上写死 'nul' 会真的创建一个名叫 nul 的文件；
   而 os.devNull 在 Windows 返回 '\\.\nul'，cmd 的重定向解析器不认这个前缀，
   同样会落一个名叫 nul 的文件（实测踩过）。只有裸 'nul' 在 Windows 才是设备。 */
const DEVNULL = process.platform === 'win32' ? 'nul' : '/dev/null';

sh(`curl -s -o "${DEVNULL}" -w "%{http_code}" ${BASE} > "${path.join(TMP, 'probe.txt')}" 2>${DEVNULL}`);
const code = fs.existsSync(path.join(TMP, 'probe.txt')) ? fs.readFileSync(path.join(TMP, 'probe.txt'), 'utf8').trim() : '';
if (code !== '200') {
  console.error('本地服务不可用（HTTP ' + (code || 'n/a') + '）。先跑：python -m http.server 8765 --bind 127.0.0.1');
  process.exit(2);
}

/* 三种视口/主题组合：桌面亮、桌面暗（§8.2 双主题）、手机（§8.4 断点 S） */
const CASES = [
  { name: 'desktop-light', w: 1600, h: 4000, q: '' },
  { name: 'desktop-dark',  w: 1600, h: 4000, q: '&theme=dark' },
  { name: 'mobile',        w: 390,  h: 3200, q: '' }
];

const pad = (s, n) => String(s).padEnd(n);
let problems = 0;

for (const cs of CASES) {
  const domF = path.join(TMP, cs.name + '.dom.html'), conF = path.join(TMP, cs.name + '.con.txt');
  sh(`"${CHROME}" --headless=new --disable-gpu --no-sandbox --window-size=${cs.w},${cs.h} ` +
     `--virtual-time-budget=15000 --enable-logging=stderr --level=0 ` +
     `--dump-dom "${BASE}?mountall=1&probe=1${cs.q}" > "${domF}" 2> "${conF}"`);
  const dom = fs.existsSync(domF) ? fs.readFileSync(domF, 'utf8') : '';
  const con = fs.existsSync(conF) ? fs.readFileSync(conF, 'utf8') : '';
  if (!dom) { console.log(`[${cs.name}] 没拿到 DOM`); problems++; continue; }

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
  const pageBad = /HSCROLL|FIGLOW|LOWFILL|CONTRAST/.test(page);
  if (pageBad) problems++;
  const errs = con.split(/\r?\n/).filter(l => /Uncaught|TypeError|ReferenceError|挂载失败|\[demo /.test(l));
  if (errs.length) problems += errs.length;

  console.log(`\n=== ${cs.name}  (${cs.w}px) ===`);
  console.log('  页面 ' + (page || '无数据') + (pageBad ? '   <<< 有问题' : '   ok'));
  console.log('  演示 ' + (rows.length ? '\n  ' + rows.join('\n  ') : '13/13 全部通过'));
  errs.slice(0, 4).forEach(l => console.log('  console: ' + l.replace(/^.*?CONSOLE.*?\]\s*/, '').trim().slice(0, 150)));
}
console.log('\n' + (problems ? problems + ' 项需要处理' : '三种视口/主题下全部通过（含图解对比度扫描）'));
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(problems ? 1 : 0);
