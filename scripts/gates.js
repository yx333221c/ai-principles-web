/* ==========================================================================
   gates.js · 一条命令跑完四道闸门
   用法：node scripts/gates.js [--only=1,2,3]

   为什么需要它：四道闸门要按顺序跑，而且 verify-demos 依赖 127.0.0.1:8765 上
   有个静态服务——忘了起就得到一句「本地服务不可用」，白跑一轮（开发期反复踩到）。
   这里自带一个零依赖静态服务，跑完自己关。

   为什么是本地闸门而不是 CI：仓库的推送凭据没有 workflow scope，GitHub 拒绝
   程序写入 .github/workflows/（见 README「与设计文档的偏差」）。CI 的那点好处
   ——「在别人机器上也是绿的」——用 --only 与跨平台脚本部分补回来。

   不 fail-fast：一闸门红就停下会让人只修第一个；跑完再汇总，一次看全。
   ========================================================================== */
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7)
  .split(',').filter(Boolean).map(Number);
const want = (n) => !only.length || only.includes(n);

/* 探测一律用 node 自己的 http，不用 shell 调 curl：
   实测同 URL 在父进程 node 探测是 200，经 `curl ... > file 2>nul` 却写出空文件，
   于是报「本地服务不可用」——假失败，还会把人引去查根本没问题的服务。
   （本轮就在这上面连猜错三次：同进程/独立进程、env 继承，都不是根因。） */
const probeServer = (url) => new Promise((done) => {
  let settled = false;
  const finish = (v) => { if (!settled) { settled = true; done(v); } };
  const req = http.get(url, (res) => { res.resume(); finish(res.statusCode); });
  req.on('error', () => finish(0));
  req.setTimeout(5000, () => { req.destroy(); finish(0); });
});

const run = (args, env) => new Promise((done) => {
  const c = spawn(process.execPath, args, {
    cwd: ROOT, stdio: 'inherit', env: Object.assign({}, process.env, env || {}),
  });
  c.on('exit', (code) => done(code == null ? 1 : code));
  c.on('error', () => done(1));
});

/* 静态服务起在独立进程里（scripts/serve.js），不在本进程内。
   理由不是性能而是隔离：本进程还要跑构建与自检，服务活着时它们的输出会交错；
   而且服务端口用 0（内核分配），避免撞上 8765 上残留的**旧**服务——
   那种情况下 verify-demos 验的不是当前产物，却会报告「全部通过」。 */
function startServer() {
  const portFile = path.join(os.tmpdir(), 'aip-gates-port-' + process.pid + '.txt');
  try { fs.unlinkSync(portFile); } catch { /* 不存在就好 */ }
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js'), '0', portFile],
    { cwd: ROOT, stdio: 'ignore', detached: false });
  let dead = false;
  child.on('exit', () => { dead = true; });
  return new Promise((ok, no) => {
    const t0 = Date.now();
    const poll = setInterval(() => {
      if (dead) { clearInterval(poll); no(new Error('serve.js 启动即退出')); return; }
      let p = '';
      try { p = fs.readFileSync(portFile, 'utf8').trim(); } catch { /* 还没写 */ }
      if (/^\d+$/.test(p)) {
        clearInterval(poll);
        try { fs.unlinkSync(portFile); } catch { /* 无所谓 */ }
        ok({ child, port: Number(p) });
      } else if (Date.now() - t0 > 8000) {
        clearInterval(poll); child.kill(); no(new Error('等 serve.js 报端口超时'));
      }
    }, 60);
  });
}

const results = [];
const step = async (n, name, fn) => {
  if (!want(n)) return;
  console.log('\n──── 闸门 ' + n + '：' + name + ' ────');
  const code = await fn();
  results.push({ n, name, code });
  console.log(code === 0 ? '  ✓ 通过' : '  ✗ 失败（exit ' + code + '）');
};

(async () => {
  let srv = null;
  try {
    if (want(4)) {
      srv = await startServer();
      /* 只有用户没显式指定 BASE 时才用自己的服务；显式指定说明他有意验那个地址 */
      if (!process.env.BASE) process.env.BASE = 'http://127.0.0.1:' + srv.port + '/index.html';
      /* 起完立刻自证可达：否则 verify-demos 只会回一句「本地服务不可用」，
         分不清是没起来、端口错了、还是被防火墙拦了。 */
      const code = await probeServer(process.env.BASE);
      if (code !== 200) {
        console.error('服务自证失败：' + process.env.BASE + ' 返回 [' + (code || '无响应') + ']');
        srv.child.kill();
        process.exit(2);
      }
      console.log('  服务已就绪：' + process.env.BASE + '（HTTP ' + code + '）');
    }
    await step(1, '结构自检（含「改了内容忘了重建」检测）', () => run(['scripts/selfcheck.js']));
    await step(2, '可计算断言独立复算', () => run(['scripts/verify-math.js']));
    await step(3, '构建幂等（重建产物须与提交的一致）', async () => {
      const before = fs.readFileSync(path.join(ROOT, 'index.html'));
      const c = await run(['build.js']);
      if (c !== 0) return c;
      if (!fs.readFileSync(path.join(ROOT, 'index.html')).equals(before)) {
        console.log('  ↑ 本次重建改动了 index.html：说明提交里的产物是旧的，请把新产物一并提交');
        return 1;
      }
      return 0;
    });
    await step(4, '真实浏览器渲染验证（三视口 / 双主题）', () => {
      console.log('  服务：' + process.env.BASE);
      return run(['scripts/verify-demos.js'], { BASE: process.env.BASE });
    });
  } catch (e) {
    console.error('闸门没能跑起来：' + e.message);
    process.exit(2);
  } finally {
    if (srv) srv.child.kill();
  }

  const bad = results.filter(r => r.code !== 0);
  console.log('\n════ 汇总 ════');
  results.forEach(r => console.log('  ' + (r.code === 0 ? '✓' : '✗') + ' 闸门 ' + r.n + ' ' + r.name));
  console.log(bad.length
    ? '\n' + bad.length + '/' + results.length + ' 道闸门失败：' + bad.map(b => b.n).join(',')
    : '\n全部 ' + results.length + ' 道闸门通过');
  process.exit(bad.length ? 1 : 0);
})();
