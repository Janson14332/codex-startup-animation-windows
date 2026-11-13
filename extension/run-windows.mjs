import { execFile as rawExec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildInjection } from './payload.mjs';
import { connect, localSocket, pageTarget } from './cdp.mjs';
import { guard } from './guard.mjs';
import { readFile } from 'node:fs/promises';

const execFile = promisify(rawExec);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolvePort(port));
    });
  });
}

export function parseListeners(output, port) {
  const listeners = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (match && match[1].endsWith(`:${port}`)) listeners.push({ address: match[1], pid: Number(match[2]) });
  }
  return listeners;
}

async function verifyListener(port, pid) {
  const { stdout } = await execFile('netstat.exe', ['-ano', '-p', 'TCP'], { timeout: 5000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const listeners = parseListeners(stdout, port);
  if (!listeners.length || listeners.some(item => item.address !== `127.0.0.1:${port}` || item.pid !== pid)) {
    throw new Error('调试端口并非由本机官方 Codex 进程独占监听');
  }
}

async function main() {
  const verified = process.argv.indexOf('--verified-exe');
  const exe = verified >= 0 ? process.argv[verified + 1] : null;
  if (!exe) throw new Error('请通过「扩展启动Codex.cmd」启动');
  const versionAt = process.argv.indexOf('--app-version');
  const version = versionAt >= 0 ? process.argv[versionAt + 1] : 'unknown';
  const isolated = process.argv.indexOf('--isolated-profile');
  const profile = isolated >= 0 ? process.argv[isolated + 1] : null;
  if (isolated >= 0 && (!profile || !resolve(profile).startsWith(resolve(root) + '\\'))) throw new Error('测试配置目录必须在项目内');
  const source = await buildInjection(root);
  const port = await freePort();
  const args = ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`];
  if (profile) args.push(`--user-data-dir=${resolve(profile)}`);
  // A hidden GUI child leaves its Chromium page hidden and throttles animation frames.
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject); });
  child.unref();
  console.log(`正在接入 Codex ${version}，进程 ${child.pid}…`);
  const deadline = Date.now() + 45000;
  let lastError = '等待主窗口';
  while (Date.now() < deadline) {
    let client;
    try {
      await verifyListener(port, child.pid);
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1200), redirect: 'error' });
      if (!response.ok) throw new Error('调试页面尚未就绪');
      const targets = await response.json();
      if (!Array.isArray(targets)) throw new Error('无效页面列表');
      const target = targets.find(pageTarget);
      if (!target) {
        if (!targets.length) throw new Error('调试端口没有页面；可能被仍在运行的旧版或后台 Codex 进程接管');
        const summary = targets.slice(0, 8).map(item => {
          try { const url = new URL(item.url); return `${item.type}:${url.protocol}//${url.host}${url.pathname}`; }
          catch { return String(item.type); }
        });
        throw new Error(`调试端口有 ${targets.length} 个页面，但没有匹配主窗口：${summary.join(', ')}`);
      }
      client = await connect(localSocket(target.webSocketDebuggerUrl, port));
      const result = await client.call('Runtime.evaluate', { expression: source, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails || result.result?.value?.installed !== true) throw new Error('动画注入失败');
      await client.call('Page.bringToFront').catch(() => {});
      for (let attempt = 0; attempt < 50; attempt++) {
        const answer = await client.call('Runtime.evaluate', { expression: 'globalThis.__aemeathExtension?.status()', returnByValue: true });
        const state = answer.result?.value;
        if (state?.ready && (state.phase === 'playing' || state.phase === 'waiting-visible')) {
          console.log(state.phase === 'playing' ? '动画已开始。Ctrl+Alt+B 打开图片设置。' : '动画已就绪，Codex 窗口显示后开始播放。Ctrl+Alt+B 打开图片设置。');
          client.close(); client = null;
          // Stay until the animation finishes: re-inject if Codex reloads or swaps its window.
          const media = JSON.parse(await readFile(resolve(root, 'assets/media-config.json'), 'utf8'));
          await guard({ port, source, durationMs: Number(media.durationMs) || 5000 });
          return;
        }
        if (state?.phase === 'failed' || state?.phase === 'timeout') throw new Error('动画素材加载失败');
        await delay(100);
      }
      throw new Error('动画启动确认超时');
    } catch (error) { lastError = error.message; }
    finally { client?.close(); }
    await delay(150);
  }
  throw new Error(`未能接入当前 Codex 版本：${lastError}。官方安装包未修改；完全退出应用后从原图标启动即可关闭调试端口。`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
