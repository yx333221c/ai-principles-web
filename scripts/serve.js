/* ==========================================================================
   serve.js · 零依赖静态服务（给闸门 4 用，也可单独起来手工看页面）
   用法：node scripts/serve.js [端口]      默认 0 = 内核挑一个空闲端口
        把实际端口写到 stdout 第一行，方便脚本读；Ctrl-C 退出。

   为什么要它：verify-demos 需要一个能访问当前产物的 HTTP 服务。历史上靠
   `python -m http.server 8765`，于是有两类反复踩到的坑：
     ① 忘了起服务，闸门直接失败；
     ② 8765 上留着**上一版**的服务（或别的目录），验的根本不是当前产物，
        却报告「全部通过」——假绿比不绿更糟。
   所以这里默认用空闲端口，让每个端口只对应一次真实启动。
   ========================================================================== */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 0);
/* 可选：把实际端口写进文件，供父进程轮询读取。
   走文件而不是读子进程 stdout：沙箱下捕获管道 stdio 会被拒（EPERM）。 */
const PORTFILE = process.argv[3] || '';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch { res.writeHead(400).end('bad url'); return; }
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
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
  console.error('serving ' + ROOT + ' on http://127.0.0.1:' + port + '/');
});
