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

sh(`curl -s -o nul -w "%{http_code}" ${BASE} > "${path.join(TMP, 'probe.txt')}" 2>nul`);
const code = fs.existsSync(path.join(TMP, 'probe.txt')) ? fs.readFileSync(path.join(TMP, 'probe.txt'), 'utf8').trim() : '';
if (code !== '200') {
  console.error('本地服务不可用（HTTP ' + (code || 'n/a') + '）。先跑：python -m http.server 8765 --bind 127.0.0.1');
  process.exit(2);
}

const domF = path.join(TMP, 'all.dom.html'), conF = path.join(TMP, 'all.con.txt');
sh(`"${CHROME}" --headless=new --disable-gpu --no-sandbox --window-size=1600,4000 ` +
   `--virtual-time-budget=15000 --enable-logging=stderr --level=0 ` +
   `--dump-dom "${BASE}?mountall=1&probe=1" > "${domF}" 2> "${conF}"`);

const dom = fs.existsSync(domF) ? fs.readFileSync(domF, 'utf8') : '';
const con = fs.existsSync(conF) ? fs.readFileSync(conF, 'utf8') : '';
if (!dom) { console.error('没有拿到 DOM，检查 Chrome 路径：' + CHROME); process.exit(2); }

/* 解析探针结果：key{FLAGS} —— 全部判定都在浏览器里做，避免用正则切序列化 HTML */
const pm = dom.match(/<title>PROBE::([^<]*)<\/title>/);
if (!pm) { console.error('没拿到 PROBE 结果 —— ?probe=1 是否生效？（app.js 的 runProbe）'); process.exit(2); }
const probe = {};
/* runProbe 已保证 key 与 flags 内不含空格，可按空白切分 */
pm[1].trim().split(/\s+/).forEach(tok => {
  const m = tok.match(/^(.+?)\{(.*)\}$/);
  if (m) probe[m[1]] = m[2];
});

const count = (s, re) => (s.match(re) || []).length;
let problems = 0;
const lines = [];
DATA.modules.forEach((m) => {
  const key = m.demo.id;
  const flags = probe[key];
  const bad = [];
  if (flags === undefined) bad.push('探针没有看到这个演示（宿主缺失？）');
  else if (flags !== '') {
    flags.split(',').forEach(f => {
      if (/^OVER/.test(f)) bad.push('文字越出 viewBox：' + f);
      else bad.push({ NOTLIVE: '未挂载（缺 .is-live）', NOSVG: '无 SVG 画布', NOVB: '无 viewBox',
        NOCTRL: '无控件', NOHINT: '无 hint 说明', NORESET: '无重置按钮',
        PLACEHOLDER: '残留「尚未实现」/「加载失败」', NOCtm: '拿不到 CTM' }[f] || f);
    });
  }
  if (bad.length) problems++;
  lines.push({ id: m.id, key, bad: bad.join('; ') });
});

/* console 里的真实异常（忽略我们自己发的 warn） */
const errs = con.split(/\r?\n/).filter(l => /Uncaught|TypeError|ReferenceError|挂载失败|\[demo /.test(l));

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('模块', 6) + pad('演示键', 22) + '结论');
console.log('-'.repeat(96));
lines.forEach(l => console.log(pad(l.id, 6) + pad(l.key, 22) + (l.bad ? 'FAIL ' + l.bad : 'ok')));
if (errs.length) {
  console.log('\nconsole 异常 ' + errs.length + ' 条：');
  errs.slice(0, 8).forEach(l => console.log('  ' + l.replace(/^.*?CONSOLE.*?\]\s*/, '').trim().slice(0, 160)));
  problems += errs.length;
}
console.log('\n' + (problems ? problems + ' 项需要处理' : '全部 ' + lines.length + ' 个演示渲染通过、文字无越界、无 console 异常'));
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(problems ? 1 : 0);
