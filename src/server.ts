import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Mistral } from '@mistralai/mistralai';

const MODEL = 'mistral-small-latest';
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const MAX_BODY_BYTES = 100_000;
const MAX_MESSAGES = 50;

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
  console.error('Copy .env.example to .env and put your key there.');
  process.exit(1);
}

if (/\s/.test(process.env.MISTRAL_API_KEY) || process.env.MISTRAL_API_KEY.length < 20) {
  console.warn('Warning: MISTRAL_API_KEY looks malformed (spaces or too short).');
  console.warn('Create a fresh key at https://console.mistral.ai/api-keys and paste it into .env.');
}

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = await readFile(path.join(PUBLIC_DIR, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let messages: unknown;
    try {
      messages = JSON.parse(await readBody(req)).messages;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES || !messages.every(isChatMessage)) {
      sendJson(res, 400, { error: 'Expected "messages": array of { role, content } (max 50)' });
      return;
    }
    try {
      const completion = await mistral.chat.complete({
        model: MODEL,
        messages: messages as ChatMessage[],
      });
      const reply = completion.choices?.[0]?.message?.content ?? '';
      sendJson(res, 200, { reply });
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
      sendJson(res, 502, { error: 'Mistral API request failed', status: e.statusCode, detail });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Chat app is running at http://localhost:${PORT}`);
});
