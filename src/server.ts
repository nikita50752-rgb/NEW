import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Mistral } from '@mistralai/mistralai';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_BODY_BYTES = 200_000;
const MAX_MESSAGES = 100;
const MAX_SESSIONS = 100;
const MODELS = ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'];
const DEFAULT_MODEL = 'mistral-small-latest';

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

if (!process.env.MISTRAL_API_KEY) {
  console.error('Error: MISTRAL_API_KEY is not set.');
  console.error('Run "npm run set-key" or copy .env.example to .env and add your key.');
  process.exit(1);
}

if (/\s/.test(process.env.MISTRAL_API_KEY) || process.env.MISTRAL_API_KEY.length < 20) {
  console.warn('Warning: MISTRAL_API_KEY looks malformed (spaces or too short).');
  console.warn('Create a fresh key at https://console.mistral.ai/api-keys (npm run set-key).');
}

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? '';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface Session {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    (m.role === 'system' || m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    m.content.length > 0
  );
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function authorized(req: import('node:http').IncomingMessage): boolean {
  return !ACCESS_TOKEN || req.headers['x-access-token'] === ACCESS_TOKEN;
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

async function loadHistory(): Promise<Session[]> {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf8')) as Session[];
  } catch {
    return [];
  }
}

async function saveHistory(sessions: Session[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(HISTORY_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

function sse(res: import('node:http').ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

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

  if (!authorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized: set x-access-token header (ACCESS_TOKEN in .env)' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    sendJson(res, 200, { models: MODELS, defaultModel: DEFAULT_MODEL, authRequired: !!ACCESS_TOKEN });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    const sessions = await loadHistory();
    sendJson(
      res,
      200,
      sessions.map(({ id, title, model, updatedAt }) => ({ id, title, model, updatedAt }))
    );
    return;
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([\w-]+)$/);
  if (sessionMatch && req.method === 'GET') {
    const sessions = await loadHistory();
    const session = sessions.find((s) => s.id === sessionMatch[1]);
    if (!session) {
      sendJson(res, 404, { error: 'Session not found' });
      return;
    }
    sendJson(res, 200, session);
    return;
  }
  if (sessionMatch && req.method === 'DELETE') {
    const sessions = await loadHistory();
    const next = sessions.filter((s) => s.id !== sessionMatch[1]);
    if (next.length === sessions.length) {
      sendJson(res, 404, { error: 'Session not found' });
      return;
    }
    await saveHistory(next);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let body: { sessionId?: string; model?: string; messages?: unknown };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const model = body.model ?? DEFAULT_MODEL;
    const messages = body.messages;
    if (!MODELS.includes(model)) {
      sendJson(res, 400, { error: `Unknown model. Allowed: ${MODELS.join(', ')}` });
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES || !messages.every(isChatMessage)) {
      sendJson(res, 400, { error: `Expected "messages": array of { role, content } (max ${MAX_MESSAGES})` });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    try {
      const stream = await mistral.chat.stream({ model, messages: messages as ChatMessage[] });
      let full = '';
      for await (const chunk of stream) {
        const delta = chunk.data.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          full += delta;
          sse(res, { delta });
        }
      }
      const now = Date.now();
      const firstUser = messages.find((m) => m.role === 'user');
      const title = (firstUser?.content ?? 'Новый чат').slice(0, 60);
      const sessions = await loadHistory();
      let session = typeof body.sessionId === 'string' ? sessions.find((s) => s.id === body.sessionId) : undefined;
      const allMessages: ChatMessage[] = [...(messages as ChatMessage[]), { role: 'assistant', content: full }];
      if (session) {
        session.messages = allMessages;
        session.model = model;
        session.title = title;
        session.updatedAt = now;
      } else {
        session = { id: randomUUID(), title, model, createdAt: now, updatedAt: now, messages: allMessages };
        sessions.unshift(session);
      }
      if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS;
      await saveHistory(sessions);
      sse(res, { done: true, sessionId: session.id });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      console.error('Mistral API error:', err);
      const e = err as { statusCode?: number; body?: unknown };
      let detail = '';
      if (typeof e.body === 'string') {
        try {
          detail = (JSON.parse(e.body) as { detail?: string }).detail ?? '';
        } catch {
          detail = e.body;
        }
      }
      sse(res, { error: 'Mistral API request failed', status: e.statusCode, detail });
      res.write('data: [DONE]\n\n');
      res.end();
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Chat app is running at http://localhost:${PORT}`);
});
