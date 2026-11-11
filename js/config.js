/* 云端配置：填了 Project URL + anon key 就走 Supabase，否则走本地存储 */

const LS_KEY = 'xz.cloud';

/** 想把默认值写死在这里也可以（部署时就不用在手机上手输了） */
const DEFAULTS = {
  url: 'https://finpuvvvzyifghdnqepf.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbnB1dnZ2enlpZmdoZG5xZXBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMzAwNjEsImV4cCI6MjEwOTgwNjA2MX0.GTOpCjAhZiTBDFrlV182f9na7HYSKwIX83RfoGgIfME',
};

const clean = (s) => String(s || '').trim().replace(/\/+$/, '');

export function cloudConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && j.url) return { url: clean(j.url), key: String(j.key || '').trim() };
    }
  } catch (e) { /* ignore */ }
  return { url: clean(DEFAULTS.url), key: String(DEFAULTS.key).trim() };
}

export function saveCloudConfig(url, key) {
  localStorage.setItem(LS_KEY, JSON.stringify({ url: clean(url), key: String(key || '').trim() }));
}

export function clearCloudConfig() {
  localStorage.removeItem(LS_KEY);
}

export function hasCloud() {
  const c = cloudConfig();
  return Boolean(c.url && c.key);
}

/** 从粘贴的内容里猜出 URL（允许直接粘控制台的整段） */
export function guessUrl(text) {
  const t = String(text || '').trim();
  const m = t.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
  return m ? m[0] : clean(t);
}
