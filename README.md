# Mistral Chat

Минимальное веб-приложение-чат, которое обращается к API Mistral через официальный TypeScript SDK (`@mistralai/mistralai`). Модель: `mistral-small-latest`. Ключ `MISTRAL_API_KEY` хранится только на сервере (в `.env`) и никогда не отправляется в браузер.

## Установка и запуск

```bash
# 1. Установить зависимости
npm install

# 2. Создать файл окружения и вставить ключ
cp .env.example .env
# отредактируйте .env: MISTRAL_API_KEY=ваш-ключ

# 3. Локальный запуск (режим разработки)
npm run dev
```

Откройте http://localhost:3000

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
