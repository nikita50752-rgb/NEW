# Mistral Chat

Минимальное веб-приложение-чат, которое обращается к API Mistral через официальный TypeScript SDK (`@mistralai/mistralai`). Модель: `mistral-small-latest`. Ключ `MISTRAL_API_KEY` хранится только на сервере (в `.env`) и никогда не отправляется в браузер.

## Установка и запуск

```bash
# 1. Установить зависимости
npm install

# 2. Ключ: интерактивно записать в .env (ввод скрыт звёздочками)
npm run set-key
#    ключ берётся в консоли: https://console.mistral.ai/api-keys

# 3. Проверить, что ключ принят API (ключ не печатается)
npm run check-key

# 4. Локальный запуск (режим разработки)
npm run dev
```

Откройте http://localhost:3000

Ручной вариант вместо `npm run set-key`: `cp .env.example .env` и вписать ключ в `.env` вручную одной строкой `MISTRAL_API_KEY=ключ`.

## Продакшн-сборка

```bash
npm run build
npm start
```

## Структура

- `src/server.ts` — HTTP-сервер: отдаёт чат-интерфейс и проксирует запросы к API Mistral (`POST /api/chat`)
- `public/index.html` — простой интерфейс чата
- `.env` — ключ API (не коммитится, см. `.gitignore`)

## Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `MISTRAL_API_KEY` | Ключ API Mistral (обязательно) | — |
| `PORT` | Порт сервера | `3000` |

## Если не работает

- В чате показывается реальная причина от API (например, `статус 401 — Invalid API Key`).
- `401 Invalid API Key` — ключ неверный или отозван: создайте новый на https://console.mistral.ai/api-keys, запишите в `.env` одной строкой `MISTRAL_API_KEY=ключ` и перезапустите сервер (`Ctrl+C` → `npm run dev`). Никогда не вставляйте ключ в чат.
- `402`/`429` — закончились кредиты или превышен лимит запросов в консоли Mistral.
- Сервер не стартует с ошибкой про `MISTRAL_API_KEY` — нет файла `.env` (в Windows проверьте, что файл называется ровно `.env`, а не `.env.txt`).
