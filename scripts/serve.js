/* ==========================================================================
   serve.js · 零依赖静态服务（给闸门 4 用，也可单独起来手工看页面）
   用法：node scripts/serve.js [端口] [端口文件] [--live-build]
        默认端口 0 = 内核挑一个空闲端口
        把实际端口写到 stdout 第一行（以及可选的端口文件），方便脚本读

   为什么要它：verify-demos 需要一个能访问当前产物的 HTTP 服务。历史上靠
   `python -m http.server 8765`，于是有两类反复踩到的坑：
     ① 忘了起服务，闸门直接失败；
     ② 8765 上留着**上一版**的服务（或别的目录），验的根本不是当前产物，
        却报告「全部通过」——假绿比不绿更糟。
   所以默认用空闲端口，让每个端口只对应一次真实启动。

   --live-build 治第三类坑（2026-10 由队友实测发现）：index.html 是生成物，
   内容改动不重建就不会进页面；而 CSS/JS 是运行时直接加载的。于是闸门 4 会
   出现「演示 JS 是新的、正文是旧的」这种混搭，并且照样报全过。加了该开关后，
   请求 index.html 时返回**当场构建**的结果，验的永远是当前源文件。
   ========================================================================== */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const LIVE = argv.includes('--live-build');
const pos = argv.filter(a => !a.startsWith('--'));
const PORT = Number(pos[0] || process.env.PORT || 0);
/* 可选：把实际端口写进文件，供父进程轮询读取。
   走文件而不是读子进程 stdout：沙箱下捕获管道 stdio 会被拒（EPERM）。 */
const PORTFILE = pos[1] || '';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

/* 当场构建：build.js --stdout 输出完整 HTML（selfcheck 的过期检测用的就是它）。
   一次服务期内只构建一次并缓存——同一轮闸门里源文件不会变，而页面会被请求三次。 */
let liveHtml = null;
function buildNow() {
  if (liveHtml !== null) return liveHtml;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), '--stdout'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  if (r.status !== 0 || !r.stdout || r.stdout.length < 1000) {
    throw new Error('build.js --stdout 失败（exit ' + r.status + '）：' + (r.stderr || '').slice(0, 300));
  }
  liveHtml = r.stdout;
  return liveHtml;
}
if (LIVE) { buildNow(); console.error('live-build: 页面为当场构建（' + liveHtml.length + ' 字符）'); }

http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch { res.writeHead(400).end('bad url'); return; }
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  /* 首页走当场构建；其余资源仍从磁盘读（它们本来就是运行时加载的） */
  if (LIVE && /\/index\.html$/.test(rel)) {
    try {
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      res.end(buildNow());
    } catch (e) { res.writeHead(500).end('build failed: ' + e.message); }
    return;
  }
  const abs = path.resolve(ROOT, '.' + rel);
  /* 目录穿越防护：解析后必须仍在仓库内 */
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(abs, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',   // 闸门要验当前产物，不能吃缓存
    });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', function () {
  const port = this.address().port;
  if (PORTFILE) { try { fs.writeFileSync(PORTFILE, String(port)); } catch { /* 读不到就走 stdout */ } }
  console.log(port);
  console.error('serving ' + ROOT + (LIVE ? ' (live-build)' : '') + ' on http://127.0.0.1:' + port + '/');
});
