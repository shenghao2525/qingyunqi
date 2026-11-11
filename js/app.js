/* 入口：登录、外壳、路由、事件分发、轮询 */

import {
  state, act, login, createRoom, logout, TOKEN_KEY, pingCloud, endpointUrl,
} from './api.js';
import { moraTotal, expTotal, debtTotal, unpaidFines } from './db.js';
import { cloudConfig, saveCloudConfig, clearCloudConfig, hasCloud, guessUrl } from './config.js';
import { renderPlayer, docReaderHtml } from './player.js';
import { renderAdmin } from './admin.js';
import { openModal, closeModal, toast, showFineTicket, moraIcon } from './ui.js';
import { taskForm, checkinForm, docForm, fineForm, rewardForm } from './forms.js';
import { escapeHtml, copyText, fmtMora, levelInfo, vibrate } from './util.js';

const app = { token: null, role: null, room: null, version: 0, tab: null };
const rootEl = () => document.getElementById('app');

const PLAYER_TABS = [
  { k: 'today', g: '日', t: '今日' },
  { k: 'tasks', g: '字', t: '任务' },
  { k: 'shop', g: '易', t: '商城' },
  { k: 'docs', g: '文', t: '公文' },
  { k: 'me', g: '吾', t: '我' },
];
const ADMIN_TABS = [
  { k: 'overview', g: '览', t: '总览' },
  { k: 'values', g: '律', t: '规矩' },
  { k: 'shop', g: '易', t: '商城' },
  { k: 'docs', g: '文', t: '公文' },
  { k: 'fines', g: '罚', t: '罚单' },
];

/* ---------------- 渲染 ---------------- */

function renderLogin() {
  const cfg = cloudConfig();
  const cloud = hasCloud();
  return `
  <div class="login">
    <div class="login-mark">${moraIcon(76)}</div>
    <h1 class="login-title">青云契</h1>
    <p class="login-sub">一契两钥 · 功课有赏 · 逾期有罚</p>

    <form class="card login-card" data-f="login">
      <label class="field">
        <span>钥匙</span>
        <input name="key" placeholder="XY-P-XXXXXX / XY-A-XXXXXX"
               autocapitalize="characters" autocomplete="off" spellcheck="false" required />
      </label>
      <button class="btn btn-primary wide" type="submit">入 契</button>
      <button type="button" class="link center" data-a="diag">连不上？点这里自检</button>
      <p class="hint">XY-P 是弟子的钥匙，XY-A 是掌教的钥匙</p>
    </form>

    <details class="create-box">
      <summary>尚无契书 · 开宗立派</summary>
      <form class="card" data-f="create">
        <div class="row2">
          <label class="field"><span>洞府名</span><input name="roomName" value="青云小筑" maxlength="16" /></label>
          <label class="field"><span>你的称呼（掌教）</span><input name="adminName" value="掌教" maxlength="10" /></label>
        </div>
        <label class="field"><span>她的称呼（弟子）</span><input name="playerName" value="弟子" maxlength="10" /></label>
        <button class="btn btn-ghost wide" type="submit">生 成 一 对 钥 匙</button>
        <p class="hint">生成后请立刻抄下两把钥匙，关掉就再也看不到。</p>
      </form>
    </details>

    <details class="create-box cloud-box">
      <summary>${cloud ? '☁ 已接云端' : '☁ 接上云端 · 两台手机同步'}</summary>
      <form class="card" data-f="cloud">
        <label class="field">
          <span>Project URL</span>
          <input name="url" value="${escapeHtml(cfg.url)}" placeholder="https://xxxx.supabase.co"
                 autocapitalize="off" autocomplete="off" spellcheck="false" />
        </label>
        <label class="field">
          <span>anon public key</span>
          <input name="key" value="${escapeHtml(cfg.key)}" placeholder="eyJhbGciOiJIUzI1NiIs..."
                 autocapitalize="off" autocomplete="off" spellcheck="false" />
        </label>
        <div class="row2">
          <button type="button" class="btn btn-ghost" data-a="cloud.test">测 一 测</button>
          <button type="submit" class="btn btn-primary">保 存</button>
        </div>
        ${cloud ? '<button type="button" class="btn btn-ghost wide danger" data-a="cloud.off">断开云端，回到本机</button>' : ''}
        <p class="hint">anon key 本来就是公开的，可以放在网页里。service_role key 千万别填在这儿。</p>
      </form>
    </details>

    <p class="foot-note">${cloud ? '数据存在 Supabase 云端 · 两台设备共用一份' : '演示数据保存在本机浏览器'}</p>
  </div>`;
}

function renderShell() {
  const isAdmin = app.role === 'admin';
  const room = app.room;
  const tabs = isAdmin ? ADMIN_TABS : PLAYER_TABS;
  const mora = moraTotal(room);

  // 没改过称呼时，别显示成「弟子 · 弟子」
  const who = room.playerName && room.playerName !== '弟子' ? `弟子 · ${escapeHtml(room.playerName)}` : '弟子';
  const head = `<header class="hd">
    <div class="hd-l">
      <div class="hd-title">${isAdmin ? '掌教案' : escapeHtml(room.name)}</div>
      <div class="hd-sub">${isAdmin ? `${escapeHtml(room.name)} · ${escapeHtml(room.playerName)}` : who}</div>
    </div>
    <div class="hd-r">
      <span class="mora-pill">${moraIcon(isAdmin ? 14 : 15)}<b>${fmtMora(mora)}</b></span>
      <button class="hd-exit" data-a="logout" aria-label="退出登录，换一把钥匙">退出</button>
    </div>
  </header>`;

  return `
  <div class="shell">
    ${head}
    <main class="main">${isAdmin ? renderAdmin(app) : renderPlayer(app)}</main>
    <nav class="tabbar">
      ${tabs.map((t) => `
        <button class="tab ${app.tab === t.k ? 'on' : ''}" data-a="tab" data-tab="${t.k}">
          <i>${t.g}</i><span>${t.t}</span>
        </button>`).join('')}
    </nav>
  </div>`;
}

function render() {
  const y = window.scrollY;
  const logged = Boolean(app.token && app.room);
  rootEl().innerHTML = logged ? renderShell() : renderLogin();
  window.scrollTo(0, logged ? y : 0);
}

function apply(res) {
  app.room = res.room;
  app.version = res.version;
  app.role = res.role;
  app.token = app.token;
  if (!app.tab) app.tab = res.role === 'admin' ? 'overview' : 'today';
  render();
  checkFreshFines();
}

function checkFreshFines() {
  if (app.role !== 'player' || !app.room) return;
  const key = 'xz.seen.' + app.room.id;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { seen = []; }
  const open = unpaidFines(app.room);
  const fresh = open.filter((f) => !seen.includes(f.id));
  if (!fresh.length) return;
  localStorage.setItem(key, JSON.stringify([...seen, ...fresh.map((f) => f.id)]));
  const newest = fresh[fresh.length - 1];
  setTimeout(() => showFineTicket(newest), 400);
}

/* ---------------- 会话 ---------------- */

const KEY_STORE = 'xz.key';

/**
 * 令牌记在 localStorage（关掉标签页也不丢），
 * 钥匙也留一份，万一令牌被服务端清掉了，可以静默重登，不用她再输一次。
 */
function saveToken(t, key) {
  app.token = t;
  if (t) {
    localStorage.setItem(TOKEN_KEY, t);
    if (key) localStorage.setItem(KEY_STORE, String(key).trim().toUpperCase());
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(KEY_STORE);
  }
}

function savedKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
}

async function refresh() {
  if (!app.token) return;
  try {
    const res = await state({ token: app.token });
    if (res.version !== app.version || !app.room) apply(res);
    return;
  } catch (e) {
    const msg = e.message || '';
    // 网络抖动不要把人踢出去，等下次轮询
    if (!/登录已失效|缺少凭据|此契已焚/.test(msg)) return;

    // 令牌真失效了，就用本机记着的钥匙静默重登
    const k = savedKey();
    if (k) {
      try {
        const r = await login({ key: k });
        saveToken(r.token, k);
        app.version = 0;
        apply(await state({ token: r.token }));
        return;
      } catch (e2) { /* 钥匙也不行了，往下走 */ }
    }

    saveToken(null);
    app.room = null;
    app.tab = null;
    render();
    toast('登录已失效，请重新输入钥匙', 'error');
  }
}

async function run(action, payload = {}) {
  const res = await act({ token: app.token, action, payload });
  apply(res);
  return res;
}

/* ---------------- 事件 ---------------- */

function beep(ms = 10) { vibrate(ms); }

const modalConfirm = (text, okText = '确定', danger = false) =>
  new Promise((resolve) => {
    openModal(`
      <div class="sheet-head"><h2>${escapeHtml(text)}</h2></div>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-cancel>取消</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${escapeHtml(okText)}</button>
      </div>`);
    document.querySelector('[data-ok]').addEventListener('click', () => { closeModal(); resolve(true); });
    document.querySelector('[data-cancel]').addEventListener('click', () => { closeModal(); resolve(false); });
  });

const modalPrompt = (title, placeholder = '') =>
  new Promise((resolve) => {
    openModal(`
      <div class="sheet-head"><h2>${escapeHtml(title)}</h2></div>
      <form class="form" data-p>
        <label class="field"><span>理由</span><input name="v" placeholder="${escapeHtml(placeholder)}" maxlength="40" /></label>
        <div class="sheet-actions">
          <button type="button" class="btn btn-ghost" data-cancel>取消</button>
          <button type="submit" class="btn btn-primary">确定</button>
        </div>
      </form>`);
    const form = document.querySelector('form[data-p]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = new FormData(form).get('v');
      closeModal();
      resolve(String(v || '').trim());
    });
    document.querySelector('[data-cancel]').addEventListener('click', () => { closeModal(); resolve(null); });
  });

function openDoc(doc) {
  openModal(docReaderHtml(doc));
  const btn = document.querySelector('[data-a="doc.ack"]');
  if (!btn || !btn.hasAttribute('data-delay')) return;
  let n = 3;
  btn.disabled = true;
  btn.textContent = `阅 读 中 ${n}`;
  const timer = setInterval(() => {
    if (!btn.isConnected) { clearInterval(timer); return; }
    n -= 1;
    if (n <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = '已 阅';
    } else {
      btn.textContent = `阅 读 中 ${n}`;
    }
  }, 1000);
}

async function onClick(e) {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;
  const id = el.dataset.id;
  const room = app.room;

  try {
    switch (a) {
      case 'tab':
        app.tab = el.dataset.tab;
        window.scrollTo(0, 0);
        render();
        return;

      case 'logout': {
        const ok = await modalConfirm('退出后回到钥匙页，可以换一把钥匙进别的房间。', '退出');
        if (!ok) return;
        try { if (app.token) await logout({ token: app.token }); } catch (e) { /* 网络失败也照样本地退出 */ }
        saveToken(null);
        app.room = null;
        app.tab = null;
        app.version = 0;
        render();
        toast('已退出', 'ok');
        return;
      }

      case 'checkin.done': {
        const res = await run('checkin.done', { id });
        beep(18);
        const d = res.result || {};
        toast(`${d.late ? '已补记' : '已应卯'} · +${d.mora ?? 0} 摩拉 / +${d.exp ?? 0} 经验`, 'ok');
        return;
      }

      case 'checkin.new':
        openModal(checkinForm(room.settings, app.role === 'admin'));
        return;

      case 'checkin.approve':
      case 'checkin.toggle':
      case 'checkin.remove': {
        if (a === 'checkin.remove') {
          const ok = await modalConfirm('确定去掉这门功课？', '去掉', true);
          if (!ok) return;
        }
        await run(a, { id });
        beep(12);
        return;
      }

      case 'task.new':
        openModal(taskForm(room.settings));
        return;

      case 'task.done': {
        await run('task.done', { id });
        beep(18);
        const t = app.room.tasks.find((x) => x.id === id);
        toast(`已交 · +${t ? t.mora : 0} 摩拉`, 'ok');
        return;
      }

      case 'order.create': {
        const ok = await modalConfirm('要用摩拉兑换吗？兑换后需掌教兑现。', '兑换');
        if (!ok) return;
        await run('order.create', { id });
        beep(14);
        toast('已兑换，等掌教兑现', 'ok');
        return;
      }

      case 'order.fulfill':
        await run('order.fulfill', { id });
        toast('已标记兑现', 'ok');
        return;

      case 'order.reject': {
        const ok = await modalConfirm('退回这张兑换单？摩拉将全额退还。', '退回', true);
        if (!ok) return;
        await run('order.reject', { id });
        return;
      }

      case 'reward.new':
        openModal(rewardForm());
        return;

      case 'reward.toggle': {
        const r = room.rewards.find((x) => x.id === id);
        if (!r) return;
        await run('reward.update', { id, patch: { active: !r.active } });
        beep(10);
        return;
      }

      case 'reward.remove': {
        const ok = await modalConfirm('删除这件奖励？', '删除', true);
        if (!ok) return;
        await run('reward.remove', { id });
        return;
      }

      case 'fine.new':
        openModal(fineForm(room.settings));
        return;

      case 'fine.pay':
        await run('fine.pay', { id });
        beep(20);
        toast('已收款，罚单销账', 'ok');
        return;

      case 'fine.waive': {
        const reason = await modalPrompt('赦免这张罚单', '理由，会给她看');
        if (reason === null) return;
        await run('fine.waive', { id, note: reason || '掌教开恩' });
        toast('已赦免', 'ok');
        return;
      }

      case 'fine.view': {
        const f = room.fines.find((x) => x.id === id);
        if (f) showFineTicket(f);
        return;
      }

      case 'doc.new':
        openModal(docForm());
        return;

      case 'doc.open': {
        const d = room.docs.find((x) => x.id === id);
        if (d) openDoc(d);
        return;
      }

      case 'doc.ack': {
        await run('doc.ack', { id });
        closeModal();
        toast('已回执', 'ok');
        return;
      }

      case 'doc.revoke': {
        const ok = await modalConfirm('撤回这份公文？她那边会看不到。', '撤回', true);
        if (!ok) return;
        await run('doc.revoke', { id });
        return;
      }

      case 'diag': {
        const cfg = cloudConfig();
        const url = endpointUrl();
        openModal(`
          <div class="sheet-head"><h2>连线自检</h2><p>先看看是网络的问题，还是钥匙的问题</p></div>
          <div class="diag">
            <div class="keyline"><span>云端地址</span><b class="mono">${escapeHtml(cfg.url || '（未配置）')}</b></div>
            <div class="keyline"><span>密钥前缀</span><b class="mono">${escapeHtml((cfg.key || '').slice(0, 12) || '（未配置）')}…</b></div>
            <div class="keyline"><span>设备在线</span><b>${navigator.onLine ? '是' : '否'}</b></div>
            <div class="keyline"><span>自检结果</span><b id="diagOut">检测中…</b></div>
          </div>
          <p class="hint" style="margin-top:10px">
            如果这里显示「请求没发出去」，把下面这个地址复制到手机浏览器里直接打开，
            出现 <code>{"error":"只接受 POST"}</code> 就说明是通的：
          </p>
          <p class="mono small break">${escapeHtml(url)}</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-ghost" data-close>关闭</button>
            <button type="button" class="btn btn-primary" id="diagAgain">再 测 一 次</button>
          </div>`);

        const runDiag = async () => {
          const out = document.getElementById('diagOut');
          if (!out) return;
          out.textContent = '检测中…';
          const r = await pingCloud();
          out.textContent = r.ok ? '通 ✅' : '不通 · ' + r.message;
          out.style.color = r.ok ? '#3f6b45' : 'var(--red)';
        };
        runDiag();
        document.getElementById('diagAgain').addEventListener('click', runDiag);
        return;
      }

      case 'cloud.test': {
        const form = el.closest('form');
        if (!form) return;
        const fd = new FormData(form);
        const url = guessUrl(fd.get('url'));
        const key = String(fd.get('key') || '').trim();
        if (!url || !key) return toast('先把地址和密钥填上', 'error');
        toast('正在连……');
        const r = await pingCloud({ url, key });
        toast(r.ok ? '通了 · ' + r.message : r.message, r.ok ? 'ok' : 'error');
        return;
      }

      case 'cloud.off': {
        const ok = await modalConfirm('断开云端？这台设备会回到本地存储，云端数据不会被删。', '断开', true);
        if (!ok) return;
        clearCloudConfig();
        saveToken(null);
        location.reload();
        return;
      }

      default:
        toast('还没有这个操作：' + a, 'error');
    }
  } catch (err) {
    console.error(err);
    toast(err.message || '出错了', 'error');
  }
}

function formPatch(form, names) {
  const fd = new FormData(form);
  const patch = {};
  for (const n of names) {
    if (!fd.has(n)) continue;
    const v = fd.get(n);
    patch[n] = v === '' ? null : v;
  }
  return patch;
}

async function onSubmit(e) {
  const form = e.target.closest('form[data-f]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const kind = form.dataset.f;

  try {
    if (kind === 'login') {
      const entered = fd.get('key');
      const r = await login({ key: entered });
      saveToken(r.token, entered);
      app.version = 0;
      app.tab = null;
      const res = await state({ token: r.token });
      apply(res);
      toast('入契', 'ok');
      return;
    }

    if (kind === 'create') {
      const made = await createRoom({
        roomName: fd.get('roomName'),
        adminName: fd.get('adminName'),
        playerName: fd.get('playerName'),
      });
      showKeys(made);
      return;
    }

    if (kind === 'cloud') {
      const url = guessUrl(fd.get('url'));
      const key = String(fd.get('key') || '').trim();
      if (!url || !key) return toast('地址和密钥都要填', 'error');
      if (!/^https:\/\/.+/.test(url)) return toast('地址要以 https:// 开头', 'error');
      saveCloudConfig(url, key);
      saveToken(null);
      toast('已保存，正在重载…', 'ok');
      setTimeout(() => location.reload(), 500);
      return;
    }

    if (kind === 'task.create') {
      await run('task.create', {
        title: fd.get('title'),
        note: fd.get('note'),
        dueAt: new Date(fd.get('dueAt')).toISOString(),
        mora: Number(fd.get('mora')),
        exp: Number(fd.get('exp')),
      });
      closeModal();
      toast('任务已立', 'ok');
      return;
    }

    if (kind === 'checkin.create') {
      await run('checkin.create', {
        title: fd.get('title'),
        note: fd.get('note'),
        weekdays: fd.getAll('weekdays').map(Number),
        time: fd.get('time'),
        mora: Number(fd.get('mora')),
        exp: Number(fd.get('exp')),
      });
      closeModal();
      toast(app.role === 'admin' ? '功课已定' : '已提请，等掌教允准', 'ok');
      return;
    }

    if (kind === 'doc.create') {
      await run('doc.create', {
        title: fd.get('title'),
        body: fd.get('body'),
        mustRead: fd.get('mustRead') === 'on',
      });
      closeModal();
      toast('公文已颁', 'ok');
      return;
    }

    if (kind === 'fine.create') {
      await run('fine.create', {
        title: fd.get('title'),
        reason: fd.get('reason'),
        amount: Number(fd.get('amount')),
      });
      closeModal();
      toast('罚单已开', 'ok');
      return;
    }

    if (kind === 'reward.create') {
      await run('reward.create', {
        title: fd.get('title'),
        desc: fd.get('desc'),
        price: Number(fd.get('price')),
        stock: Number(fd.get('stock')),
        discount: Number(fd.get('discount')),
      });
      closeModal();
      toast('已上架', 'ok');
      return;
    }

    if (kind === 'reward.save') {
      const id = form.dataset.id;
      await run('reward.update', {
        id,
        patch: {
          title: String(fd.get('title') || '').trim(),
          price: Number(fd.get('price')),
          stock: Number(fd.get('stock')),
          discount: Number(fd.get('discount')),
        },
      });
      toast('已存', 'ok');
      return;
    }

    if (kind === 'settings.save') {
      const until = fd.get('discountUntil');
      await run('settings.update', {
        patch: {
          moraPerCheckin: Number(fd.get('moraPerCheckin')),
          expPerCheckin: Number(fd.get('expPerCheckin')),
          moraPerTask: Number(fd.get('moraPerTask')),
          expPerTask: Number(fd.get('expPerTask')),
          lateMoraRatio: Number(fd.get('lateMoraRatio')),
          fineCheckinMiss: Number(fd.get('fineCheckinMiss')),
          fineTaskOverdue: Number(fd.get('fineTaskOverdue')),
          globalDiscount: Number(fd.get('globalDiscount')),
          discountLabel: String(fd.get('discountLabel') || ''),
          discountUntil: until ? new Date(until).toISOString() : null,
        },
      });
      toast('规矩已改', 'ok');
      return;
    }

    if (kind === 'room.rename') {
      await run('room.rename', {
        name: fd.get('name'),
        adminName: fd.get('adminName'),
        playerName: fd.get('playerName'),
      });
      toast('已改名', 'ok');
      return;
    }

    toast('未知表单：' + kind, 'error');
  } catch (err) {
    console.error(err);
    toast(err.message || '出错了', 'error');
  }
}

function showKeys(made) {
  const block = (label, key, hint) => `
    <div class="key-box">
      <div class="key-label">${label}<span>${hint}</span></div>
      <div class="key-val" data-copy="${key}">${key}</div>
    </div>`;

  openModal(`
    <div class="sheet-head"><h2>契书已成</h2><p>两把钥匙，各执其一。抄下来，关掉就没了。</p></div>
    <div class="keys">
      ${block('掌教钥匙（你）', made.adminKey, '可改商品、发公文、开罚单')}
      ${block('弟子钥匙（她）', made.playerKey, '打卡、做任务、换奖励')}
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-copy-all="${made.adminKey}|${made.playerKey}">复制两把</button>
      <button type="button" class="btn btn-primary" data-a="enter-admin">以掌教身份进入</button>
    </div>`, { dismissable: false });

  document.querySelectorAll('[data-copy]').forEach((n) => {
    n.addEventListener('click', async () => {
      const ok = await copyText(n.dataset.copy);
      toast(ok ? '已复制' : '复制失败，请手动抄写', ok ? 'ok' : 'error');
    });
  });
  document.querySelector('[data-copy-all]').addEventListener('click', async (ev) => {
    const [a, p] = ev.currentTarget.dataset.copyAll.split('|');
    const ok = await copyText(`掌教：${a}\n弟子：${p}`);
    toast(ok ? '已复制两把钥匙' : '复制失败，请手动抄写', ok ? 'ok' : 'error');
  });
  document.querySelector('[data-a="enter-admin"]').addEventListener('click', async () => {
    const r = await login({ key: made.adminKey });
    saveToken(r.token, made.adminKey);
    closeModal();
    app.version = 0;
    app.tab = 'overview';
    apply(await state({ token: r.token }));
    toast('入契', 'ok');
  });
}

/* ---------------- 启动 ---------------- */

async function startPreview(mode, tab) {
  try {
    const made = await createRoom({ roomName: '青云小筑', adminName: '阿泽', playerName: '小雨' });
    const key = mode === 'admin' ? made.adminKey : made.playerKey;
    const r = await login({ key });
    saveToken(r.token, key);
    app.version = 0;
    app.tab = tab || (mode === 'admin' ? 'overview' : 'today');
    apply(await state({ token: r.token }));
  } catch (e) {
    console.error(e);
    render();
  }
}

function boot() {
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);

  const qs = new URLSearchParams(location.search);
  const preview = qs.get('preview');
  const saved = localStorage.getItem(TOKEN_KEY);

  if (preview) {
    startPreview(preview, qs.get('tab'));
  } else if (saved) {
    app.token = saved;
    refresh();
  } else {
    render();
  }

  // 轮询：只比版本号。云端模式下放慢，避免打爆免费额度
  const POLL_MS = hasCloud() ? 20000 : 1600;
  setInterval(() => {
    if (!app.token) return;
    if (document.hidden) return;
    refresh();
  }, POLL_MS);

  // 切回前台立刻同步一次
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && app.token) refresh();
  });

  // 其它标签页写了数据，立刻同步
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('xz.db')) refresh();
  });
}

boot();

window.__xg = { app, render, refresh, showFineTicket, toast };
