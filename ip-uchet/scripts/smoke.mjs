import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 4100 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['dist/server.js'], {
  env: { ...process.env, PORT: String(PORT), SESSION_SECRET: 'smoke-secret' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('PASS', name); }
  else { failed++; console.log('FAIL', name); }
}

async function call(path, opts = {}, cookieRef) {
  const res = await fetch(base + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookieRef?.c ? { cookie: cookieRef.c } : {}), ...(opts.headers || {}) },
  });
  const sc = res.headers.get('set-cookie');
  if (sc && cookieRef) cookieRef.c = sc.split(';')[0];
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

try {
  await once(srv.stdout, 'data');
  const jar = { c: '' };
  const year = new Date().getFullYear();
  const mm = String(new Date().getMonth() + 1).padStart(2, '0');

  const health = await call('/api/health');
  check('health 200', health.status === 200 && health.data.ok === true);

  const noAuth = await call('/api/me');
  check('me без сессии -> 401', noAuth.status === 401);

  const reg = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'smoke@test.dev', password: 'secret1' }) }, jar);
  check('register 200', reg.status === 200 && reg.data.email === 'smoke@test.dev');
  const dup = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'smoke@test.dev', password: 'secret1' }) }, { c: '' });
  check('дубликат -> 409', dup.status === 409);
  const badLogin = await call('/api/login', { method: 'POST', body: JSON.stringify({ email: 'smoke@test.dev', password: 'wrong' }) }, { c: '' });
  check('неверный пароль -> 401', badLogin.status === 401);

  const add1 = await call('/api/entries', { method: 'POST', body: JSON.stringify({ type: 'income', date: `${year}-${mm}-05`, amount: 1000000, category: 'услуги', payerType: 'person', receipt: '1' }) }, jar);
  check('add income 200', add1.status === 200 && add1.data.id);
  const add2 = await call('/api/entries', { method: 'POST', body: JSON.stringify({ type: 'income', date: `${year}-${mm}-10`, amount: 50000, category: 'консалтинг', payerType: 'company' }) }, jar);
  const add3 = await call('/api/entries', { method: 'POST', body: JSON.stringify({ type: 'expense', date: `${year}-${mm}-12`, amount: 8000, category: 'аренда' }) }, jar);
  check('add company income + expense 200', add2.status === 200 && add3.status === 200);
  const badEntry = await call('/api/entries', { method: 'POST', body: JSON.stringify({ type: 'income', date: 'bad",', amount: -1, category: '' }) }, jar);
  check('невалидная запись -> 400', badEntry.status === 400);

  const put = await call('/api/entries/' + add1.data.id, { method: 'PUT', body: JSON.stringify({ type: 'income', date: `${year}-${mm}-06`, amount: 1200000, category: 'услуги', payerType: 'person' }) }, jar);
  check('PUT запись 200', put.status === 200 && put.data.amount === 1200000);

  const sum = await call(`/api/summary?year=${year}`, {}, jar);
  check('summary: доход 1250000', sum.status === 200 && sum.data.yearIncome === 1250000);
  check('summary: НПД налог = 1200000*4%+50000*6%-10000 = 41000', sum.status === 200 && sum.data.yearTax === 41000);
  check('summary: лимит НПД', sum.data.npdLimitLeft === 2400000 - 1250000);

  const prof = await call('/api/profile', { method: 'PUT', body: JSON.stringify({ regime: 'usn6', status: 'ip', fixedContributions: 57390 }) }, jar);
  check('profile usn6 200', prof.status === 200 && prof.data.profile.regime === 'usn6');
  const sum2 = await call(`/api/summary?year=${year}`, {}, jar);
  check('summary USN6: 1250000*6%-57390 = 17610', sum2.data.yearTax === 17610);

  const csv = await fetch(base + `/api/export.csv?type=income&year=${year}`, { headers: { cookie: jar.c } });
  const csvText = await csv.text();
  check('CSV 200 и 2 строки', csv.status === 200 && csvText.trim().split('\n').length === 3);

  const list = await call('/api/entries?type=income', {}, jar);
  check('list 2 дохода', list.status === 200 && list.data.length === 2);
  const del = await call('/api/entries/' + add2.data.id, { method: 'DELETE' }, jar);
  check('DELETE 200', del.status === 200);

  const sec = await fetch(base + '/');
  check('security headers', sec.headers.get('x-content-type-options') === 'nosniff' && sec.headers.get('x-frame-options') === 'DENY');

  const other = { c: '' };
  await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'other@test.dev', password: 'secret1' }) }, other);
  const foreign = await call('/api/entries', {}, other);
  check('изоляция: чужой список пуст', foreign.status === 200 && foreign.data.length === 0);
} catch (e) {
  failed++;
  console.error('SMOKE ERROR', e);
} finally {
  srv.kill();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
