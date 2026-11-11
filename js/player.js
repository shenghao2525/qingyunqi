/* 弟子端：今日 / 任务 / 商城 / 公文 / 我 */

import {
  escapeHtml, dayKey, weekdayIdx, WEEK_CN, fmtDateTime, fmtDay,
  countdown, levelInfo, fmtMora, hhmm, toDate,
} from './util.js';
import { moraTotal, expTotal, debtTotal, unpaidFines, priceOf } from './db.js';
import { moraIcon, bar, empty, section } from './ui.js';

/* 今日各门功课的状态 */
export function todayStatus(room, now = new Date()) {
  const today = dayKey(now);
  return room.checkins
    .filter((c) => c.active && c.approved && (c.weekdays || []).includes(weekdayIdx(now)))
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((c) => {
      const log = room.logs.find((l) => l.checkinId === c.id && l.date === today);
      const due = toDate(today, c.time);
      let status = 'todo';
      if (log) status = log.status;
      // 今天新加的功课，已经过了时辰的不算违约
      else if (now.getTime() > due.getTime() && new Date(c.createdAt).getTime() <= due.getTime()) status = 'missed';
      return { c, log, due, status };
    });
}

const STATUS_TEXT = {
  done: '已应卯',
  late: '已补记',
  missed: '已逾期',
  todo: '待应卯',
};

function dutyCard(item, settings) {
  const { c, log, status } = item;
  const done = status === 'done' || status === 'late';
  const lateOpt = status === 'todo' && new Date() > item.due;
  return `
  <div class="card duty ${status}">
    <div class="duty-main">
      <div class="duty-title">
        <span>${escapeHtml(c.title)}</span>
        <em class="tag tag-${status}">${STATUS_TEXT[status] || status}</em>
      </div>
      <div class="duty-meta">
        <b>${c.time}</b> · 赏 ${c.mora} 摩拉 + ${c.exp} 经验
        ${lateOpt ? ` · <i class="warn">补记只得半赏</i>` : ''}
      </div>
      ${c.note ? `<div class="duty-note">${escapeHtml(c.note)}</div>` : ''}
    </div>
    ${
      done
        ? `<span class="duty-done">${moraIcon(14)}</span>`
        : `<button class="btn btn-check" data-a="checkin.done" data-id="${c.id}">应卯</button>`
    }
  </div>`;
}

function viewToday(app) {
  const { room } = app;
  const now = new Date();
  const list = todayStatus(room, now);
  const doneCount = list.filter((x) => x.status === 'done' || x.status === 'late').length;
  const debt = debtTotal(room);
  const lv = levelInfo(expTotal(room));

  const openTasks = room.tasks
    .filter((t) => t.status === 'open' || t.status === 'overdue')
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 3);

  const unread = room.docs.filter((d) => !d.revoked && !d.ackAt);

  return `
  <section class="hero">
    <div class="hero-head">
      <span>${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${WEEK_CN[weekdayIdx(now) - 1]}</span>
      <span class="hero-lv">${lv.name}</span>
    </div>
    <div class="hero-big">
      <b>${doneCount}</b><i>/ ${list.length || 0}</i>
      <span>门功课已应卯</span>
    </div>
    ${bar(list.length ? doneCount / list.length : 0)}
  </section>

  ${debt > 0 ? `<button class="alert-red" data-a="tab" data-tab="me">
      <span>你有一张罚单未销</span><b>¥ ${debt}</b>
    </button>` : ''}

  ${unread.length ? `<button class="alert-doc" data-a="tab" data-tab="docs">
      <span>案上有 ${unread.length} 道公文未阅</span><span class="arrow">›</span>
    </button>` : ''}

  ${section('今日功课', `<button class="link" data-a="checkin.new">＋ 提请功课</button>`)}
  <div class="list">
    ${list.length ? list.map((it) => dutyCard(it, room.settings)).join('') : empty('今日无功课', '山中清静，去立个任务也好')}
  </div>

  ${section('手头任务', `<button class="link" data-a="task.new">＋ 立任务</button>`)}
  <div class="list">
    ${
      openTasks.length
        ? openTasks.map((t) => taskRow(t)).join('')
        : empty('没有未了的任务')
    }
  </div>
  <div class="foot-space"></div>`;
}

export function taskRow(t) {
  const cd = countdown(t.dueAt);
  return `
  <div class="card task ${t.status}">
    <div class="task-main">
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="task-meta">
        <span class="${cd.overdue ? 'warn' : cd.urgent ? 'hot' : ''}">${cd.text}</span>
        · ${fmtDateTime(t.dueAt)}
        · ${moraIcon(12)}${t.mora}
      </div>
    </div>
    ${
      t.status === 'done'
        ? `<em class="tag tag-done">已交</em>`
        : t.status === 'cancelled'
        ? `<em class="tag">已撤</em>`
        : `<button class="btn btn-check" data-a="task.done" data-id="${t.id}">交了</button>`
    }
  </div>`;
}

function viewTasks(app) {
  const { room } = app;
  const open = room.tasks
    .filter((t) => t.status === 'open' || t.status === 'overdue')
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const closed = room.tasks
    .filter((t) => t.status === 'done' || t.status === 'cancelled')
    .sort((a, b) => new Date(b.doneAt || b.createdAt) - new Date(a.doneAt || a.createdAt))
    .slice(0, 12);

  return `
  <div class="page-head">
    <div><h2>任务</h2><p>立下的字，到期须交</p></div>
    <button class="btn btn-primary btn-sm" data-a="task.new">＋ 立任务</button>
  </div>

  ${section('未了')}
  <div class="list">
    ${open.length ? open.map(taskRow).join('') : empty('手头无事', '清闲也是修行')}
  </div>

  ${section('已了')}
  <div class="list">
    ${closed.length ? closed.map(taskRow).join('') : empty('还没有交过的任务')}
  </div>
  <div class="foot-space"></div>`;
}

function viewShop(app) {
  const { room } = app;
  const now = Date.now();
  const s = room.settings;
  const discountOn = s.globalDiscount > 0 && (!s.discountUntil || now < new Date(s.discountUntil).getTime());
  const mora = moraTotal(room);

  const items = room.rewards
    .filter((r) => r.active)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));

  const orders = [...room.orders].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);

  return `
  ${discountOn ? `<div class="coupon">
      <div class="coupon-left">${Math.round(s.globalDiscount * 100)}<i>%</i><span>OFF</span></div>
      <div class="coupon-right">
        <b>${escapeHtml(s.discountLabel || '全场折扣')}</b>
        <span>${s.discountUntil ? '截至 ' + fmtDateTime(s.discountUntil) : '长期有效'}</span>
      </div>
    </div>` : ''}

  <div class="page-head">
    <div><h2>商城</h2><p>以摩拉易物，需掌教允准</p></div>
  </div>

  <div class="list">
    ${
      items.length
        ? items.map((r) => {
            const price = priceOf(room, r);
            const off = price < r.price;
            const soldOut = Number(r.stock) <= 0;
            const afford = mora >= price && !soldOut;
            return `
            <div class="card goods ${soldOut ? 'soldout' : ''}">
              <div class="goods-head">
                <div class="goods-title">${escapeHtml(r.title)}</div>
                <div class="goods-price">
                  ${off ? `<s>${r.price}</s>` : ''}
                  <b>${moraIcon(14)}${price}</b>
                </div>
              </div>
              ${r.desc ? `<div class="goods-desc">${escapeHtml(r.desc)}</div>` : ''}
              <div class="goods-foot">
                <span class="stock">${soldOut ? '已换完' : '余 ' + r.stock + ' 份'}</span>
                <button class="btn ${afford ? 'btn-primary' : 'btn-ghost'} btn-sm"
                        data-a="order.create" data-id="${r.id}"
                        ${afford ? '' : 'disabled'}>兑换</button>
              </div>
            </div>`;
          }).join('')
        : empty('货架上空空如也')
    }
  </div>

  ${orders.length ? section('我的兑换') : ''}
  <div class="list">
    ${orders.map((o) => `
      <div class="row">
        <div><b>${escapeHtml(o.title)}</b><span class="dim">${fmtDateTime(o.at)} · ${o.price} 摩拉</span></div>
        <em class="tag ${o.status === 'pending' ? 'tag-wait' : o.status === 'fulfilled' ? 'tag-done' : 'tag-bad'}">
          ${o.status === 'pending' ? '待掌教兑现' : o.status === 'fulfilled' ? '已兑现' : '已退回'}
        </em>
      </div>`).join('')}
  </div>
  <div class="foot-space"></div>`;
}

export function docReaderHtml(doc) {
  return `
  <div class="doc-paper">
    <div class="doc-title">${escapeHtml(doc.title)}</div>
    <div class="doc-meta">${fmtDateTime(doc.at)} · ${escapeHtml(doc.author || '掌教')}</div>
    <div class="doc-body">${escapeHtml(doc.body || '').replace(/\n/g, '<br/>')}</div>
    <div class="doc-sign">${escapeHtml(doc.author || '掌教')}<span class="seal seal-sm">印</span></div>
  </div>
  <div class="sheet-actions">
    <button type="button" class="btn btn-ghost" data-close>收起</button>
    <button type="button" class="btn btn-primary" data-a="doc.ack" data-id="${doc.id}"
      ${doc.ackAt ? 'disabled' : 'data-delay'}>${doc.ackAt ? '已 阅 ' + fmtDay(doc.ackAt) : '已 阅'}</button>
  </div>`;
}

function viewDocs(app) {
  const { room } = app;
  const docs = [...room.docs]
    .filter((d) => !d.revoked)
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  return `
  <div class="page-head">
    <div><h2>公文</h2><p>掌教所颁，阅后须回执</p></div>
  </div>
  <div class="list">
    ${docs.length ? docs.map((d) => `
      <button class="card doc ${d.ackAt ? 'read' : 'unread'}" data-a="doc.open" data-id="${d.id}">
        <div class="doc-row">
          <div>
            <div class="doc-tt">${d.mustRead && !d.ackAt ? '<i class="dot"></i>' : ''}${escapeHtml(d.title)}</div>
            <div class="doc-mm">${fmtDateTime(d.at)} · ${d.mustRead ? '须回执' : '普通'}</div>
          </div>
          <em class="tag ${d.ackAt ? 'tag-done' : 'tag-wait'}">${d.ackAt ? '已阅' : '未阅'}</em>
        </div>
      </button>`).join('') : empty('案上无公文')}
  </div>
  <div class="foot-space"></div>`;
}

function viewMe(app) {
  const { room } = app;
  const mora = moraTotal(room);
  const exp = expTotal(room);
  const lv = levelInfo(exp);
  const fines = [...room.fines].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 12);
  const ledger = [...room.ledger].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 15);
  const debt = debtTotal(room);

  return `
  <section class="lv-card">
    <div class="lv-glow"></div>
    <div class="lv-name">${lv.name}</div>
    <div class="lv-sub">第 ${lv.level} 阶 / 共 27 阶</div>
    ${bar(lv.progress, 'bar-lv')}
    <div class="lv-exp">${lv.cur} / ${lv.need} 经验 · 距下一阶 ${Math.max(0, lv.need - lv.cur)}</div>
  </section>

  <div class="stat3">
    <div class="stat"><b>${moraIcon(15)}${fmtMora(mora)}</b><span>摩拉</span></div>
    <div class="stat"><b>${exp}</b><span>总经验</span></div>
    <div class="stat ${debt > 0 ? 'bad' : ''}"><b>¥${debt}</b><span>待缴罚单</span></div>
  </div>

  ${section('罚单')}
  <div class="list">
    ${fines.length ? fines.map((f) => `
      <button class="card fine ${f.status}" data-a="fine.view" data-id="${f.id}">
        <div class="fine-row">
          <div>
            <div class="fine-tt">${escapeHtml(f.reason || f.title)}</div>
            <div class="fine-mm">${fmtDateTime(f.at)}${f.note ? ' · ' + escapeHtml(f.note) : ''}</div>
          </div>
          <div class="fine-amt">
            <b>¥${Number(f.amount).toFixed(0)}</b>
            <em class="tag ${f.status === 'open' ? 'tag-bad' : f.status === 'paid' ? 'tag-done' : 'tag-wait'}">
              ${f.status === 'open' ? '待缴' : f.status === 'paid' ? '已缴' : '已赦'}
            </em>
          </div>
        </div>
      </button>`).join('') : empty('身无罚单', '善哉')}
  </div>

  ${section('摩拉流水')}
  <div class="list">
    ${ledger.map((l) => `
      <div class="row">
        <div><b>${escapeHtml(l.reason)}</b><span class="dim">${fmtDateTime(l.at)}</span></div>
        <em class="${l.mora >= 0 ? 'up' : 'down'}">${l.mora >= 0 ? '+' : ''}${l.mora}</em>
      </div>`).join('')}
  </div>

  ${section('契书')}
  <div class="card">
    <div class="keyline"><span>洞府</span><b>${escapeHtml(room.name)}</b></div>
    <div class="keyline"><span>房号</span><b>${escapeHtml(room.code)}</b></div>
    <div class="keyline"><span>身份</span><b>弟子 · ${escapeHtml(room.playerName)}</b></div>
    <p class="hint">钥匙即身份，勿示他人。丢了就找不回来了。</p>
  </div>

  <button class="btn btn-ghost wide danger" data-a="logout">退出登录 · 换一把钥匙</button>
  <div class="foot-space"></div>`;
}

export function renderPlayer(app) {
  switch (app.tab) {
    case 'tasks': return viewTasks(app);
    case 'shop': return viewShop(app);
    case 'docs': return viewDocs(app);
    case 'me': return viewMe(app);
    default: return viewToday(app);
  }
}
