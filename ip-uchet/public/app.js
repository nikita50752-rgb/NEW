const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
let me = null;
let toastTimer = null;
let editingId = null;

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
      <a href="#/calendar" class="${active === 'calendar' ? 'active' : ''}">Календарь</a>
      <a href="#/clients" class="${active === 'clients' ? 'active' : ''}">Контрагенты</a>
      <a href="#/settings" class="${active === 'settings' ? 'active' : ''}">Настройки</a>
    </nav>
    <div class="user">
      <button class="icon-btn" id="theme-toggle" title="Тема">${document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️'}</button>
      <span>${esc(me?.email ?? '')}</span><button class="btn ghost small" id="logout">Выйти</button>
    </div>
  </div></div>
  <div class="page">${content}</div>`;
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: '{}' });
    me = null;
    location.hash = '#/';
    route();
  });
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = cur;
    localStorage.setItem('theme', cur);
    route();
  });
}

function initTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = t;
}

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000);
}

function deadlineBadge(dateStr) {
  const d = daysUntil(dateStr);
  if (d < 0) return `<span class="badge danger">просрочено ${-d} дн.</span>`;
  if (d === 0) return '<span class="badge danger">сегодня!</span>';
  if (d <= 7) return `<span class="badge warn">через ${d} дн.</span>`;
  return `<span class="badge info">через ${d} дн.</span>`;
}

function chartSvg(months) {
  const W = 720, H = 220, base = 190, top = 24;
  const max = Math.max(1, ...months.map((m) => m.income), ...months.map((m) => m.tax));
  const groupW = (W - 40) / 12;
  const barW = Math.min(20, groupW / 2 - 4);
  const bars = months.map((m, i) => {
    const x = 30 + i * groupW;
    const ih = Math.round((m.income / max) * (base - top));
    const th = Math.round((m.tax / max) * (base - top));
    const label = m.month.slice(5);
    return `
      <rect class="bar-income" x="${x}" y="${base - ih}" width="${barW}" height="${ih}" rx="3"><title>${m.month}: доход ${fmt(m.income)}</title></rect>
      <rect class="bar-tax" x="${x + barW + 3}" y="${base - th}" width="${barW}" height="${th}" rx="3"><title>${m.month}: налог ${fmt(m.tax)}</title></rect>
      <text x="${x + barW}" y="${H - 8}" text-anchor="middle">${label}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="24" y1="${base}" x2="${W - 8}" y2="${base}" stroke="#232c3f" stroke-width="1"/>
    ${bars}
    <text x="30" y="14">доход</text>
    <rect class="bar-income" x="70" y="6" width="10" height="10" rx="2"/>
    <text x="86" y="14">налог</text>
    <rect class="bar-tax" x="126" y="6" width="10" height="10" rx="2"/>
  </svg>`;
}

async function dashboardView() {
  const year = new Date().getFullYear();
  const [s, entries] = await Promise.all([api(`/api/summary?year=${year}`), api('/api/entries')]);
  const recent = entries.slice(0, 10);
  shell(`
    <h2>Дашборд ${year}</h2>
    <div class="cards">
      <div class="card stat"><div class="label">Доход за ${year}</div><div class="value ok">${fmt(s.yearIncome)}</div><div class="hint">${s.months.filter(m => m.income > 0).length} мес. с поступлениями</div></div>
      <div class="card stat"><div class="label">Налог за ${year} (оценка)</div><div class="value warn">${fmt(s.yearTax)}</div><div class="hint">${esc(s.months.find(m => m.income > 0)?.taxLabel ?? '')}</div></div>
      <div class="card stat"><div class="label">Расходы за ${year}</div><div class="value">${fmt(s.yearExpenses)}</div></div>
      ${s.npdLimitLeft !== null && s.npdLimitLeft !== undefined ? `<div class="card stat"><div class="label">Лимит НПД осталось</div><div class="value ${s.npdLimitLeft < 240000 ? 'danger' : 'ok'}">${fmt(s.npdLimitLeft)}</div><div class="hint">из 2 400 000 ₽ / год</div></div>` : ''}
    </div>
    <div class="panel"><h3>Доходы и налог по месяцам</h3>
      ${s.months.some(m => m.income > 0 || m.tax > 0) ? chartSvg(s.months) : '<p class="muted">Добавьте доходы — здесь появится график.</p>'}
    </div>
    <div class="panel"><h3>Структура по категориям за ${year}</h3>
      ${s.categories.length === 0 ? '<p class="muted">Пока нет данных.</p>' : donutSvg(s.categories)}
      <p class="muted" style="margin-bottom:0">При вашем доходе за год выгоднее режим: <b>${{ npd: 'НПД', usn6: 'УСН 6%', usn15: 'УСН 15%' }[s.comparison.best]}</b> (налог ${fmt(s.comparison[s.comparison.best])}). Подробно — в разделе «Календарь».</p>
    </div>
    <div class="panel row" style="justify-content:space-between">
      <span class="muted">Нужен отчёт для бухгалтера?</span>
      <button class="btn ghost small" id="print-report">Печать / PDF</button>
    </div>
    <div class="panel"><h3>Ближайшие сроки уплаты</h3>
      ${s.nextDeadlines.length === 0 ? '<p class="muted">Нет неоплаченных периодов по введённым данным.</p>' : `<table><tr><th>Дата</th><th>Платёж</th><th>Статус</th></tr>${s.nextDeadlines.map((d) => `<tr><td>${d.date}</td><td>${esc(d.label)}</td><td>${deadlineBadge(d.date)}</td></tr>`).join('')}</table>`}
      <p class="muted" style="margin-bottom:0">Сверяйте сроки в личном кабинете ФНС.</p>
    </div>
    <div class="panel"><h3>Последние операции</h3>
      ${recent.length === 0 ? '<p class="muted">Пока пусто — добавьте первый доход.</p>' : `<table><tr><th>Дата</th><th>Тип</th><th>Категория</th><th>Сумма</th></tr>${recent.map((e) => `<tr><td>${e.date}</td><td><span class="tag ${e.type}">${e.type === 'income' ? 'доход' : 'расход'}</span></td><td>${esc(e.category)}</td><td>${fmt(e.amount)}</td></tr>`).join('')}</table>`}
    </div>
  `, 'dash');
  document.getElementById('print-report')?.addEventListener('click', () => window.print());
}

function entriesView(type) {
  const isIncome = type === 'income';
  const editing = editingId ? 'Редактирование записи' : 'Новая запись';
  shell(`
    <h2>${isIncome ? 'Доходы' : 'Расходы'}</h2>
    <div class="panel">
      <h3 id="form-title">${editing}</h3>
      <form class="form-grid" id="entry-form">
        <div><label>Дата</label><input type="date" id="f-date" required value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Сумма, ₽</label><input type="number" id="f-amount" step="0.01" min="0.01" required placeholder="0.00" /></div>
        <div><label>Категория</label><input id="f-category" required maxlength="100" placeholder="${isIncome ? 'услуги, товары…' : 'аренда, материалы…'}" /><div class="chips" id="chips"></div></div>
        ${isIncome ? `<div><label>Кто платил</label><select id="f-payer"><option value="person">Физлицо — 4%</option><option value="company">Компания/ИП — 6%</option></select></div>` : ''}
        ${isIncome ? `<div><label>Контрагент</label><select id="f-client"><option value="">— без контрагента —</option></select></div>` : ''}
        ${isIncome ? `<div><label>Чек НПД №</label><input id="f-receipt" maxlength="100" placeholder="необязательно" /></div>` : ''}
        <div><label>Способ оплаты</label><select id="f-method"><option value="card">Карта</option><option value="cash">Наличные</option><option value="transfer">Перевод</option></select></div>
        <div><label>Примечание</label><input id="f-note" maxlength="500" /></div>
        <div class="row"><button type="submit" id="submit-btn">${editingId ? 'Сохранить' : 'Добавить'}</button>${editingId ? '<button type="button" class="btn ghost" id="cancel-edit">Отмена</button>' : ''}</div>
      </form>
      <div class="error" id="err"></div>
    </div>
    <div class="panel">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">Список</h3>
        <div class="row">
          <input id="search" placeholder="Поиск по категории/примечанию…" style="width:220px" />
          <select id="month-filter" style="width:auto"><option value="">Все месяцы</option></select>
          <a class="btn ghost small" href="/api/export.csv?type=${type}&year=${new Date().getFullYear()}">Экспорт CSV</a>
          ${isIncome ? `<label class="btn ghost small" style="cursor:pointer">Импорт CSV банка<input type="file" id="import-file" accept=".csv,.txt" style="display:none" /></label>` : ''}
        </div>
      </div>
      <div id="list" style="margin-top:10px"><p class="muted">Загрузка…</p></div>
    </div>
  `, isIncome ? 'incomes' : 'expenses');

  let currentList = [];

  let clientNames = {};
  function renderList() {
    const mf = document.getElementById('month-filter').value;
    const q = (document.getElementById('search')?.value ?? '').toLowerCase();
    let list = currentList;
    if (mf) list = list.filter((e) => e.date.startsWith(mf));
    if (q) list = list.filter((e) => (e.category + ' ' + (e.note ?? '') + ' ' + (clientNames[e.clientId ?? ''] ?? '')).toLowerCase().includes(q));
    const el = document.getElementById('list');
    el.innerHTML = list.length === 0
      ? '<p class="muted">Пока пусто.</p>'
      : `<table><tr><th>Дата</th><th>Категория</th>${isIncome ? '<th>Контрагент</th><th>Плательщик</th><th>Чек</th>' : ''}<th>Сумма</th><th></th></tr>${list.map((e) => `
        <tr>
          <td>${e.date}</td>
          <td>${esc(e.category)}${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}</td>
          ${isIncome ? `<td>${esc(clientNames[e.clientId ?? ''] ?? '')}</td><td>${e.payerType === 'company' ? 'компания 6%' : 'физлицо 4%'}</td><td>${esc(e.receipt ?? '')}</td>` : ''}
          <td>${fmt(e.amount)}</td>
          <td class="row" style="gap:2px">
            <button class="icon-btn edit" data-id="${e.id}" title="Редактировать">✎</button>
            <button class="icon-btn del" data-id="${e.id}" title="Удалить">✕</button>
          </td>
        </tr>`).join('')}</table>`;
    el.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить запись?')) return;
      await api('/api/entries/' + b.dataset.id, { method: 'DELETE' });
      toast('Удалено');
      entriesView(type);
    }));
    el.querySelectorAll('.edit').forEach((b) => b.addEventListener('click', () => {
      const e = currentList.find((x) => x.id === b.dataset.id);
      if (!e) return;
      editingId = e.id;
      entriesView(type);
      document.getElementById('f-date').value = e.date;
      document.getElementById('f-amount').value = e.amount;
      document.getElementById('f-category').value = e.category;
      document.getElementById('f-method').value = e.method ?? 'card';
      document.getElementById('f-note').value = e.note ?? '';
      if (isIncome) {
        document.getElementById('f-payer').value = e.payerType ?? 'person';
        document.getElementById('f-receipt').value = e.receipt ?? '';
      }
      document.getElementById('f-amount').focus();
    }));
  }

  document.getElementById('month-filter').addEventListener('change', renderList);

  document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('err');
    errEl.textContent = '';
    const amount = Number(document.getElementById('f-amount').value);
    const date = document.getElementById('f-date').value;
    const category = document.getElementById('f-category').value.trim();
    if (!date) { errEl.textContent = 'Укажите дату'; return; }
    if (!Number.isFinite(amount) || amount <= 0) { errEl.textContent = 'Сумма должна быть больше 0'; return; }
    if (!category) { errEl.textContent = 'Укажите категорию'; return; }
    const body = { type, date, amount, category, method: document.getElementById('f-method').value, note: document.getElementById('f-note').value.trim() };
    if (isIncome) {
      body.payerType = document.getElementById('f-payer').value;
      body.receipt = document.getElementById('f-receipt').value.trim();
      const cid = document.getElementById('f-client').value;
      if (cid) body.clientId = cid;
    }
    try {
      if (editingId) {
        await api('/api/entries/' + editingId, { method: 'PUT', body: JSON.stringify(body) });
        toast('Сохранено');
      } else {
        await api('/api/entries', { method: 'POST', body: JSON.stringify(body) });
        toast('Запись добавлена');
      }
      editingId = null;
      entriesView(type);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  const cancelBtn = document.getElementById('cancel-edit');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { editingId = null; entriesView(type); });

  document.getElementById('search')?.addEventListener('input', renderList);

  const importFile = document.getElementById('import-file');
  if (importFile) importFile.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    const rows = parseBankCsv(text);
    if (rows.length === 0) { toast('Не удалось распознать CSV: нужны колонки с датой и суммой', 'err'); return; }
    if (!confirm(`Найдено ${rows.length} операций. Импортировать как доходы?`)) return;
    let ok = 0;
    for (const r of rows) {
      try {
        await api('/api/entries', { method: 'POST', body: JSON.stringify({ type: 'income', date: r.date, amount: r.amount, category: 'Импорт банка', note: r.desc, method: 'transfer', payerType: 'person' }) });
        ok++;
      } catch { /* пропускаем дубли/ошибки */ }
    }
    toast(`Импортировано: ${ok} из ${rows.length}`);
    entriesView(type);
  });

  function parseBankCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const head = lines[0].toLowerCase();
    const di = head.split(sep).findIndex((h) => h.includes('дат'));
    const ai = head.split(sep).findIndex((h) => h.includes('сумм'));
    const si = head.split(sep).findIndex((h) => h.includes('описан') || h.includes('назнач'));
    if (di < 0 || ai < 0) return [];
    const out = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(sep);
      const d = cols[di]?.trim().replace(/"/g, '');
      const m = d?.match(/(\d{2})[./](\d{2})[./](\d{4})/);
      const a = Number((cols[ai] ?? '').replace(/"/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
      if (!m || !Number.isFinite(a) || a <= 0) continue;
      out.push({ date: `${m[3]}-${m[2]}-${m[1]}`, amount: a, desc: (cols[si] ?? '').replace(/"/g, '').slice(0, 200) });
    }
    return out;
  }

  if (isIncome) {
    api('/api/clients').then((clients) => {
      clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));
      const sel = document.getElementById('f-client');
      for (const c of clients) {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = `${c.name} (${c.type === 'company' ? '6%' : '4%'})`;
        sel.appendChild(o);
      }
      renderList();
    }).catch(() => {});
  }

  api(`/api/entries?type=${type}`).then((list) => {
    currentList = list;
    const months = [...new Set(list.map((e) => e.date.slice(0, 7)))].sort().reverse();
    const mf = document.getElementById('month-filter');
    for (const m of months) {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      mf.appendChild(o);
    }
    const counts = {};
    for (const e of list) counts[e.category] = (counts[e.category] ?? 0) + 1;
    const chips = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const chipsEl = document.getElementById('chips');
    if (chipsEl && chips.length) {
      chipsEl.innerHTML = chips.map(([c]) => `<span class="chip" data-c="${esc(c)}">${esc(c)}</span>`).join('');
      chipsEl.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
        document.getElementById('f-category').value = c.dataset.c;
      }));
    }
    if (editingId) {
      const e = list.find((x) => x.id === editingId);
      if (e) {
        document.getElementById('f-date').value = e.date;
        document.getElementById('f-amount').value = e.amount;
        document.getElementById('f-category').value = e.category;
        document.getElementById('f-method').value = e.method ?? 'card';
        document.getElementById('f-note').value = e.note ?? '';
        if (isIncome) {
          document.getElementById('f-payer').value = e.payerType ?? 'person';
          document.getElementById('f-receipt').value = e.receipt ?? '';
          if (e.clientId) document.getElementById('f-client').value = e.clientId;
        }
      }
    }
    renderList();
  }).catch((err) => { document.getElementById('list').innerHTML = `<p class="error">${esc(err.message)}</p>`; });
}

function settingsView() {
  const p = me.profile;
  shell(`
    <h2>Настройки</h2>
    <div class="panel">
      <h3>Профиль</h3>
      <p class="muted">Аккаунт: ${esc(me.email)}</p>
      <form class="form-grid" id="profile-form">
        <div><label>Имя / название</label><input id="p-name" maxlength="100" value="${esc(me.name ?? '')}" placeholder="ИП Иванов" /></div>
        <div><label>ИНН (10 или 12 цифр)</label><input id="p-inn" inputmode="numeric" maxlength="12" value="${esc(me.inn ?? '')}" placeholder="необязательно" /></div>
        <div><label>Телефон</label><input id="p-phone" maxlength="30" value="${esc(me.phone ?? '')}" placeholder="+7…" /></div>
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
    <div class="panel">
      <h3>Безопасность</h3>
      <form class="form-grid" id="password-form" style="max-width:420px">
        <div><label>Текущий пароль</label><input type="password" id="pw-old" required autocomplete="current-password" /></div>
        <div><label>Новый пароль (мин. 6)</label><input type="password" id="pw-new" required minlength="6" autocomplete="new-password" /></div>
        <div><button type="submit">Сменить пароль</button></div>
      </form>
      <div class="error" id="pw-err"></div>
    </div>
    <div class="panel">
      <h3>Данные</h3>
      <div class="row">
        <a class="btn ghost" href="/api/export.json">Скачать все данные (JSON)</a>
      </div>
      <h3 style="margin-top:20px;color:var(--danger)">Опасная зона</h3>
      <p class="muted">Удаление аккаунта необратимо: все записи и профиль будут стёрты.</p>
      <button class="btn danger" id="delete-account">Удалить аккаунт</button>
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
          name: document.getElementById('p-name').value,
          inn: document.getElementById('p-inn').value,
          phone: document.getElementById('p-phone').value,
          status: document.getElementById('p-status').value,
          regime: document.getElementById('p-regime').value,
          fixedContributions: Number(document.getElementById('p-fixed').value),
        }),
      });
      me.profile = d.profile;
      me.name = d.name; me.inn = d.inn; me.phone = d.phone;
      toast('Сохранено');
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('pw-err');
    errEl.textContent = '';
    try {
      await api('/api/password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: document.getElementById('pw-old').value, newPassword: document.getElementById('pw-new').value }),
      });
      toast('Пароль изменён');
      document.getElementById('password-form').reset();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('delete-account').addEventListener('click', async () => {
    const word = prompt('Для удаления аккаунта введите слово УДАЛИТЬ:');
    if (word !== 'УДАЛИТЬ') { toast('Отменено', 'err'); return; }
    try {
      await api('/api/account', { method: 'DELETE' });
      me = null;
      toast('Аккаунт удалён');
      location.hash = '#/';
      route();
    } catch (err) {
      toast(err.message, 'err');
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
  else if (hash === '#/calendar') calendarView();
  else if (hash === '#/clients') clientsView();
  else if (hash === '#/settings') settingsView();
  else dashboardView();
}

function donutSvg(cats) {
  const data = cats.filter((c) => c.income + c.expense > 0).slice(0, 8);
  const total = data.reduce((s, c) => s + c.income + c.expense, 0) || 1;
  const colors = ['#6366f1', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#94a3b8'];
  const R = 60, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = data.map((c, i) => {
    const frac = (c.income + c.expense) / total;
    const el = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="22"
      stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-offset * C).toFixed(1)}"
      transform="rotate(-90 80 80)"><title>${esc(c.category)}: ${fmt(c.income + c.expense)}</title></circle>`;
    offset += frac;
    return el;
  }).join('');
  const legend = data.map((c, i) => `<div class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:${colors[i % colors.length]};display:inline-block"></span><span>${esc(c.category)}</span><span class="muted">${fmt(c.income + c.expense)}</span></div>`).join('');
  return `<div class="row" style="align-items:flex-start;gap:24px;flex-wrap:wrap">
    <svg viewBox="0 0 160 160" style="width:200px;height:200px;flex-shrink:0">${arcs}</svg>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:13px">${legend}</div>
  </div>`;
}

async function calendarView() {
  const year = new Date().getFullYear();
  const s = await api(`/api/summary?year=${year}`);
  const rows = [];
  if (s.regime === 'npd') {
    for (const m of s.months) {
      if (m.income <= 0) continue;
      const [y, mo] = m.month.split('-').map(Number);
      const dl = new Date(Date.UTC(y, mo, 0, 12)); // 28-е следующего месяца: последний день + ...
      const date = `${y + (mo === 12 ? 1 : 0)}-${mo === 12 ? '01' : String(mo + 1).padStart(2, '0')}-28`;
      rows.push({ date, label: `НПД за ${m.month}`, amount: m.tax });
    }
  } else {
    const quarters = [[0, 3], [3, 6], [6, 9], [9, 12]];
    const dl = [`${year}-04-28`, `${year}-07-28`, `${year}-10-28`, `${year + 1}-04-28`];
    quarters.forEach(([a, b], i) => {
      const tax = s.months.slice(a, b).reduce((sum, m) => sum + m.tax, 0);
      const income = s.months.slice(a, b).reduce((sum, m) => sum + m.income, 0);
      if (income > 0) rows.push({ date: dl[i], label: i === 3 ? `УСН за ${year} (год)` : `УСН аванс Q${i + 1}`, amount: Math.round(tax * 100) / 100 });
    });
  }
  const cmp = s.comparison;
  const cmpRow = (key, label) => `<tr><td>${label}</td><td>${fmt(cmp[key])}</td><td>${cmp.best === key ? '<span class="badge ok">выгоднее</span>' : ''}</td></tr>`;
  shell(`
    <h2>Налоговый календарь ${year}</h2>
    <div class="panel">
      <h3>Все платежи по году</h3>
      ${rows.length === 0 ? '<p class="muted">Нет доходов за год — календарь пуст.</p>' : `<table><tr><th>Срок</th><th>Платёж</th><th>Сумма</th><th>Статус</th></tr>${rows.map((r) => `<tr><td>${r.date}</td><td>${esc(r.label)}</td><td>${fmt(r.amount)}</td><td>${deadlineBadge(r.date)}</td></tr>`).join('')}</table>`}
      <p class="muted" style="margin-bottom:0">Сроки по общим правилам; точные — в личном кабинете ФНС.</p>
    </div>
    <div class="panel">
      <h3>Какой режим выгоднее при доходе ${fmt(s.yearIncome)} за ${year}?</h3>
      <table><tr><th>Режим</th><th>Налог за год</th><th></th></tr>
        ${cmpRow('npd', 'НПД (4%/6%, вычет 10 000 ₽)')}
        ${cmpRow('usn6', 'УСН 6% (с вычетом взносов ИП)')}
        ${cmpRow('usn15', 'УСН 15% (доходы − расходы)')}
      </table>
      <p class="muted" style="margin-bottom:0">Оценка по введённым данным; взносы ИП 1% свыше 300 тыс. не учтены в сравнении.</p>
    </div>
  `, 'calendar');
}

async function clientsView() {
  shell(`
    <h2>Контрагенты</h2>
    <div class="panel">
      <h3>Новый контрагент</h3>
      <form class="form-grid" id="client-form">
        <div><label>Имя / название</label><input id="c-name" required maxlength="100" placeholder="ООО «Ромашка» или Иван" /></div>
        <div><label>Тип (ставка НПД)</label><select id="c-type"><option value="person">Физлицо — 4%</option><option value="company">Компания/ИП — 6%</option></select></div>
        <div><label>Телефон</label><input id="c-phone" maxlength="30" /></div>
        <div><label>Примечание</label><input id="c-note" maxlength="500" /></div>
        <div><button type="submit">Добавить</button></div>
      </form>
      <div class="error" id="err"></div>
    </div>
    <div class="panel"><h3>Список</h3><div id="list"><p class="muted">Загрузка…</p></div></div>
  `, 'clients');
  document.getElementById('client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('err');
    errEl.textContent = '';
    try {
      await api('/api/clients', { method: 'POST', body: JSON.stringify({
        name: document.getElementById('c-name').value,
        type: document.getElementById('c-type').value,
        phone: document.getElementById('c-phone').value,
        note: document.getElementById('c-note').value,
      }) });
      toast('Контрагент добавлен');
      clientsView();
    } catch (err) { errEl.textContent = err.message; }
  });
  api('/api/clients').then((list) => {
    document.getElementById('list').innerHTML = list.length === 0 ? '<p class="muted">Пока пусто.</p>' : `<table>
      <tr><th>Имя</th><th>Тип</th><th>Телефон</th><th>Доходов на сумму</th><th></th></tr>
      ${list.map((c) => `<tr><td>${esc(c.name)}${c.note ? `<div class="muted">${esc(c.note)}</div>` : ''}</td>
        <td>${c.type === 'company' ? 'компания 6%' : 'физлицо 4%'}</td><td>${esc(c.phone ?? '')}</td><td>${fmt(c.total ?? 0)}</td>
        <td><button class="icon-btn del" data-id="${c.id}">✕</button></td></tr>`).join('')}</table>`;
    document.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить контрагента? Записи останутся, связь уберётся.')) return;
      await api('/api/clients/' + b.dataset.id, { method: 'DELETE' });
      toast('Удалено');
      clientsView();
    }));
  }).catch((err) => { document.getElementById('list').innerHTML = `<p class="error">${esc(err.message)}</p>`; });
}

window.addEventListener('hashchange', route);
initTheme();
route();
