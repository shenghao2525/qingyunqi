/* 通用小工具：日期、格式化、等级体系 */

export const pad2 = (n) => String(n).padStart(2, '0');

export const uid = (p = 'id') =>
  p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/** 本地日期字符串 YYYY-MM-DD */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 周一=1 ... 周日=7 */
export function weekdayIdx(d = new Date()) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

export const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日'];

/** '2026-11-09' + '07:30' -> Date（本地时区） */
export function toDate(dateKey, time) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export function hhmm(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hhmm(d)}`;
}

export function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const sum = (arr, f) => arr.reduce((a, b) => a + (f ? f(b) : b), 0);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function fmtMora(n) {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(v);
}

/** 距离某时间还剩多久，返回 {text, urgent, overdue} */
export function countdown(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  let text;
  if (abs < 60000) text = '不到 1 分钟';
  else if (h >= 24) text = `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
  else if (h > 0) text = `${h} 小时 ${m} 分`;
  else text = `${m} 分钟`;
  return { text: overdue ? `已逾期 ${text}` : `剩 ${text}`, urgent: !overdue && abs < 3600000, overdue };
}

/* ---------------- 境界体系 ---------------- */

export const REALMS = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
export const STAGES = ['初期', '中期', '后期'];
export const MAX_LEVEL = REALMS.length * STAGES.length;

/** 从 lv 升到 lv+1 所需经验 */
export function expToNext(lv) {
  return Math.round(100 * Math.pow(lv, 1.35));
}

/** 由累计经验算境界 */
export function levelInfo(totalExp) {
  let lv = 1;
  let rest = Math.max(0, Math.floor(totalExp || 0));
  while (lv < MAX_LEVEL && rest >= expToNext(lv)) {
    rest -= expToNext(lv);
    lv += 1;
  }
  const realm = REALMS[Math.floor((lv - 1) / 3)];
  const stage = STAGES[(lv - 1) % 3];
  const need = lv >= MAX_LEVEL ? 0 : expToNext(lv);
  let base = 0;
  for (let i = 1; i < lv; i += 1) base += expToNext(i);
  return {
    level: lv,
    realm,
    stage,
    name: `${realm}${stage}`,
    cur: rest,
    need,
    base,
    progress: need ? clamp(rest / need, 0, 1) : 1,
  };
}

/** 复制到剪贴板，失败时回退 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

/** ISO 字符串 -> datetime-local 输入框要的本地格式 */
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function vibrate(ms = 12) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ }
}
