import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { hashPassword, newSalt, verifyPassword, signSession, verifySession, parseCookies } from './auth.js';
import { loadDB, saveDB, getDB, type Entry, type EntryType, type PayerType, type Profile, type Regime, type Status } from './store.js';
import { summarize, DEFAULT_FIXED_CONTRIBUTIONS, NPD_LIMIT_YEAR } from './tax.js';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const MAX_BODY_BYTES = 100_000;

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, '..', '.env'));

const SESSION_SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('Warning: SESSION_SECRET not set, using a random one (sessions will reset on restart). Set it in .env.');
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function setSessionCookie(res: import('node:http').ServerResponse, userId: string): void {
  const token = signSession({ userId }, SESSION_SECRET);
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`);
}

function clearSessionCookie(res: import('node:http').ServerResponse): void {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function currentUser(req: import('node:http').IncomingMessage) {
  const token = parseCookies(req.headers.cookie).session;
  if (!token) return null;
  const payload = verifySession(decodeURIComponent(token), SESSION_SECRET);
  if (!payload) return null;
  return getDB().users.find((u) => u.id === payload.userId) ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEntry(body: Record<string, unknown>): body is { type: EntryType; date: string; amount: number; category: string; payerType?: PayerType; method?: string; receipt?: string; note?: string } {
  return (
    (body.type === 'income' || body.type === 'expense') &&
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) &&
    typeof body.amount === 'number' && body.amount > 0 && body.amount <= 1e9 &&
    typeof body.category === 'string' && body.category.length <= 100 &&
    (body.payerType === undefined || body.payerType === 'person' || body.payerType === 'company') &&
    (body.method === undefined || typeof body.method === 'string') &&
    (body.receipt === undefined || typeof body.receipt === 'string') &&
    (body.note === undefined || typeof body.note === 'string')
  );
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  await loadDB();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const db = getDB();

  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!/^[\w.-]+$/.test(rel)) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    try {
      const body = await readFile(path.join(PUBLIC_DIR, rel));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      sendJson(res, 404, { error: 'Not found' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!EMAIL_RE.test(email) || password.length < 6) {
      sendJson(res, 400, { error: 'Нужен email и пароль минимум из 6 символов' });
      return;
    }
    if (db.users.some((u) => u.email === email)) {
      sendJson(res, 409, { error: 'Пользователь с таким email уже есть' });
      return;
    }
    const salt = newSalt();
    const user = {
      id: randomUUID(),
      email,
      salt,
      passHash: hashPassword(password, salt),
      createdAt: Date.now(),
      profile: { regime: 'npd' as Regime, status: 'self' as Status, fixedContributions: DEFAULT_FIXED_CONTRIBUTIONS },
    };
    db.users.push(user);
    await saveDB();
    setSessionCookie(res, user.id);
    sendJson(res, 200, { email: user.email, profile: user.profile });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = db.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.salt, user.passHash)) {
      sendJson(res, 401, { error: 'Неверный email или пароль' });
      return;
    }
    setSessionCookie(res, user.id);
    sendJson(res, 200, { email: user.email, profile: user.profile });
    return;
  }

  const user = currentUser(req);
  if (!user && url.pathname !== '/api/logout') {
    sendJson(res, 401, { error: 'Нужно войти' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    sendJson(res, 200, { email: user!.email, profile: user!.profile });
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/profile') {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const regimes: Regime[] = ['npd', 'usn6', 'usn15'];
    const statuses: Status[] = ['self', 'ip'];
    if (body.regime !== undefined && !regimes.includes(body.regime as Regime)) {
      sendJson(res, 400, { error: `regime: ${regimes.join(' | ')}` });
      return;
    }
    if (body.status !== undefined && !statuses.includes(body.status as Status)) {
      sendJson(res, 400, { error: `status: ${statuses.join(' | ')}` });
      return;
    }
    if (body.fixedContributions !== undefined && (typeof body.fixedContributions !== 'number' || body.fixedContributions < 0 || body.fixedContributions > 1e7)) {
      sendJson(res, 400, { error: 'fixedContributions: число >= 0' });
      return;
    }
    const profile = user!.profile;
    if (body.regime !== undefined) profile.regime = body.regime as Regime;
    if (body.status !== undefined) profile.status = body.status as Status;
    if (body.fixedContributions !== undefined) profile.fixedContributions = body.fixedContributions as number;
    await saveDB();
    sendJson(res, 200, { profile });
    return;
  }

  if (url.pathname === '/api/entries' && req.method === 'GET') {
    const type = url.searchParams.get('type');
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    let list = db.entries.filter((e) => e.userId === user!.id);
    if (type === 'income' || type === 'expense') list = list.filter((e) => e.type === type);
    if (from) list = list.filter((e) => e.date >= from);
    if (to) list = list.filter((e) => e.date <= to);
    list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    sendJson(res, 200, list);
    return;
  }

  if (url.pathname === '/api/entries' && req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    if (!isValidEntry(body)) {
      sendJson(res, 400, { error: 'Нужны: type (income|expense), date (YYYY-MM-DD), amount (>0), category' });
      return;
    }
    const entry: Entry = {
      id: randomUUID(),
      userId: user!.id,
      type: body.type,
      date: body.date,
      amount: Math.round(body.amount * 100) / 100,
      category: body.category,
      createdAt: Date.now(),
    };
    if (body.payerType !== undefined) entry.payerType = body.payerType;
    if (typeof body.method === 'string' && body.method) entry.method = body.method.slice(0, 50);
    if (typeof body.receipt === 'string' && body.receipt) entry.receipt = body.receipt.slice(0, 100);
    if (typeof body.note === 'string' && body.note) entry.note = body.note.slice(0, 500);
    db.entries.push(entry);
    await saveDB();
    sendJson(res, 200, entry);
    return;
  }

  const entryMatch = url.pathname.match(/^\/api\/entries\/([\w-]+)$/);
  if (entryMatch && req.method === 'PUT') {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    if (!isValidEntry(body)) {
      sendJson(res, 400, { error: 'Нужны: type (income|expense), date (YYYY-MM-DD), amount (>0), category' });
      return;
    }
    const entry = db.entries.find((e) => e.id === entryMatch[1] && e.userId === user!.id);
    if (!entry) {
      sendJson(res, 404, { error: 'Запись не найдена' });
      return;
    }
    entry.type = body.type;
    entry.date = body.date;
    entry.amount = Math.round(body.amount * 100) / 100;
    entry.category = body.category;
    if (body.payerType !== undefined) entry.payerType = body.payerType;
    if (typeof body.method === 'string' && body.method) entry.method = body.method.slice(0, 50); else delete entry.method;
    if (typeof body.receipt === 'string' && body.receipt) entry.receipt = body.receipt.slice(0, 100); else delete entry.receipt;
    if (typeof body.note === 'string' && body.note) entry.note = body.note.slice(0, 500); else delete entry.note;
    await saveDB();
    sendJson(res, 200, entry);
    return;
  }
  if (entryMatch && req.method === 'DELETE') {
    const before = db.entries.length;
    db.entries = db.entries.filter((e) => !(e.id === entryMatch[1] && e.userId === user!.id));
    if (db.entries.length === before) {
      sendJson(res, 404, { error: 'Запись не найдена' });
      return;
    }
    await saveDB();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/summary') {
    const year = Number(url.searchParams.get('year') ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      sendJson(res, 400, { error: 'year: целое 2020..2100' });
      return;
    }
    const entries = db.entries.filter((e) => e.userId === user!.id && e.date.startsWith(String(year)));
    const summary = summarize(entries, user!.profile, year);
    sendJson(res, 200, { ...summary, npdLimitYear: user!.profile.regime === 'npd' ? NPD_LIMIT_YEAR : null });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/export.csv') {
    const type = url.searchParams.get('type') === 'expense' ? 'expense' : 'income';
    const year = Number(url.searchParams.get('year') ?? new Date().getFullYear());
    const rows = db.entries.filter((e) => e.userId === user!.id && e.type === type && e.date.startsWith(String(year)));
    const esc = (v: string) => {
      const s = String(v);
      const dangerous = /^[=+\-@]/.test(s);
      return `"${dangerous ? "'" : ''}${s.replace(/"/g, '""')}"`;
    };
    const head = type === 'income' ? 'date;amount;category;payerType;method;receipt;note' : 'date;amount;category;note';
    const lines = rows
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) =>
        type === 'income'
          ? [e.date, e.amount, e.category, e.payerType ?? '', e.method ?? '', e.receipt ?? '', e.note ?? ''].map((v) => esc(String(v))).join(';')
          : [e.date, e.amount, e.category, e.note ?? ''].map((v) => esc(String(v))).join(';')
      );
    const csv = '﻿' + head + '\n' + lines.join('\n') + '\n';
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}-${year}.csv"`,
    });
    res.end(csv);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`ip-uchet is running at http://localhost:${PORT}`);
});
