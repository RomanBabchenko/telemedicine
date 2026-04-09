# Telemed Platform

Телемедицинская платформа для украинского рынка: marketplace + white label для частных клиник.

Подробное ТЗ см. в [`Telemedicine.md`](./Telemedicine.md).

## Стек

- **Backend:** NestJS (модульный монолит) + TypeORM + PostgreSQL
- **Frontend:** React 18 + Vite (3 кабинета: пациент / врач / админ клиники)
- **Realtime:** LiveKit (WebRTC SFU)
- **Очереди:** BullMQ + Redis
- **Storage:** MinIO (S3-compatible)
- **Mail (dev):** MailHog
- **Платежи:** stub-провайдер за интерфейсом `PaymentProvider`
- **МИС:** stub-коннектор DocDream за интерфейсом `MISConnector`

## Структура

```
apps/
  api/             — NestJS modular monolith
  web-patient/     — React+Vite кабинет пациента (порт 5173)
  web-doctor/      — React+Vite кабинет врача (порт 5174)
  web-admin/       — React+Vite кабинет админа клиники (порт 5175)
packages/
  shared-types/    — общие DTO/enum/zod
  api-client/      — axios + TanStack Query хуки
  ui/              — Tailwind+Radix дизайн-система
  config/          — общие eslint/tsconfig/tailwind пресеты
  utils/           — date/money/i18n хелперы
infra/             — docker конфиги (postgres, livekit)
```

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migration:run
npm run db:seed
npm run dev
```

После запуска:

| Сервис      | URL                                  |
|-------------|--------------------------------------|
| API         | http://localhost:3000/api/v1         |
| API docs    | http://localhost:3000/api/v1/docs    |
| Patient UI  | http://localhost:5173                |
| Doctor UI   | http://localhost:5174                |
| Admin UI    | http://localhost:5175                |
| MailHog     | http://localhost:8025                |
| MinIO       | http://localhost:9001                |
| LiveKit     | ws://localhost:7880                  |

## Скрипты

```bash
npm run dev                    # запустить всё через Turborepo
npm run build                  # собрать всё
npm run typecheck              # проверка типов
npm run lint                   # ESLint
npm run test                   # unit-тесты
npm run test:e2e               # e2e (Supertest)
npm run db:migration:generate -- <Name>
npm run db:migration:run
npm run db:migration:revert
npm run db:seed
```

## Демо-учётки (после seed)

| Роль          | Email/login                | Пароль    |
|---------------|----------------------------|-----------|
| Пациент       | patient1@demo.local        | demo1234  |
| Врач          | doctor1@demo.local         | demo1234  |
| Админ клиники | admin@clinic-a.local       | demo1234  |
| Платформа     | super@telemed.local        | demo1234  |

## Архитектура

См. файл плана: `.claude/plans/vivid-waddling-volcano.md` (если доступен) или раздел 6+ в `Telemedicine.md`.

Бэкенд — модульный монолит со строгими bounded contexts:
`identity`, `tenant`, `provider`, `patient`, `booking`, `consultation`,
`documentation`, `prescription`, `payment`, `notification`, `file-storage`,
`recording`, `mis-integration`, `analytics`, `audit`, `admin`.

Адаптеры за интерфейсами (готовы к замене реальными провайдерами):
`PaymentProvider`, `MISConnector`, `VideoProvider`, `NotificationChannel`.
