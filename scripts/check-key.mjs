import { existsSync, readFileSync } from 'node:fs';

if (!existsSync('.env')) {
  console.error('Файл .env не найден. Сначала запустите: npm run set-key');
  process.exit(1);
}
const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('MISTRAL_API_KEY='));
const key = line ? line.slice('MISTRAL_API_KEY='.length).trim() : '';
if (!key) {
  console.error('В .env нет строки MISTRAL_API_KEY=... Запустите: npm run set-key');
  process.exit(1);
}
console.log(`Формат ключа: префикс "${key.slice(0, 6)}", длина ${key.length} (ожидается префикс mstrl_)`);
const res = await fetch('https://api.mistral.ai/v1/models', {
  headers: { Authorization: `Bearer ${key}` },
});
if (res.ok) {
  console.log('OK: ключ валидный, API Mistral отвечает. Можно запускать: npm run dev');
} else {
  const body = await res.text();
  console.error(`Ключ НЕ принят API: status ${res.status}, ответ: ${body}`);
  console.error('Создайте новый ключ на https://console.mistral.ai/api-keys и запустите: npm run set-key');
  process.exit(1);
}
