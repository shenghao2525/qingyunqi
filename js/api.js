/*
 * 数据层门面：同一个接口，两种后端。
 *   - 配了云端 → 走 Supabase Edge Function
 *   - 没配     → 走本地 localStorage（db.js）
 * 界面层只认这里导出的函数，不知道自己在连哪儿。
 */

import { cloudConfig, hasCloud } from './config.js';
import * as local from './db.js';

export const TOKEN_KEY = local.TOKEN_KEY;
export { hasCloud as cloudEnabled } from './config.js';

const ENDPOINT = () => `${cloudConfig().url}/functions/v1/api`;

/** 云端探活：返回 { ok, message }；可传入临时配置做「测一测」 */
export async function pingCloud(override) {
  const cfg = override || cloudConfig();
  if (!cfg.url || !cfg.key) return { ok: false, message: '还没填地址和密钥' };
  const url = `${String(cfg.url).replace(/\/+$/, '')}/functions/v1/api`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({ action: 'ping' }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
      return { ok: false, message: (body && body.error) || `HTTP ${res.status}` };
    }
    return { ok: true, message: '已连通' };
  } catch (e) {
    return { ok: false, message: describe(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** 诊断用：把当前实际请求的地址吐出来，方便手动在浏览器验证 */
export function endpointUrl() {
  return ENDPOINT();
}

/**
 * 发一次请求：15 秒超时 + 失败自动重试一次。
 * 把底层原因写进错误里，别再说「网络不通」这种查不出问题的废话。
 */
async function post(body, { timeoutMs = 15000 } = {}) {
  const cfg = cloudConfig();
  if (!cfg.url || !cfg.key) throw new Error('云端未配置');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function describe(e) {
  if (!e) return '未知错误';
  if (e.name === 'AbortError') return '超时（15 秒没有响应）';
  const m = String(e.message || e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '请求没发出去（DNS 或连接被挡住）';
  return m;
}

async function call(action, payload = {}) {
  const body = { action, ...payload };

  let res;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      res = await post(body);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
    }
  }
  if (lastErr) {
    throw new Error(`连不上云端：${describe(lastErr)}`);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`云端返回了无法解析的内容（HTTP ${res.status}）`);
  }
  if (!res.ok || data.error) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  return data;
}

/* ---------------- 与本地实现同名的四个接口 ---------------- */

export const createRoom = async (p) => (hasCloud() ? call('create', { payload: p }) : local.createRoom(p));

export const login = async (p) => (hasCloud() ? call('login', p) : local.login(p));

export const state = async (p) => (hasCloud() ? call('state', p) : local.state(p));

export const act = async ({ token, action, payload }) =>
  (hasCloud() ? call('act', { token, name: action, payload }) : local.act({ token, action, payload }));

export const logout = async ({ token }) => {
  if (hasCloud()) {
    try { await call('logout', { token }); } catch (e) { /* 忽略 */ }
    return true;
  }
  return local.logout({ token });
};
