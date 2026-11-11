/*
 * 数据层（本地演示版）
 * ------------------------------------------------------------------
 * 这一层的对外接口刻意写成和将来 Supabase Edge Function 完全一致的形状：
 *   createRoom / login / state / act
 * 将来只要把同名函数换成 fetch 调用，界面一行都不用改。
 *
 * 存储：localStorage 里一个 JSON 大对象，多标签页靠 storage 事件 + 版本号同步。
 */

import { uid, dayKey, weekdayIdx, toDate } from './util.js';

const DB_KEY = 'xz.db.v1';
export const TOKEN_KEY = 'xz.token';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DEFAULT_SETTINGS = {
  moraPerCheckin: 30,
  expPerCheckin: 12,
  moraPerTask: 50,
  expPerTask: 20,
  fineCheckinMiss: 5,
  fineTaskOverdue: 3,
  lateMoraRatio: 0.5,
  globalDiscount: 0,
  discountLabel: '',
  discountUntil: null,
};

/* ---------------- 底层存取 ---------------- */

function blank() {
  return { rooms: {}, index: {}, sessions: {}, v: 1 };
}

function read() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return blank();
    const d = JSON.parse(raw);
    return { ...blank(), ...d };
  } catch (e) {
    console.warn('读取存档失败，已重置', e);
    return blank();
  }
}

function write(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function rnd(n) {
  let s = '';
  for (let i = 0; i < n; i += 1) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/** 演示环境用轻量哈希；正式版由服务端做 SHA-256 */
function hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------------- 派生数值 ---------------- */

export const moraTotal = (room) => room.ledger.reduce((a, l) => a + (l.mora || 0), 0);
export const expTotal = (room) => room.ledger.reduce((a, l) => a + (l.exp || 0), 0);
export const unpaidFines = (room) => room.fines.filter((f) => f.status === 'open');
export const debtTotal = (room) => unpaidFines(room).reduce((a, f) => a + Number(f.amount || 0), 0);

/** 某商品当前实际售价（考虑全店折扣与单品折扣） */
export function priceOf(room, reward, now = Date.now()) {
  let price = Number(reward.price) || 0;
  const until = room.settings.discountUntil ? new Date(room.settings.discountUntil).getTime() : Infinity;
  if (room.settings.globalDiscount > 0 && now < until) {
    price = price * (1 - room.settings.globalDiscount);
  }
  if (reward.discount > 0 && (!reward.discountUntil || now < new Date(reward.discountUntil).getTime())) {
    price = price * (1 - reward.discount);
  }
  return Math.max(1, Math.round(price));
}

/* ---------------- 结算（相当于服务端的 pg_cron） ---------------- */

function settle(room, now = new Date()) {
  let dirty = false;
  const s = room.settings;
  const today = dayKey(now);

  for (const c of room.checkins) {
    if (!c.active || !c.approved) continue;
    if (!(c.weekdays || []).includes(weekdayIdx(now))) continue;
    const due = toDate(today, c.time);
    // 项目建立时间晚于今天该打卡的时间，今天不算违约
    if (new Date(c.createdAt).getTime() > due.getTime()) continue;
    if (room.logs.some((l) => l.checkinId === c.id && l.date === today)) continue;
    if (now.getTime() <= due.getTime()) continue;

    room.logs.push({ id: uid('lg'), checkinId: c.id, date: today, status: 'missed', at: due.toISOString() });
    room.fines.push({
      id: uid('fn'),
      source: 'checkin',
      refId: c.id,
      title: '功课未做',
      reason: `「${c.title}」应于 ${today} ${c.time} 前完成，未见打卡`,
      amount: Number(s.fineCheckinMiss) || 0,
      at: due.toISOString(),
      status: 'open',
    });
    dirty = true;
  }

  for (const t of room.tasks) {
    if (t.status !== 'open' && t.status !== 'overdue') continue;
    const dueMs = new Date(t.dueAt).getTime();
    if (now.getTime() <= dueMs) continue;
    if (t.status !== 'overdue') {
      t.status = 'overdue';
      dirty = true;
    }
    const lateDays = Math.floor((now.getTime() - dueMs) / 86400000) + 1;
    while ((t.fineCount || 0) < lateDays) {
      t.fineCount = (t.fineCount || 0) + 1;
      room.fines.push({
        id: uid('fn'),
        source: 'task',
        refId: t.id,
        title: '任务逾期',
        reason: `「${t.title}」逾期未交（第 ${t.fineCount} 日）`,
        amount: Number(s.fineTaskOverdue) || 0,
        at: new Date(dueMs + (t.fineCount - 1) * 86400000).toISOString(),
        status: 'open',
      });
      dirty = true;
    }
  }

  return dirty;
}

/* ---------------- 种子数据 ---------------- */

function seedRoom(room) {
  const now = new Date();
  const iso = now.toISOString();
  const mk = (title, weekdays, time, mora, exp, note) => ({
    id: uid('ck'),
    title,
    note: note || '',
    weekdays,
    time,
    mora,
    exp,
    active: true,
    approved: true,
    by: 'admin',
    createdAt: iso,
  });

  room.checkins.push(
    mk('卯时起身', [1, 2, 3, 4, 5, 6, 7], '07:30', 30, 12, '日出而作'),
    mk('诵经半刻', [1, 3, 5], '21:00', 25, 10, '每日研读'),
    mk('打坐调息', [2, 4, 6], '22:30', 20, 8, '静坐二十分钟'),
  );

  room.rewards.push(
    { id: uid('rw'), title: '奶茶一杯', desc: '指定品牌，任意口味', price: 120, stock: 5, active: true, discount: 0, discountUntil: null, sort: 1 },
    { id: uid('rw'), title: '追剧一集', desc: '时长 45 分钟以内', price: 60, stock: 10, active: true, discount: 0, discountUntil: null, sort: 2 },
    { id: uid('rw'), title: '肩颈按摩二十分钟', desc: '掌教亲自伺候', price: 200, stock: 3, active: true, discount: 0, discountUntil: null, sort: 3 },
    { id: uid('rw'), title: '周末半日出游', desc: '地点由弟子挑选', price: 800, stock: 1, active: true, discount: 0, discountUntil: null, sort: 4 },
  );

  room.docs.push({
    id: uid('dc'),
    title: '青云小筑·第一条契',
    body: '一、凡入此契者，每日功课须按时完成，不得借故推诿。\n\n二、功课有赏，赏以摩拉。摩拉可于商城兑换奖励，兑换需掌教允准。\n\n三、功课有罚。逾期未作者，开罚单一张，以人民币计，须于三日内缴清。\n\n四、掌教所发公文，弟子须于阅后点「已阅」，以示知悉。\n\n五、此契一式两份，各执一钥，不得外传。',
    author: '掌教',
    mustRead: true,
    at: iso,
    ackAt: null,
    revoked: false,
  });

  room.ledger.push({
    id: uid('ld'),
    at: iso,
    mora: 100,
    exp: 0,
    reason: '入门赏赐',
    refType: 'init',
    refId: null,
  });

  const due = new Date(now.getTime() + 3 * 3600000).toISOString();
  room.tasks.push({
    id: uid('tk'),
    title: '把阳台的衣服收了',
    note: '',
    dueAt: due,
    mora: 50,
    exp: 20,
    status: 'open',
    by: 'admin',
    createdAt: iso,
    doneAt: null,
    fineCount: 0,
  });
}

/* ---------------- 对外 API ---------------- */

export function createRoom({ roomName = '青云小筑', playerName = '弟子', adminName = '掌教' } = {}) {
  const db = read();
  const suffix = rnd(6);
  const playerKey = `XY-P-${suffix}`;
  const adminKey = `XY-A-${suffix}`;

  const room = {
    id: uid('rm'),
    code: suffix,
    name: String(roomName).trim() || '青云小筑',
    playerName: String(playerName).trim() || '弟子',
    adminName: String(adminName).trim() || '掌教',
    createdAt: new Date().toISOString(),
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    checkins: [],
    logs: [],
    tasks: [],
    ledger: [],
    rewards: [],
    orders: [],
    fines: [],
    docs: [],
  };
  seedRoom(room);

  db.rooms[room.id] = room;
  db.index[hashKey(playerKey)] = { roomId: room.id, role: 'player' };
  db.index[hashKey(adminKey)] = { roomId: room.id, role: 'admin' };
  write(db);

  return { playerKey, adminKey, roomId: room.id, roomCode: suffix };
}

export function login({ key }) {
  const db = read();
  const normalized = String(key || '').trim().toUpperCase().replace(/\s+/g, '');
  const hit = db.index[hashKey(normalized)];
  if (!hit) throw new Error('钥匙对不上。检查一下有没有多打空格？');
  const room = db.rooms[hit.roomId];
  if (!room) throw new Error('此契已焚，请重新开宗立派。');

  const token = uid('tk') + rnd(12);
  db.sessions[token] = { roomId: hit.roomId, role: hit.role, at: Date.now() };
  // 只留最近 40 个会话，避免存档膨胀
  const keys = Object.keys(db.sessions);
  if (keys.length > 40) {
    keys.sort((a, b) => db.sessions[a].at - db.sessions[b].at);
    for (const k of keys.slice(0, keys.length - 40)) delete db.sessions[k];
  }
  write(db);
  return { token, role: hit.role };
}

function current(token) {
  const db = read();
  const s = db.sessions[token];
  if (!s) throw new Error('登录已失效，请重新输入钥匙。');
  const room = db.rooms[s.roomId];
  if (!room) throw new Error('此契已焚。');
  return { db, s, room };
}

export async function state({ token }) {
  const { db, s, room } = current(token);
  if (settle(room)) {
    room.version = (room.version || 1) + 1;
    write(db);
  }
  return { version: room.version, role: s.role, room: clone(room) };
}

export async function act({ token, action, payload = {} }) {
  const { db, s, room } = current(token);
  settle(room);
  const fn = handlers[action];
  if (!fn) throw new Error('未知操作：' + action);
  const result = fn({ room, role: s.role, db }, payload);
  room.version = (room.version || 1) + 1;
  write(db);
  return { version: room.version, role: s.role, room: clone(room), result };
}

export function logout({ token }) {
  const db = read();
  delete db.sessions[token];
  write(db);
  return true;
}

export function readVersion() {
  const db = read();
  const ids = Object.keys(db.rooms);
  if (!ids.length) return 0;
  return db.rooms[ids[0]].version || 0;
}

export function wipeAll() {
  localStorage.removeItem(DB_KEY);
}

/* ---------------- 指令处理 ---------------- */

const needAdmin = (role) => {
  if (role !== 'admin') throw new Error('此令唯掌教可下。');
};

const pick = (o, k) => (o[k] === undefined ? undefined : o[k]);

const handlers = {
  'checkin.done': ({ room }, { id }) => {
    const c = room.checkins.find((x) => x.id === id);
    if (!c) throw new Error('没有这门功课。');
    if (!c.approved) throw new Error('这门功课还没得到允准。');
    const now = new Date();
    const today = dayKey(now);
    if (!(c.weekdays || []).includes(weekdayIdx(now))) throw new Error('今天不是这门功课的日子。');

    const due = toDate(today, c.time);
    let log = room.logs.find((l) => l.checkinId === id && l.date === today);
    if (log && (log.status === 'done' || log.status === 'late')) throw new Error('今日已经记过了。');
    const late = now.getTime() > due.getTime();
    if (!log) {
      log = { id: uid('lg'), checkinId: id, date: today, status: 'pending', at: null };
      room.logs.push(log);
    }
    log.status = late ? 'late' : 'done';
    log.at = now.toISOString();

    const mora = Math.round(c.mora * (late ? room.settings.lateMoraRatio : 1));
    room.ledger.push({
      id: uid('ld'),
      at: now.toISOString(),
      mora,
      exp: c.exp,
      reason: `功课「${c.title}」${late ? '补记' : '完成'}`,
      refType: 'checkin',
      refId: id,
    });
    return { mora, exp: c.exp, late };
  },

  'checkin.create': ({ room, role }, p) => {
    const weekdays = (p.weekdays || []).map(Number).filter((n) => n >= 1 && n <= 7);
    if (!weekdays.length) throw new Error('至少选一天。');
    if (!p.title) throw new Error('功课总得有个名字。');
    room.checkins.push({
      id: uid('ck'),
      title: String(p.title).trim(),
      note: String(p.note || '').trim(),
      weekdays,
      time: p.time || '08:00',
      mora: Number(p.mora ?? room.settings.moraPerCheckin),
      exp: Number(p.exp ?? room.settings.expPerCheckin),
      active: true,
      approved: role === 'admin',
      by: role,
      createdAt: new Date().toISOString(),
    });
  },

  'checkin.approve': ({ room, role }, { id }) => {
    needAdmin(role);
    const c = room.checkins.find((x) => x.id === id);
    if (!c) throw new Error('没有这门功课。');
    c.approved = true;
  },

  'checkin.remove': ({ room, role }, { id }) => {
    const c = room.checkins.find((x) => x.id === id);
    if (!c) return;
    if (role !== 'admin' && c.by !== 'player') throw new Error('此令唯掌教可下。');
    room.checkins = room.checkins.filter((x) => x.id !== id);
  },

  'checkin.toggle': ({ room, role }, { id }) => {
    needAdmin(role);
    const c = room.checkins.find((x) => x.id === id);
    if (!c) return;
    c.active = !c.active;
  },

  'task.create': ({ room, role }, p) => {
    if (!p.title || !String(p.title).trim()) throw new Error('任务总得有个名字。');
    if (!p.dueAt) throw new Error('给个期限吧。');
    room.tasks.push({
      id: uid('tk'),
      title: String(p.title).trim(),
      note: String(p.note || '').trim(),
      dueAt: new Date(p.dueAt).toISOString(),
      mora: Number(p.mora ?? room.settings.moraPerTask),
      exp: Number(p.exp ?? room.settings.expPerTask),
      status: 'open',
      by: role,
      createdAt: new Date().toISOString(),
      doneAt: null,
      fineCount: 0,
    });
  },

  'task.done': ({ room }, { id }) => {
    const t = room.tasks.find((x) => x.id === id);
    if (!t) throw new Error('没有这个任务。');
    if (t.status === 'done') throw new Error('已经交过了。');
    const now = new Date();
    t.status = 'done';
    t.doneAt = now.toISOString();
    const late = now.getTime() > new Date(t.dueAt).getTime();
    room.ledger.push({
      id: uid('ld'),
      at: now.toISOString(),
      mora: t.mora,
      exp: t.exp,
      reason: `任务「${t.title}」${late ? '补交' : '完成'}`,
      refType: 'task',
      refId: t.id,
    });
  },

  'task.cancel': ({ room, role }, { id }) => {
    const t = room.tasks.find((x) => x.id === id);
    if (!t) return;
    if (role !== 'admin' && t.by !== 'player') throw new Error('此令唯掌教可下。');
    if (t.status === 'done') throw new Error('已完成的任务不能撤销，请用「追回」。');
    t.status = 'cancelled';
  },

  'ledger.reverse': ({ room, role }, { id }) => {
    needAdmin(role);
    const l = room.ledger.find((x) => x.id === id);
    if (!l) throw new Error('没有这笔账。');
    if (l.refType === 'reverse') throw new Error('追回记录不能再追回。');
    room.ledger.push({
      id: uid('ld'),
      at: new Date().toISOString(),
      mora: -(l.mora || 0),
      exp: -(l.exp || 0),
      reason: `追回：${l.reason}`,
      refType: 'reverse',
      refId: l.id,
    });
  },

  'order.create': ({ room }, { id }) => {
    const r = room.rewards.find((x) => x.id === id);
    if (!r || !r.active) throw new Error('此物已下架。');
    if (Number(r.stock) <= 0) throw new Error('已经换完了。');
    const price = priceOf(room, r);
    if (moraTotal(room) < price) throw new Error('摩拉不足，先去做功课吧。');

    const now = new Date();
    room.ledger.push({
      id: uid('ld'),
      at: now.toISOString(),
      mora: -price,
      exp: 0,
      reason: `兑换「${r.title}」`,
      refType: 'order',
      refId: r.id,
    });
    r.stock = Number(r.stock) - 1;
    room.orders.push({
      id: uid('od'),
      rewardId: r.id,
      title: r.title,
      price,
      at: now.toISOString(),
      status: 'pending',
      note: '',
    });
    return { price };
  },

  'order.fulfill': ({ room, role }, { id }) => {
    needAdmin(role);
    const o = room.orders.find((x) => x.id === id);
    if (!o) throw new Error('没有这张兑换单。');
    o.status = 'fulfilled';
    o.fulfilledAt = new Date().toISOString();
  },

  'order.reject': ({ room, role }, { id, note }) => {
    needAdmin(role);
    const o = room.orders.find((x) => x.id === id);
    if (!o) throw new Error('没有这张兑换单。');
    if (o.status !== 'pending') throw new Error('此单已处理。');
    o.status = 'rejected';
    o.note = String(note || '掌教不允');
    // 退还摩拉
    room.ledger.push({
      id: uid('ld'),
      at: new Date().toISOString(),
      mora: o.price,
      exp: 0,
      reason: `退回「${o.title}」`,
      refType: 'order',
      refId: o.rewardId,
    });
    const r = room.rewards.find((x) => x.id === o.rewardId);
    if (r) r.stock = Number(r.stock) + 1;
  },

  'reward.create': ({ room, role }, p) => {
    needAdmin(role);
    if (!p.title) throw new Error('奖励总得有个名字。');
    room.rewards.push({
      id: uid('rw'),
      title: String(p.title).trim(),
      desc: String(p.desc || '').trim(),
      price: Math.max(1, Number(p.price) || 50),
      stock: Math.max(0, Number(p.stock ?? 1)),
      active: true,
      discount: Number(p.discount) || 0,
      discountUntil: p.discountUntil || null,
      sort: Date.now(),
    });
  },

  'reward.update': ({ room, role }, { id, patch }) => {
    needAdmin(role);
    const r = room.rewards.find((x) => x.id === id);
    if (!r) throw new Error('没有这件奖励。');
    for (const k of ['title', 'desc', 'price', 'stock', 'active', 'discount', 'discountUntil']) {
      if (patch[k] !== undefined) r[k] = patch[k];
    }
    if (r.price !== undefined) r.price = Math.max(1, Number(r.price) || 1);
    if (r.stock !== undefined) r.stock = Math.max(0, Number(r.stock) || 0);
  },

  'reward.remove': ({ room, role }, { id }) => {
    needAdmin(role);
    room.rewards = room.rewards.filter((x) => x.id !== id);
  },

  'fine.create': ({ room, role }, p) => {
    needAdmin(role);
    room.fines.push({
      id: uid('fn'),
      source: 'manual',
      refId: null,
      title: String(p.title || '罚单').trim(),
      reason: String(p.reason || '').trim(),
      amount: Math.max(0, Number(p.amount) || 0),
      at: new Date().toISOString(),
      status: 'open',
    });
  },

  'fine.pay': ({ room, role }, { id }) => {
    needAdmin(role);
    const f = room.fines.find((x) => x.id === id);
    if (!f) throw new Error('没有这张罚单。');
    f.status = 'paid';
    f.paidAt = new Date().toISOString();
  },

  'fine.waive': ({ room, role }, { id, note }) => {
    needAdmin(role);
    const f = room.fines.find((x) => x.id === id);
    if (!f) throw new Error('没有这张罚单。');
    f.status = 'waived';
    f.note = String(note || '掌教开恩').trim();
    f.paidAt = new Date().toISOString();
  },

  'doc.create': ({ room, role }, p) => {
    needAdmin(role);
    if (!p.title || !String(p.title).trim()) throw new Error('公文须有标题。');
    room.docs.push({
      id: uid('dc'),
      title: String(p.title).trim(),
      body: String(p.body || '').trim(),
      author: room.adminName,
      mustRead: p.mustRead !== false,
      at: new Date().toISOString(),
      ackAt: null,
      revoked: false,
    });
  },

  'doc.ack': ({ room, role }, { id }) => {
    const d = room.docs.find((x) => x.id === id);
    if (!d) throw new Error('没有这份公文。');
    if (role !== 'player') return;
    d.ackAt = new Date().toISOString();
  },

  'doc.revoke': ({ room, role }, { id }) => {
    needAdmin(role);
    const d = room.docs.find((x) => x.id === id);
    if (!d) return;
    d.revoked = true;
  },

  'settings.update': ({ room, role }, { patch }) => {
    needAdmin(role);
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (patch[k] !== undefined) room.settings[k] = patch[k];
    }
  },

  'room.rename': ({ room, role }, { playerName, adminName, name }) => {
    needAdmin(role);
    if (name) room.name = String(name).trim();
    if (playerName) room.playerName = String(playerName).trim();
    if (adminName) room.adminName = String(adminName).trim();
  },
};

export { pick, settle };
