/* 掌教端：总览 / 规矩 / 商城 / 公文 / 罚单 */

import {
  escapeHtml, fmtDateTime, fmtDay, levelInfo, fmtMora, WEEK_CN, REALMS, STAGES, isoToLocalInput,
} from './util.js';
import { moraTotal, expTotal, debtTotal, unpaidFines, priceOf } from './db.js';
import { moraIcon, bar, empty, section } from './ui.js';
import { todayStatus } from './player.js';

function viewOverview(app) {
  const { room } = app;
  const list = todayStatus(room);
  const done = list.filter((x) => x.status === 'done' || x.status === 'late').length;
  const debtList = unpaidFines(room);
  const debt = debtTotal(room);
  const pendingOrders = room.orders.filter((o) => o.status === 'pending');
  const pendingCheckins = room.checkins.filter((c) => !c.approved);
  const unreadDocs = room.docs.filter((d) => !d.revoked && d.mustRead && !d.ackAt);
  const mora = moraTotal(room);
  const lv = levelInfo(expTotal(room));

  const todo = [];
  if (debtList.length) todo.push({ t: `${debtList.length} 张罚单待收`, v: `¥${debt}`, a: 'tab', tab: 'fines', cls: 'red' });
  if (pendingOrders.length) todo.push({ t: `${pendingOrders.length} 件兑换待兑现`, a: 'tab', tab: 'shop' });
  if (pendingCheckins.length) todo.push({ t: `${pendingCheckins.length} 门功课待允准`, a: 'tab', tab: 'values' });
  if (unreadDocs.length) todo.push({ t: `${unreadDocs.length} 道公文未阅`, a: 'tab', tab: 'docs' });

  const recent = [...room.ledger].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

  return `
  <section class="hero hero-admin">
    <div class="hero-head">
      <span>${escapeHtml(room.name)} · 掌教案</span>
      <span class="hero-lv">${escapeHtml(room.playerName)}</span>
    </div>
    <div class="hero-big">
      <b>${done}</b><i>/ ${list.length || 0}</i>
      <span>门功课已应卯</span>
    </div>
    ${bar(list.length ? done / list.length : 0)}
    <div class="hero-foot">
      <span>弟子境界 <b>${lv.name}</b></span>
      <span>摩拉 <b>${fmtMora(mora)}</b></span>
    </div>
  </section>

  ${debt > 0 ? `<div class="alert-red static"><span>待收罚金</span><b>¥ ${debt}</b></div>` : ''}

  ${section('待办')}
  <div class="list">
    ${todo.length ? todo.map((x) => `
      <button class="card todo ${x.cls || ''}" data-a="${x.a}" ${x.tab ? `data-tab="${x.tab}"` : ''}>
        <span>${escapeHtml(x.t)}</span>
        <span class="todo-r">${x.v ? `<b>${x.v}</b>` : ''}<span class="arrow">›</span></span>
      </button>`).join('') : empty('案上无事', '清风徐来')}
  </div>

  <div class="quick">
    <button class="btn btn-primary" data-a="fine.new">开罚单</button>
    <button class="btn btn-ghost" data-a="doc.new">颁公文</button>
    <button class="btn btn-ghost" data-a="task.new">派任务</button>
  </div>

  ${section('近事')}
  <div class="list">
    ${recent.map((l) => `
      <div class="row">
        <div><b>${escapeHtml(l.reason)}</b><span class="dim">${fmtDateTime(l.at)}</span></div>
        <em class="${l.mora >= 0 ? 'up' : 'down'}">${l.mora >= 0 ? '+' : ''}${l.mora}</em>
      </div>`).join('')}
  </div>
  <div class="foot-space"></div>`;
}

function viewRules(app) {
  const { room } = app;
  const s = room.settings;
  const pending = room.checkins.filter((c) => !c.approved);

  return `
  <div class="page-head">
    <div><h2>规矩</h2><p>功课、赏罚、折扣，皆由你定</p></div>
  </div>

  ${pending.length ? section('待允准的提请') : ''}
  <div class="list">
    ${pending.map((c) => `
      <div class="card duty pending-approval">
        <div class="duty-main">
          <div class="duty-title"><span>${escapeHtml(c.title)}</span><em class="tag tag-wait">待允准</em></div>
          <div class="duty-meta">${c.time} · 周${c.weekdays.map((w) => WEEK_CN[w - 1]).join('')} · 赏 ${c.mora} 摩拉 + ${c.exp} 经验</div>
        </div>
        <div class="mini-actions">
          <button class="btn btn-sm btn-ghost" data-a="checkin.remove" data-id="${c.id}">驳回</button>
          <button class="btn btn-sm btn-primary" data-a="checkin.approve" data-id="${c.id}">允准</button>
        </div>
      </div>`).join('')}
  </div>

  ${section('功课表', `<button class="link" data-a="checkin.new">＋ 增一门</button>`)}
  <div class="list">
    ${room.checkins.filter((c) => c.approved).map((c) => `
      <div class="card duty ${c.active ? '' : 'off'}">
        <div class="duty-main">
          <div class="duty-title"><span>${escapeHtml(c.title)}</span>${c.active ? '' : '<em class="tag">已停</em>'}</div>
          <div class="duty-meta">${c.time} · ${c.weekdays.length === 7 ? '每日' : '周' + c.weekdays.map((w) => WEEK_CN[w - 1]).join('')} · 赏 ${c.mora} 摩拉 + ${c.exp} 经验</div>
        </div>
        <div class="mini-actions">
          <button class="btn btn-sm btn-ghost" data-a="checkin.toggle" data-id="${c.id}">${c.active ? '停' : '启'}</button>
          <button class="btn btn-sm btn-ghost danger" data-a="checkin.remove" data-id="${c.id}">删</button>
        </div>
      </div>`).join('') || empty('还没有功课')}
  </div>

  <form data-f="settings.save" class="card form-card">
    ${section('赏格')}
    <div class="row2">
      <label class="field"><span>打卡·摩拉</span><input type="number" name="moraPerCheckin" value="${s.moraPerCheckin}" min="0" /></label>
      <label class="field"><span>打卡·经验</span><input type="number" name="expPerCheckin" value="${s.expPerCheckin}" min="0" /></label>
    </div>
    <div class="row2">
      <label class="field"><span>任务·摩拉</span><input type="number" name="moraPerTask" value="${s.moraPerTask}" min="0" /></label>
      <label class="field"><span>任务·经验</span><input type="number" name="expPerTask" value="${s.expPerTask}" min="0" /></label>
    </div>
    <div class="row2">
      <label class="field"><span>补记只得比例</span><input type="number" name="lateMoraRatio" value="${s.lateMoraRatio}" min="0" max="1" step="0.1" /></label>
      <label class="field"><span>漏打卡罚金（元）</span><input type="number" name="fineCheckinMiss" value="${s.fineCheckinMiss}" min="0" /></label>
    </div>
    <label class="field"><span>任务逾期罚金（元 / 每日）</span><input type="number" name="fineTaskOverdue" value="${s.fineTaskOverdue}" min="0" /></label>

    ${section('折扣')}
    <div class="row2">
      <label class="field"><span>全店折扣（0.2 即八折）</span><input type="number" name="globalDiscount" value="${s.globalDiscount}" min="0" max="0.9" step="0.05" /></label>
      <label class="field"><span>名目</span><input name="discountLabel" value="${escapeHtml(s.discountLabel || '')}" placeholder="例如：双十一" maxlength="20" /></label>
    </div>
    <label class="field"><span>截止（空则长期）</span>
      <input type="datetime-local" name="discountUntil" value="${isoToLocalInput(s.discountUntil)}" />
    </label>

    <button type="submit" class="btn btn-primary wide">存 档</button>
  </form>

  ${section('境界')}
  <div class="card">
    <div class="realms">
      ${REALMS.map((r, i) => `<span class="realm ${Math.floor((levelInfo(expTotal(room)).level - 1) / 3) === i ? 'on' : ''}">${r}</span>`).join('')}
    </div>
    <p class="hint">每境三阶（${STAGES.join(' / ')}），升级经验 = 100 × 阶数<sup>1.35</sup>。${room.playerName} 现在第 ${levelInfo(expTotal(room)).level} 阶。</p>
  </div>

  ${section('契书')}
  <form data-f="room.rename" class="card form-card">
    <label class="field"><span>洞府名</span><input name="name" value="${escapeHtml(room.name)}" maxlength="16" /></label>
    <div class="row2">
      <label class="field"><span>掌教称呼</span><input name="adminName" value="${escapeHtml(room.adminName)}" maxlength="10" /></label>
      <label class="field"><span>弟子称呼</span><input name="playerName" value="${escapeHtml(room.playerName)}" maxlength="10" /></label>
    </div>
    <button type="submit" class="btn btn-ghost wide">改 名</button>
  </form>

  <button class="btn btn-ghost wide danger" data-a="logout" style="margin-top:18px">退出登录 · 换一把钥匙</button>
  <div class="foot-space"></div>`;
}

function viewAdminShop(app) {
  const { room } = app;
  const now = Date.now();
  const s = room.settings;
  const discountOn = s.globalDiscount > 0 && (!s.discountUntil || now < new Date(s.discountUntil).getTime());
  const pending = room.orders.filter((o) => o.status === 'pending');
  const history = room.orders.filter((o) => o.status !== 'pending').slice(0, 8).reverse();

  return `
  <div class="page-head">
    <div><h2>商城</h2><p>定价、库存、折扣，随你</p></div>
    <button class="btn btn-primary btn-sm" data-a="reward.new">＋ 上架</button>
  </div>

  ${discountOn ? `<div class="alert-doc static">全场 ${Math.round(s.globalDiscount * 100)}% OFF · ${escapeHtml(s.discountLabel || '')}</div>` : ''}

  ${section('待兑现')}
  <div class="list">
    ${pending.length ? pending.map((o) => `
      <div class="card order">
        <div class="row">
          <div><b>${escapeHtml(o.title)}</b><span class="dim">${fmtDateTime(o.at)} · 付 ${o.price} 摩拉</span></div>
        </div>
        <div class="mini-actions">
          <button class="btn btn-sm btn-ghost danger" data-a="order.reject" data-id="${o.id}">退 回</button>
          <button class="btn btn-sm btn-primary" data-a="order.fulfill" data-id="${o.id}">已兑现</button>
        </div>
      </div>`).join('') : empty('没有待兑现的兑换')}
  </div>

  ${section('货架')}
  <div class="list">
    ${room.rewards.map((r) => `
      <form class="card goods-admin" data-f="reward.save" data-id="${r.id}">
        <div class="goods-admin-top">
          <input class="in-title" name="title" value="${escapeHtml(r.title)}" maxlength="24" />
          <em class="tag ${r.active ? 'tag-done' : ''}">${r.active ? '在架' : '下架'}</em>
        </div>
        ${r.desc ? `<div class="goods-desc">${escapeHtml(r.desc)}</div>` : ''}
        <div class="row3">
          <label class="field"><span>价</span><input type="number" name="price" value="${r.price}" min="1" /></label>
          <label class="field"><span>库存</span><input type="number" name="stock" value="${r.stock}" min="0" /></label>
          <label class="field"><span>折扣</span><input type="number" name="discount" value="${r.discount || 0}" min="0" max="0.9" step="0.05" /></label>
        </div>
        <div class="goods-price-now">现价 ${moraIcon(13)}${priceOf(room, r)}</div>
        <div class="mini-actions">
          <button type="button" class="btn btn-sm btn-ghost danger" data-a="reward.remove" data-id="${r.id}">删除</button>
          <button type="button" class="btn btn-sm btn-ghost" data-a="reward.toggle" data-id="${r.id}">${r.active ? '下架' : '上架'}</button>
          <button type="submit" class="btn btn-sm btn-primary">保 存</button>
        </div>
      </form>`).join('') || empty('货架空着', '先上架一件吧')}
  </div>

  ${history.length ? section('已办兑换') : ''}
  <div class="list">
    ${history.map((o) => `
      <div class="row">
        <div><b>${escapeHtml(o.title)}</b><span class="dim">${fmtDateTime(o.at)}</span></div>
        <em class="tag ${o.status === 'fulfilled' ? 'tag-done' : 'tag-bad'}">${o.status === 'fulfilled' ? '已兑现' : '已退回'}</em>
      </div>`).join('')}
  </div>
  <div class="foot-space"></div>`;
}

function viewAdminDocs(app) {
  const { room } = app;
  const docs = [...room.docs].sort((a, b) => new Date(b.at) - new Date(a.at));

  return `
  <div class="page-head">
    <div><h2>公文</h2><p>颁下之后，弟子须阅</p></div>
    <button class="btn btn-primary btn-sm" data-a="doc.new">＋ 拟公文</button>
  </div>
  <div class="list">
    ${docs.length ? docs.map((d) => `
      <div class="card doc ${d.revoked ? 'revoked' : ''}">
        <div class="doc-row">
          <div>
            <div class="doc-tt">${escapeHtml(d.title)}${d.revoked ? ' <em class="tag">已撤回</em>' : ''}</div>
            <div class="doc-mm">${fmtDateTime(d.at)} · ${d.mustRead ? '须回执' : '普通'}</div>
          </div>
          <em class="tag ${d.ackAt ? 'tag-done' : d.mustRead ? 'tag-bad' : ''}">
            ${d.revoked ? '—' : d.ackAt ? '已阅 ' + fmtDay(d.ackAt) : d.mustRead ? '未阅' : '无需回执'}
          </em>
        </div>
        ${d.revoked ? '' : `<div class="mini-actions"><button class="btn btn-sm btn-ghost danger" data-a="doc.revoke" data-id="${d.id}">撤 回</button></div>`}
      </div>`).join('') : empty('尚未颁过公文')}
  </div>
  <div class="foot-space"></div>`;
}

function viewAdminFines(app) {
  const { room } = app;
  const open = room.fines.filter((f) => f.status === 'open').sort((a, b) => new Date(b.at) - new Date(a.at));
  const done = room.fines.filter((f) => f.status !== 'open').sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);
  const total = open.reduce((a, f) => a + Number(f.amount), 0);

  return `
  <div class="page-head">
    <div><h2>罚单</h2><p>逾期自动开单，你只须核销</p></div>
    <button class="btn btn-primary btn-sm" data-a="fine.new">＋ 开单</button>
  </div>

  <div class="stat3 one">
    <div class="stat bad"><b>¥${total}</b><span>待收 ${open.length} 张</span></div>
  </div>

  ${section('待缴')}
  <div class="list">
    ${open.length ? open.map((f) => `
      <div class="card fine open">
        <div class="fine-row">
          <div>
            <div class="fine-tt">${escapeHtml(f.reason || f.title)}</div>
            <div class="fine-mm">${fmtDateTime(f.at)} · ${f.source === 'manual' ? '手开' : f.source === 'checkin' ? '功课' : '任务'}</div>
          </div>
          <div class="fine-amt"><b>¥${Number(f.amount).toFixed(0)}</b></div>
        </div>
        <div class="mini-actions">
          <button class="btn btn-sm btn-ghost" data-a="fine.waive" data-id="${f.id}">赦 免</button>
          <button class="btn btn-sm btn-primary" data-a="fine.pay" data-id="${f.id}">已收款</button>
        </div>
      </div>`).join('') : empty('没有待缴罚单', '弟子很乖')}
  </div>

  ${section('已了')}
  <div class="list">
    ${done.map((f) => `
      <div class="row">
        <div><b>${escapeHtml(f.reason || f.title)}</b><span class="dim">${fmtDateTime(f.paidAt)}${f.note ? ' · ' + escapeHtml(f.note) : ''}</span></div>
        <em class="tag ${f.status === 'paid' ? 'tag-done' : 'tag-wait'}">${f.status === 'paid' ? '已缴' : '已赦'} ¥${Number(f.amount).toFixed(0)}</em>
      </div>`).join('') || empty('还没有销过的单')}
  </div>
  <div class="foot-space"></div>`;
}

export function renderAdmin(app) {
  switch (app.tab) {
    case 'values': return viewRules(app);
    case 'shop': return viewAdminShop(app);
    case 'docs': return viewAdminDocs(app);
    case 'fines': return viewAdminFines(app);
    default: return viewOverview(app);
  }
}
