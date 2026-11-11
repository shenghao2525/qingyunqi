/* 各类表单弹窗（纯字符串，交给 app.js 挂到 modalRoot） */

import { escapeHtml, WEEK_CN, pad2 } from './util.js';

function localInputValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function head(title, sub = '') {
  return `<div class="sheet-head">
    <h2>${escapeHtml(title)}</h2>
    ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
  </div>`;
}

export function taskForm(settings, now = new Date()) {
  const due = new Date(now.getTime() + 3 * 3600000);
  return `
  <form data-f="task.create" class="form">
    ${head('立一个字', '写下要做的事，给它一个期限')}
    <label class="field">
      <span>任务</span>
      <input name="title" required maxlength="40" placeholder="例如：把阳台的衣服收了" />
    </label>
    <label class="field">
      <span>期限</span>
      <input type="datetime-local" name="dueAt" value="${localInputValue(due)}" required />
    </label>
    <label class="field">
      <span>备注（可空）</span>
      <input name="note" maxlength="60" placeholder="补充说明" />
    </label>
    <div class="row2">
      <label class="field">
        <span>赏摩拉</span>
        <input type="number" name="mora" min="0" value="${settings.moraPerTask}" />
      </label>
      <label class="field">
        <span>赏经验</span>
        <input type="number" name="exp" min="0" value="${settings.expPerTask}" />
      </label>
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-close>作罢</button>
      <button type="submit" class="btn btn-primary">立 下</button>
    </div>
  </form>`;
}

export function checkinForm(settings, isAdmin) {
  return `
  <form data-f="checkin.create" class="form">
    ${head(isAdmin ? '增一门功课' : '提请一门功课', isAdmin ? '定下日子与时辰，到点须应卯' : '掌教允准后才会生效')}
    <label class="field">
      <span>功课名</span>
      <input name="title" required maxlength="30" placeholder="例如：卯时起身" />
    </label>
    <label class="field">
      <span>说明（可空）</span>
      <input name="note" maxlength="40" placeholder="例如：日出而作" />
    </label>
    <div class="field">
      <span>哪几日</span>
      <div class="chips">
        ${WEEK_CN.map((w, i) => `<label class="chip"><input type="checkbox" name="weekdays" value="${i + 1}" ${isAdmin ? 'checked' : ''}/><span>${w}</span></label>`).join('')}
      </div>
    </div>
    <div class="row2">
      <label class="field">
        <span>时辰</span>
        <input type="time" name="time" value="07:30" required />
      </label>
      <label class="field">
        <span>赏摩拉</span>
        <input type="number" name="mora" min="0" value="${settings.moraPerCheckin}" />
      </label>
    </div>
    <label class="field">
      <span>赏经验</span>
      <input type="number" name="exp" min="0" value="${settings.expPerCheckin}" />
    </label>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-close>作罢</button>
      <button type="submit" class="btn btn-primary">${isAdmin ? '定 下' : '提 请'}</button>
    </div>
  </form>`;
}

export function docForm() {
  return `
  <form data-f="doc.create" class="form">
    ${head('拟一道公文', '发到弟子案上，须亲阅')}
    <label class="field">
      <span>标题</span>
      <input name="title" required maxlength="40" placeholder="例如：关于本周末安排的通告" />
    </label>
    <label class="field">
      <span>正文</span>
      <textarea name="body" rows="7" maxlength="1200" placeholder="正文……"></textarea>
    </label>
    <label class="check-line">
      <input type="checkbox" name="mustRead" checked />
      <span>须回执（弟子阅后才算送达）</span>
    </label>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-close>作罢</button>
      <button type="submit" class="btn btn-primary">颁 下</button>
    </div>
  </form>`;
}

export function fineForm(settings) {
  return `
  <form data-f="fine.create" class="form">
    ${head('开一张罚单', '以人民币计，弟子须缴清')}
    <label class="field">
      <span>名目</span>
      <input name="title" required maxlength="20" value="办事不力" />
    </label>
    <label class="field">
      <span>事由</span>
      <textarea name="reason" rows="3" maxlength="120" placeholder="写明缘由，弟子案上会看到"></textarea>
    </label>
    <label class="field">
      <span>金额（元）</span>
      <input type="number" name="amount" min="0" step="1" value="${settings.fineCheckinMiss}" required />
    </label>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-close>作罢</button>
      <button type="submit" class="btn btn-danger">开 单</button>
    </div>
  </form>`;
}

export function rewardForm() {
  return `
  <form data-f="reward.create" class="form">
    ${head('上架一件奖励', '弟子可用摩拉兑换')}
    <label class="field">
      <span>名称</span>
      <input name="title" required maxlength="30" placeholder="例如：奶茶一杯" />
    </label>
    <label class="field">
      <span>说明（可空）</span>
      <input name="desc" maxlength="50" placeholder="例如：指定品牌，任意口味" />
    </label>
    <div class="row2">
      <label class="field">
        <span>价格（摩拉）</span>
        <input type="number" name="price" min="1" value="100" required />
      </label>
      <label class="field">
        <span>库存</span>
        <input type="number" name="stock" min="0" value="1" required />
      </label>
    </div>
    <label class="field">
      <span>单品折扣（0 为不打折，0.2 即八折）</span>
      <input type="number" name="discount" min="0" max="0.9" step="0.05" value="0" />
    </label>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-close>作罢</button>
      <button type="submit" class="btn btn-primary">上 架</button>
    </div>
  </form>`;
}
