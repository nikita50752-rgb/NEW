const app = document.getElementById('app');
let me = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/me' && !path.startsWith('/api/login') && !path.startsWith('/api/register')) {
    location.hash = '#/login';
    throw new Error('Нужно войти');
  }
  if (!res.ok) throw new Error(data.error || 'Ошибка ' + res.status);
  return data;
}

const fmt = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const fmtDate = (d) => d;

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function shell(content, active) {
  app.innerHTML = `
  <header class="top">
    <h1>МойНалог</h1>
    <nav>
      <a href="#/" class="${active === 'dash' ? 'active' : ''}">Дашборд</a>
      <a href="#/incomes" class="${active === 'incomes' ? 'active' : ''}">Доходы</a>
      <a href="#/expenses" class="${active === 'expenses' ? 'active' : ''}">Расходы</a>
      <a href="#/settings" class="${active === 'settings' ? 'active' : ''}">Настройки</a>
      <a href="#" id="logout">Выйти</a>
    </nav>
  </header>
  ${content}`;
  document.getElementById('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/logout', { method: 'POST', body: '{}' });
    me = null;
    location.hash = '#/login';
    route();
  });
}

function authView(mode) {
  app.innerHTML = `
  <div class="auth card">
    <h1>МойНалог</h1>
    <p class="muted">Учёт доходов и налогов для ИП и самозанятых</p>
    <form id="auth-form">
      <div><label>Email</label><input id="email" type="email" required autocomplete="username" /></div>
      <div><label>Пароль (мин. 6 символов)</label><input id="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" /></div>
      <button type="submit">${mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
      <div class="error" id="err"></div>
    </form>
    <div class="switch">${mode === 'login' ? 'Нет аккаунта? <a href="#/register">Регистрация</a>' : 'Уже есть аккаунт? <a href="#/login">Войти</a>'}</div>
  </div>`;
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('err');
    errEl.textContent = '';
    try {
      me = await api(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value }),
      });
      location.hash = '#/';
      route();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

async function dashboardView() {
  const year = new Date().getFullYear();
  const [s, entries] = await Promise.all([api(`/api/summary?year=${year}`), api('/api/entries')]);
  const recent = entries.slice(0, 8);
  const maxIncome = Math.max(1, ...s.months.map((m) => m.income));
  shell(`
    <div class="cards">
      <div class="card"><div class="label">Доход за ${year}</div><div class="value">${fmt(s.yearIncome)}</div></div>
      <div class="card"><div class="label">Налог за ${year} (оценка)</div><div class="value">${fmt(s.yearTax)}</div><div class="muted">${esc(s.months[0]?.taxLabel ?? '')}</div></div>
      <div class="card"><div class="label">Расходы за ${year}</div><div class="value">${fmt(s.yearExpenses)}</div></div>
      ${s.npdLimitLeft !== null ? `<div class="card"><div class="label">Осталось до лимита НПД 2,4 млн</div><div class="value ${s.npdLimitLeft < 240000 ? 'warn' : 'ok'}">${fmt(s.npdLimitLeft)}</div></div>` : ''}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Доходы по месяцам ${year}</h3>
      ${s.months.length === 0 ? '<p class="muted">Пока нет записей — добавьте первый доход.</p>' : s.months.map((m) => `
        <div class="bar-row"><div class="m">${m.month}</div><div class="bar" style="width:${Math.round((m.income / maxIncome) * 100)}%"></div><div class="v">${fmt(m.income)} · налог ${fmt(m.tax)}</div></div>`).join('')}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Ближайшие сроки уплаты</h3>
      ${s.nextDeadlines.length === 0 ? '<p class="muted">Нет pending-платежей по введённым данным.</p>' : `<ul class="deadlines">${s.nextDeadlines.map((d) => `<li>${fmtDate(d.date)} — ${esc(d.label)}</li>`).join('')}</ul>`}
      <p class="muted">Сроки указаны по общим правилам; сверяйте в личном кабинете ФНС.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Последние операции</h3>
      ${recent.length === 0 ? '<p class="muted">Пусто.</p>' : `<table><tr><th>Дата</th><th>Тип</th><th>Категория</th><th>Сумма</th></tr>${recent.map((e) => `<tr><td>${e.date}</td><td>${e.type === 'income' ? 'доход' : 'расход'}</td><td>${esc(e.category)}</td><td>${fmt(e.amount)}</td></tr>`).join('')}</table>`}
    </div>
  `, 'dash');
}

function entriesView(type) {
  const isIncome = type === 'income';
  shell(`
    <div class="card">
      <h3 style="margin-top:0">${isIncome ? 'Добавить доход' : 'Добавить расход'}</h3>
      <form class="inline" id="entry-form">
        <div><label>Дата</label><input type="date" id="f-date" required value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Сумма, ₽</label><input type="number" id="f-amount" step="0.01" min="0.01" required /></div>
        <div><label>Категория</label><input id="f-category" required placeholder="${isIncome ? 'услуги, товары...' : 'аренда, материалы...'}" /></div>
        ${isIncome ? `<div><label>Кто платил</label><select id="f-payer"><option value="person">Физлицо (4%)</option><option value="company">Компания/ИП (6%)</option></select></div>` : ''}
        ${isIncome ? `<div><label>Чек НПД №</label><input id="f-receipt" placeholder="необязательно" /></div>` : ''}
        <div><label>Способ оплаты</label><select id="f-method"><option value="card">Карта</option><option value="cash">Наличные</option><option value="transfer">Перевод</option></select></div>
        <div><label>Примечание</label><input id="f-note" /></div>
        <div><button type="submit">Добавить</button></div>
      </form>
      <div class="error" id="err"></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">${isIncome ? 'Доходы' : 'Расходы'} <a class="btn ghost" style="float:right;font-size:12px" href="/api/export.csv?type=${type}&year=${new Date().getFullYear()}">Экспорт CSV</a></h3>
      <div id="list"><p class="muted">Загрузка...</p></div>
    </div>
  `, isIncome ? 'incomes' : 'expenses');

  document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('err');
    errEl.textContent = '';
    const body = {
      type,
      date: document.getElementById('f-date').value,
      amount: Number(document.getElementById('f-amount').value),
      category: document.getElementById('f-category').value.trim(),
      method: document.getElementById('f-method').value,
      note: document.getElementById('f-note').value.trim(),
    };
    if (isIncome) {
      body.payerType = document.getElementById('f-payer').value;
      body.receipt = document.getElementById('f-receipt').value.trim();
    }
    try {
      await api('/api/entries', { method: 'POST', body: JSON.stringify(body) });
      entriesView(type);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  api(`/api/entries?type=${type}`).then((list) => {
    document.getElementById('list').innerHTML = list.length === 0
      ? '<p class="muted">Пока пусто.</p>'
      : `<table><tr><th>Дата</th><th>Категория</th>${isIncome ? '<th>Плательщик</th><th>Чек</th>' : ''}<th>Сумма</th><th></th></tr>${list.map((e) => `
        <tr>
          <td>${e.date}</td><td>${esc(e.category)}${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}</td>
          ${isIncome ? `<td>${e.payerType === 'company' ? 'компания 6%' : 'физлицо 4%'}</td><td>${esc(e.receipt ?? '')}</td>` : ''}
          <td>${fmt(e.amount)}</td>
          <td><button class="del" data-id="${e.id}">✕</button></td>
        </tr>`).join('')}</table>`;
    document.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
      await api('/api/entries/' + b.dataset.id, { method: 'DELETE' });
      entriesView(type);
    }));
  }).catch((err) => { document.getElementById('list').innerHTML = `<p class="error">${esc(err.message)}</p>`; });
}

function settingsView() {
  const p = me.profile;
  shell(`
    <div class="card">
      <h3 style="margin-top:0">Профиль и режим налогообложения</h3>
      <p class="muted">Аккаунт: ${esc(me.email)}</p>
      <form class="inline" id="profile-form">
        <div><label>Статус</label>
          <select id="p-status">
            <option value="self" ${p.status === 'self' ? 'selected' : ''}>Самозанятый (НПД)</option>
            <option value="ip" ${p.status === 'ip' ? 'selected' : ''}>ИП</option>
          </select>
        </div>
        <div><label>Режим налогообложения</label>
          <select id="p-regime">
            <option value="npd" ${p.regime === 'npd' ? 'selected' : ''}>НПД (самозанятость): 4% физлица / 6% компании</option>
            <option value="usn6" ${p.regime === 'usn6' ? 'selected' : ''}>УСН 6% «доходы»</option>
            <option value="usn15" ${p.regime === 'usn15' ? 'selected' : ''}>УСН 15% «доходы минус расходы»</option>
          </select>
        </div>
        <div><label>Фиксированные взносы ИП за год, ₽ (для УСН 6%)</label>
          <input type="number" id="p-fixed" min="0" step="1" value="${p.fixedContributions}" />
        </div>
        <div><button type="submit">Сохранить</button></div>
      </form>
      <div class="error" id="err"></div>
      <p class="muted">НПД: лимит 2,4 млн ₽/год, единовременный вычет 10 000 ₽, налог за месяц — до 28-го числа следующего месяца.
      УСН: авансы до 28.04 / 28.07 / 28.10, годовой налог ИП — до 28.04 след. года. Взносы ИП уменьшают УСН 6% (без работников — до 100%).</p>
    </div>
  `, 'settings');
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('err');
    errEl.textContent = '';
    try {
      me = await api('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          status: document.getElementById('p-status').value,
          regime: document.getElementById('p-regime').value,
          fixedContributions: Number(document.getElementById('p-fixed').value),
        }),
      }).then((d) => ({ email: me.email, profile: d.profile }));
      location.hash = '#/';
      route();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

async function route() {
  const hash = location.hash || '#/';
  if (hash === '#/login' || hash === '#/register') {
    authView(hash === '#/login' ? 'login' : 'register');
    return;
  }
  if (!me) {
    try {
      me = await api('/api/me');
    } catch {
      location.hash = '#/login';
      route();
      return;
    }
  }
  if (hash === '#/incomes') entriesView('income');
  else if (hash === '#/expenses') entriesView('expense');
  else if (hash === '#/settings') settingsView();
  else dashboardView();
}

window.addEventListener('hashchange', route);
route();
