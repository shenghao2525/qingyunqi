/* 通用 UI 组件：摩拉图标、印章、提示、弹窗、罚单 */

import { escapeHtml, fmtDateTime, vibrate } from './util.js';

/** 手绘摩拉金币 */
export function moraIcon(size = 16, extra = '') {
  return `<svg class="mora ${extra}" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="19" fill="#6b4a13"/>
    <circle cx="20" cy="20" r="17.4" fill="url(#moraGrad)"/>
    <circle cx="20" cy="20" r="16.1" fill="none" stroke="#7d5a1b" stroke-width="1.5"
            stroke-dasharray="1.1 1.9" opacity=".7"/>
    <circle cx="20" cy="20" r="12.6" fill="none" stroke="#8a6420" stroke-width=".7" opacity=".45"/>
    <g fill="#7c5a1c" opacity=".82">
      <path d="M20 20C19.1 16.1 20.3 12.3 24.6 11.1c.6 4.2-.9 7.6-4.6 8.9Z"/>
      <path d="M20 20C19.1 16.1 20.3 12.3 24.6 11.1c.6 4.2-.9 7.6-4.6 8.9Z" transform="rotate(120 20 20)"/>
      <path d="M20 20C19.1 16.1 20.3 12.3 24.6 11.1c.6 4.2-.9 7.6-4.6 8.9Z" transform="rotate(240 20 20)"/>
    </g>
    <circle cx="20" cy="20" r="1.9" fill="#6b4a13" opacity=".55"/>
  </svg>`;
}

export function moraPill(amount, cls = '') {
  return `<span class="mora-pill ${cls}">${moraIcon(15)}<b>${amount}</b></span>`;
}

/** 红色印章 */
export function seal(text = '罚', cls = '') {
  return `<span class="seal ${cls}">${escapeHtml(text)}</span>`;
}

/* ---------------- 提示条 ---------------- */

export function toast(msg, type = 'info', ms) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const life = ms || (type === 'error' ? 5000 : 2200);
  setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => el.remove(), 260);
  }, life);
}

/* ---------------- 弹窗 ---------------- */

let modalClosers = [];

export function openModal(html, { onClose, dismissable = true } = {}) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="overlay" data-overlay>
    <div class="sheet" role="dialog" aria-modal="true">${html}</div>
  </div>`;
  const overlay = root.querySelector('[data-overlay]');
  requestAnimationFrame(() => overlay.classList.add('on'));

  const close = () => {
    overlay.classList.remove('on');
    setTimeout(() => {
      root.innerHTML = '';
      modalClosers = modalClosers.filter((f) => f !== close);
      onClose && onClose();
    }, 200);
  };
  modalClosers.push(close);

  if (dismissable) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
      if (e.target.closest('[data-close]')) close();
    });
  }
  return close;
}

export function closeModal() {
  const fn = modalClosers[modalClosers.length - 1];
  if (fn) fn();
}

/** 直接铺满整屏的层（不受 .sheet 的 transform 影响） */
export function openRaw(html) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = html;
  const wrap = root.firstElementChild;
  const close = () => { root.innerHTML = ''; };
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) close();
    });
  }
  return close;
}

/* ---------------- 罚单（整屏） ---------------- */

export function showFineTicket(fine) {
  vibrate(40);
  const html = `
  <div class="ticket-wrap">
    <div class="ticket">
      <div class="ticket-head">
        <span class="ticket-no">罚 单</span>
        <span class="ticket-date">${fmtDateTime(fine.at)}</span>
      </div>
      <div class="t-hr"></div>
      <div class="ticket-body">
        <p class="ticket-line"><span>事　由</span>${escapeHtml(fine.reason || fine.title)}</p>
        <p class="ticket-line"><span>依　据</span>青云小筑契·第三条</p>
        <p class="ticket-amount"><span>金　额</span><b>¥ ${Number(fine.amount).toFixed(0)}</b></p>
      </div>
      <div class="t-hr"></div>
      <div class="ticket-foot">
        <p class="ticket-tip">以人民币计，缴清后由掌教核销</p>
      </div>
      <div class="stamp" aria-hidden="true">
        <div class="stamp-ring">罚</div>
        <div class="stamp-sub">青云小筑</div>
      </div>
    </div>
    <button class="btn btn-primary ticket-ok" data-close>知 道 了</button>
  </div>`;
  openRaw(html);
}

/* ---------------- 小工具 ---------------- */

export function bar(progress, cls = '') {
  const p = Math.max(0, Math.min(1, progress || 0)) * 100;
  return `<div class="bar ${cls}"><i style="width:${p.toFixed(1)}%"></i></div>`;
}

export function empty(text, sub = '') {
  return `<div class="empty"><div class="empty-mark">☯</div><p>${escapeHtml(text)}</p>${sub ? `<span>${escapeHtml(sub)}</span>` : ''}</div>`;
}

export function section(title, right = '') {
  return `<div class="sec"><h3>${escapeHtml(title)}</h3>${right}</div>`;
}
