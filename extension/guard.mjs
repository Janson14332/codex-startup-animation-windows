// Keeps watch over Codex while the animation plays. Codex can reload its page, replace
// page content, or open its real main window shortly after start; any of these wipes or
// covers the overlay. The guard logs what happens and re-injects when the animation is
// gone before it finished.
import { setTimeout as delay } from 'node:timers/promises';
import { connect, localSocket, pageTarget } from './cdp.mjs';

export const PROBE = `(()=>{
  let popover=false;try{popover=!!document.querySelector(':popover-open');}catch{}
  return {
    page:location.pathname+(new URLSearchParams(location.search).get('initialRoute')||''),
    ready:document.readyState,body:!!document.body,visible:document.visibilityState,focus:document.hasFocus(),
    modal:!!document.querySelector(':modal'),popover,
    attached:!!document.getElementById('aemeath-extension-overlay'),
    status:globalThis.__aemeathExtension?.status()??null
  };
})()`;

// Decide what to do with one page from its probe result.
export function decide(state) {
  if (!state || !state.body || state.ready === 'loading') return 'wait';
  if (state.status?.completed) return 'done';
  if (!state.status) return 'inject';                       // page reloaded: extension gone
  if (state.status.overlay && !state.attached) return 'reset'; // page content replaced the overlay
  return 'wait';
}

export function describe(state) {
  if (!state) return '无响应';
  const status = state.status ? `动画 ${state.status.phase}${state.status.overlay ? '' : '（无叠加层）'}` : '无动画';
  const flags = [state.visible === 'visible' ? '可见' : '隐藏', state.focus ? '有焦点' : '无焦点'];
  if (state.modal) flags.push('有模态框');
  if (state.popover) flags.push('有弹出层');
  if (state.status?.overlay && !state.attached) flags.push('叠加层已脱离页面');
  return `${state.page} ${state.ready} · ${status} · ${flags.join(' ')}`;
}

const route = url => { try { const u = new URL(url); return u.protocol + '//' + u.host + u.pathname + (u.searchParams.get('initialRoute') ? '?' + u.searchParams.get('initialRoute') : ''); } catch { return String(url).slice(0, 60); } };

export async function guard({ port, source, durationMs, log = console.log, maxReinjects = 3, fetchImpl = fetch, connectImpl = connect, now = Date.now, pause = delay }) {
  const start = now(), until = start + Math.min(40000, 2500 + durationMs + 4000);
  const clients = new Map(), seen = new Map();
  let lastPages = '', reinjects = 0;
  const at = () => `+${((now() - start) / 1000).toFixed(1)}s`;
  try {
    while (now() < until) {
      let targets;
      try {
        const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1200), redirect: 'error' });
        targets = await response.json();
      } catch (error) { log(`${at()} 读取页面列表失败：${error.message}`); await pause(400); continue; }
      const pages = Array.isArray(targets) ? targets.filter(target => target.type === 'page') : [];
      const summary = pages.map(target => `${String(target.id).slice(0, 6)} ${route(target.url)}${pageTarget(target) ? ' [主窗口]' : ''}`).join(' | ');
      if (summary !== lastPages) { log(`${at()} 页面：${summary || '无'}`); lastPages = summary; }
      let finished = false;
      for (const target of pages.filter(pageTarget)) {
        try {
          let client = clients.get(target.id);
          if (!client) { client = await connectImpl(localSocket(target.webSocketDebuggerUrl, port)); clients.set(target.id, client); }
          const state = (await client.call('Runtime.evaluate', { expression: PROBE, returnByValue: true }, 3000)).result?.value;
          const text = describe(state);
          if (seen.get(target.id) !== text) { seen.set(target.id, text); log(`${at()} ${String(target.id).slice(0, 6)} ${text}`); }
          const action = decide(state);
          if (action === 'done') finished = true;
          if ((action === 'inject' || action === 'reset') && reinjects < maxReinjects) {
            reinjects++;
            log(`${at()} ${action === 'inject' ? '页面已重新加载，动画丢失' : '叠加层被页面内容替换'}，重新注入（第 ${reinjects} 次）`);
            if (action === 'reset') await client.call('Runtime.evaluate', { expression: 'globalThis.__aemeathExtension?.dispose()' }, 3000);
            await client.call('Runtime.evaluate', { expression: source, returnByValue: true, awaitPromise: true });
            await client.call('Page.bringToFront').catch(() => {});
          }
        } catch (error) {
          clients.get(target.id)?.close(); clients.delete(target.id);
          if (seen.get(target.id) !== '断开') { seen.set(target.id, '断开'); log(`${at()} ${String(target.id).slice(0, 6)} 连接断开：${error.message}`); }
        }
      }
      if (finished) { log(`${at()} 动画播放完成`); return; }
      await pause(300);
    }
    log(`${at()} 监视结束`);
  } finally {
    for (const client of clients.values()) client.close();
  }
}
