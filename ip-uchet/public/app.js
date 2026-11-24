const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
let me = null;
let toastTimer = null;

function toast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = ''; }, 2600);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !['/api/me', '/api/login', '/api/register'].includes(path)) {
    me = null;
    location.hash = '#/login';
    throw new Error('Нужно войти');
  }
  if (!res.ok) throw new Error(data.error || 'Ошибка ' + res.status);
  return data;
}

const fmt = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function landingView() {
  app.innerHTML = `
  <div class="hero container">
    <h1>Налоги считаются сами.<br/>Вам остаётся только вносить доходы.</h1>
    <p>МойНалог — учёт доходов и автоматический расчёт налогов для самозанятых (НПД 4%/6%) и ИП (УСН 6% / 15%). Сроки уплаты, лимит 2,4 млн ₽ и CSV-экспорт — под контролем.</p>
    <div class="cta">
      <a class="btn" href="#/register">Начать бесплатно</a>
      <a class="btn ghost" href="#/login">Войти</a>
    </div>
  </div>
  <div class="section container">
    <h2>Всё, что нужно малому бизнесу</h2>
    <p class="sub">Без бухгалтера и таблиц</p>
    <div class="features">
      <div class="feature"><div class="ico">🧾</div><h3>НПД 4% / 6% автоматически</h3><p>Разделяет доходы от физлиц и компаний, применяет вычет 10 000 ₽ и следит за лимитом 2,4 млн ₽ в год.</p></div>
      <div class="feature"><div class="ico">📊</div><h3>УСН 6% и 15%</h3><p>Налог «доходы» с вычетом страховых взносов ИП или «доходы минус расходы» — переключается в настройках.</p></div>
      <div class="feature"><div class="ico">⏰</div><h3>Сроки уплаты</h3><p>НПД — до 28-го числа следующего месяца, авансы УСН — 28.04 / 28.07 / 28.10. Дашборд показывает ближайшие дедлайны.</p></div>
      <div class="feature"><div class="ico">📤</div><h3>Экспорт для бухгалтера</h3><p>Выгрузка доходов и расходов за год в CSV одним кликом.</p></div>
      <div class="feature"><div class="ico">🔒</div><h3>Приватность</h3><p>Данные хранятся на вашем сервере в зашифрованном виде сессии; каждый аккаунт видит только свои записи.</p></div>
      <div class="feature"><div class="ico">📱</div><h3>Работает везде</h3><p>Веб-приложение: открывается в браузере и устанавливается как приложение (PWA).</p></div>
    </div>
  </div>
  <div class="section container">
    <h2>Тарифы</h2>
    <p class="sub">Начните бесплатно, переходите на Pro при росте</p>
    <div class="pricing">
      <div class="price-card">
        <div class="plan">Старт</div>
        <div class="amount">0 ₽ <span>/ всегда</span></div>
        <ul><li>До 50 записей в месяц</li><li>Один режим налогообложения</li><li>Дашборд и сроки уплаты</li><li>CSV-экспорт</li></ul>
        <a class="btn ghost" href="#/register">Выбрать</a>
      </div>
      <div class="price-card hot">
        <div class="plan">Pro</div>
        <div class="amount">290 ₽ <span>/ мес</span></div>
        <ul><li>Безлимит записей</li><li>Все режимы (НПД, УСН 6%, УСН 15%)</li><li>История за все годы</li><li>Приоритетная поддержка</li></ul>
        <a class="btn" href="#/register">Попробовать 14 дней</a>
      </div>
      <div class="price-card">
        <div class="plan">Бизнес</div>
        <div class="amount">990 ₽ <span>/ мес</span></div>
        <ul><li>До 5 профилей (несколько ИП)</li><li>Общий доступ для бухгалтера</li><li>Экспорт в 1С</li></ul>
        <a class="btn ghost" href="#/register">Написать нам</a>
      </div>
    </div>
  </div>
  <div class="footer container">
    <span>МойНалог, 2026</span>
    <span>Расчёт налогов — оценочный, сверяйтесь с nalog.gov.ru</span>
  </div>`;
}

function authView(mode) {
  app.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="logo">Мой<span>Налог</span></div>
      <p class="muted">${mode === 'login' ? 'С возвращением!' : 'Создайте аккаунт за минуту'}</p>
      <form id="auth-form">
        <div><label>Email</label><input id="email" type="email" required autocomplete="username" /></div>
        <div><label>Пароль (мин. 6 символов)</label><input id="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" /></div>
        <button type="submit">${mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        <div class="error" id="err"></div>
      </form>
      <p class="muted" style="margin:14px 0 0">${mode === 'login' ? 'Нет аккаунта? <a href="#/register">Регистрация</a>' : 'Уже есть аккаунт? <a href="#/login">Войти</a>'} · <a href="#/">На главную</a></p>
    </div>
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
      toast(mode === 'login' ? 'Вошли!' : 'Аккаунт создан!');
      location.hash = '#/app';
      route();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

function shell(content, active) {
  app.innerHTML = `
  <div class="topnav"><div class="container">
    <a class="logo" href="#/app">Мой<span>Налог</span></a>
    <nav>
      <a href="#/app" class="${active === 'dash' ? 'active' : ''}">Дашборд</a>
      <a href="#/incomes" class="${active === 'incomes' ? 'active' : ''}">Доходы</a>
      <a href="#/expenses" class="${active === 'expenses' ? 'active' : ''}">Расходы</a>
      <a href="#/settings" class="${active === 'settings' ? 'active' : ''}">Настройки</a>
    </nav>
    <div class="user"><span>${esc(me?.email ?? '')}</span><button class="btn ghost small" id="logout">Выйти</button></div>
  </div></div>
  <div class="page">${content}</div>`;
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: '{}' });
    me = null;
    location.hash = '#/';
    route();
  });
}

async function dashboardView() {
  const year = new Date().getFullYear();
  const [s, entries] = await Promise.all([api(`/api/summary?year=${year}`), api('/api/entries')]);
  const recent = entries.slice(0, 8);
  shell(`
    <h2>Дашборд ${year}</h2>
    <div class="cards">
      <div class="card stat"><div class="label">Доход за ${year}</div><div class="value ok">${fmt(s.yearIncome)}</div></div>
      <div class="card stat"><div class="label">Налог за ${year} (оценка)</div><div class="value warn">${fmt(s.yearTax)}</div><div class="hint">${esc(s.months.find(m => m.income > 0)?.taxLabel ?? '')}</div></div>
      <div class="card stat"><div class="label">Расходы за ${year}</div><div class="value">${fmt(s.yearExpenses)}</div></div>
      ${s.npdLimitLeft !== null && s.npdLimitLeft !== undefined ? `<div class="card stat"><div class="label">Лимит НПД осталось</div><div class="value ${s.npdLimitLeft < 240000 ? 'danger' : 'ok'}">${fmt(s.npdLimitLeft)}</div><div class="hint">из 2 400 000 ₽ / год</div></div>` : ''}
    </div>
    <div class="panel"><h3>Ближайшие сроки уплаты</h3>
      ${s.nextDeadlines.length === 0 ? '<p class="muted">Нет неоплаченных периодов по введённым данным.</p>' : `<table><tr><th>Дата</th><th>Платёж</th></tr>${s.nextDeadlines.map((d) => `<tr><td>${d.date}</td><td>${esc(d.label)}</td></tr>`).join('')}</table>`}
      <p class="muted" style="margin-bottom:0">Сверяйте сроки в личном кабинете ФНС.</p>
    </div>
    <div class="panel"><h3>Последние операции</h3>
      ${recent.length === 0 ? '<p class="muted">Пока пусто — добавьте первый доход.</p>' : `<table><tr><th>Дата</th><th>Тип</th><th>Категория</th><th>Сумма</th></tr>${recent.map((e) => `<tr><td>${e.date}</td><td><span class="tag ${e.type}">${e.type === 'income' ? 'доход' : 'расход'}</span></td><td>${esc(e.category)}</td><td>${fmt(e.amount)}</td></tr>`).join('')}</table>`}
    </div>
  `, 'dash');
}

function entriesView(type) {
  const isIncome = type === 'income';
  shell(`
    <h2>${isIncome ? 'Доходы' : 'Расходы'}</h2>
    <div class="panel">
      <h3>Новая запись</h3>
      <form class="form-grid" id="entry-form">
        <div><label>Дата</label><input type="date" id="f-date" required value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Сумма, ₽</label><input type="number" id="f-amount" step="0.01" min="0.01" required placeholder="0.00" /></div>
        <div><label>Категория</label><input id="f-category" required maxlength="100" placeholder="${isIncome ? 'услуги, товары…' : 'аренда, материалы…'}" /></div>
        ${isIncome ? `<div><label>Кто платил</label><select id="f-payer"><option value="person">Физлицо — 4%</option><option value="company">Компания/ИП — 6%</option></select></div>` : ''}
        ${isIncome ? `<div><label>Чек НПД №</label><input id="f-receipt" maxlength="100" placeholder="необязательно" /></div>` : ''}
        <div><label>Способ оплаты</label><select id="f-method"><option value="card">Карта</option><option value="cash">Наличные</option><option value="transfer">Перевод</option></select></div>
        <div><label>Примечание</label><input id="f-note" maxlength="500" /></div>
        <div><button type="submit">Добавить</button></div>
      </form>
      <div class="error" id="err"></div>
    </div>
    <div class="panel">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">Список</h3>
        <a class="btn ghost small" href="/api/export.csv?type=${type}&year=${new Date().getFullYear()}">Экспорт CSV</a>
      </div>
      <div id="list" style="margin-top:10px"><p class="muted">Загрузка…</p></div>
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
      toast('Запись добавлена');
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
          <td>${e.date}</td>
          <td>${esc(e.category)}${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}</td>
          ${isIncome ? `<td>${e.payerType === 'company' ? 'компания 6%' : 'физлицо 4%'}</td><td>${esc(e.receipt ?? '')}</td>` : ''}
          <td>${fmt(e.amount)}</td>
          <td><button class="icon-btn del" data-id="${e.id}" title="Удалить">✕</button></td>
        </tr>`).join('')}</table>`;
    document.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить запись?')) return;
      await api('/api/entries/' + b.dataset.id, { method: 'DELETE' });
      toast('Удалено');
      entriesView(type);
    }));
  }).catch((err) => { document.getElementById('list').innerHTML = `<p class="error">${esc(err.message)}</p>`; });
}

function settingsView() {
  const p = me.profile;
  shell(`
    <h2>Настройки</h2>
    <div class="panel">
      <h3>Профиль и режим налогообложения</h3>
      <p class="muted">Аккаунт: ${esc(me.email)}</p>
      <form class="form-grid" id="profile-form">
        <div><label>Статус</label>
          <select id="p-status">
            <option value="self" ${p.status === 'self' ? 'selected' : ''}>Самозанятый (НПД)</option>
            <option value="ip" ${p.status === 'ip' ? 'selected' : ''}>ИП</option>
          </select>
        </div>
        <div><label>Режим</label>
          <select id="p-regime">
            <option value="npd" ${p.regime === 'npd' ? 'selected' : ''}>НПД: 4% физлица / 6% компании</option>
            <option value="usn6" ${p.regime === 'usn6' ? 'selected' : ''}>УСН 6% «доходы»</option>
            <option value="usn15" ${p.regime === 'usn15' ? 'selected' : ''}>УСН 15% «доходы − расходы»</option>
          </select>
        </div>
        <div><label>Фиксированные взносы ИП за год, ₽ (для УСН 6%)</label>
          <input type="number" id="p-fixed" min="0" step="1" value="${p.fixedContributions}" />
        </div>
        <div><button type="submit">Сохранить</button></div>
      </form>
      <div class="error" id="err"></div>
      <p class="muted" style="margin-bottom:0">НПД: лимит 2,4 млн ₽/год, вычет 10 000 ₽, срок — до 28-го след. месяца. УСН: авансы до 28.04/28.07/28.10, год ИП — до 28.04 след. года.</p>
    </div>
  `, 'settings');
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('err');
    errEl.textContent = '';
    try {
      const d = await api('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          status: document.getElementById('p-status').value,
          regime: document.getElementById('p-regime').value,
          fixedContributions: Number(document.getElementById('p-fixed').value),
        }),
      });
      me.profile = d.profile;
      toast('Сохранено');
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
      me = null;
    }
  }
  if (!me) {
    landingView();
    return;
  }
  if (hash === '#/incomes') entriesView('income');
  else if (hash === '#/expenses') entriesView('expense');
  else if (hash === '#/settings') settingsView();
  else dashboardView();
}

window.addEventListener('hashchange', route);
route();
