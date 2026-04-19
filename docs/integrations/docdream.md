# Інтеграція DocDream ↔ Telemed

Опис інтеграційного потоку між DocDream та Telemed-системою.

---

## 1. Модель інтеграції

DocDream — канонічне джерело медичних записів. Telemed надає відеокімнату, запрошення та аудіозапис.

**Напрямок даних — RPC (синхронний):**

```
DocDream ──POST appointment──▶ Telemed
         ◀──invite URLs + ids──

DocDream ──PATCH payment──────▶ Telemed
         ◀──ok + new status────

DocDream ──GET recording──────▶ Telemed
         ◀──downloadUrl────────
```

DocDream ніколи не отримує асинхронних зворотних викликів від Telemed. Усі виклики ініціює DocDream, ми віддаємо відповідь синхронно _(цю інформацію отримано на останній зустрічі з технічним відділом DocDream)_.

---

## 2. Автентифікація

**Усі** server-to-server запити захищені API-ключем per-tenant.

### Видача ключа
1. Адміністратор клініки заходить у Telemed admin UI (`https://admin.<domain>`) → розділ **«API ключі»**
2. Натискає **«Створити ключ»**, вказує:
   - connector: `docdream`
   - name (опційно, для розрізнення: `prod`, `staging`)
   - IP allowlist (опційно, формат `10.0.0.5` або CIDR `10.0.0.0/24`)
3. Ключ показується **один раз** у форматі `tmd_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
4. DocDream зберігає ключ у secrets-менеджері

### Використання
У **всі** запити до `/integrations/*` додавати HTTP-заголовок:

```
Authorization: ApiKey tmd_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Ротація ключів
Підтримується кілька активних ключів одночасно на одну пару `(tenant, connector)` — можна створити новий ключ, переключитися, відкликати старий — без downtime.

### Відповіді автентифікації

| Код | Причина |
|---|---|
| `401 Unauthorized` | Заголовок відсутній, невірний або відкликаний |
| `403 Forbidden` | Ключ валідний, але не належить tenant'у в URL, або вихідний IP не в allowlist |

---

## 3. Базовий URL

```
https://api.<domain>/api/v1
```

Усі шляхи нижче — відносно цього базового URL.

`<tenantId>` — UUID клініки в нашій системі. DocDream отримує його від Telemed при онбордингу клініки (одноразово).

---

## 4. Створення відеозустрічі

**Endpoint:** `POST /integrations/{tenantId}/appointments`

Конектор (`docdream`) визначається з API-ключа автоматично — в URL його вказувати не потрібно.

**Headers:**
```
Authorization: ApiKey tmd_live_...
Content-Type: application/json
```

**Request body:**

```json
{
  "type": "appointment.online",
  "externalAppointmentId": "dd-12345",
  "doctorExternalId": "docdream-doc-77",
  "doctorFirstName": "Анна",
  "doctorLastName": "Коваленко",
  "doctorSpecialization": "Кардіологія",
  "patientExternalId": "dd-patient-100",
  "patientFirstName": "Дмитро",
  "patientLastName": "Шевченко",
  "patientEmail": "dshevchenko@example.com",
  "patientPhone": "+380509876543",
  "startAt": "2026-04-20T10:00:00Z",
  "endAt": "2026-04-20T10:30:00Z",
  "paymentType": "prepaid",
  "paymentStatus": "unpaid"
}
```

### Поля

| Поле | Обов. | Опис |
|---|---|---|
| `type` | так | Завжди `"appointment.online"` |
| `externalAppointmentId` | так | Унікальний ID зустрічі в DocDream. За ним працює ідемпотентність |
| `doctorExternalId` / `patientExternalId` | так | Ідентифікатори в DocDream |
| `doctorFirstName` / `doctorLastName` / `doctorSpecialization` | так | Telemed створить профіль лікаря, якщо потрібно |
| `patientFirstName` / `patientLastName` | так | — |
| `patientEmail` / `patientPhone` | так | Email або phone (мінімум один — на цей канал піде invite-посилання) |
| `startAt` / `endAt` | так | ISO-8601 UTC, початок і кінець зустрічі |
| `paymentType` | ні | `"prepaid"` \| `"postpaid"`. За замовчуванням `"postpaid"` |
| `paymentStatus` | ні | `"paid"` \| `"unpaid"`. За замовчуванням `"unpaid"` |

### Логіка payment

| `paymentType` | `paymentStatus` | Результат |
|---|---|---|
| `postpaid` (або не вказаний) | будь-який | Зустріч одразу `CONFIRMED`, пацієнт може підключатися |
| `prepaid` | `paid` | Зустріч одразу `CONFIRMED` |
| `prepaid` | `unpaid` | Зустріч `AWAITING_PAYMENT`, пацієнт бачить «Оплату не завершено, зверніться до клініки» і **не** може підключитися |

### Response 200

```json
{
  "received": true,
  "appointmentId": "c6442524-c847-4d28-8d59-a1af5316c3a9",
  "consultationSessionId": "a1b2c3d4-...",
  "patientInviteUrl": "https://patient.<domain>/invite?token=<32-hex>",
  "doctorInviteUrl": "https://doctor.<domain>/invite?token=<32-hex>"
}
```

DocDream має **зберегти `appointmentId`** — він знадобиться для оплати та отримання запису. Або використовувати `externalAppointmentId` у наступних викликах (див. паралельні endpoint'и нижче).

### Invite-посилання — UX

- Пацієнт клікає → потрапляє до зали очікування
- Посилання живе від моменту створення до `endAt + 30min`
- Можна клікати кілька разів (multi-consume) — зручно, якщо втратив вкладку
- Відеокімната відкривається за **15 хвилин до `startAt`** та закривається через **30 хвилин після `endAt`**
- Пацієнт з invite-токеном бачить **тільки** сторінку відеоконсультації — доступу до інших розділів Telemed у нього немає

### Ідемпотентність

Повторний POST із тим самим `externalAppointmentId` не створить нову зустріч — поверне той самий `appointmentId` та нові invite-токени (старі інвалідуються).

### Помилки

| Код | Причина |
|---|---|
| `401` / `403` | Див. розділ Автентифікація |
| `404 Tenant not found` | Невірний `tenantId` в URL |
| `400` | Невалідний JSON / відсутні обов'язкові поля |

---

## 5. Підтвердження оплати (тільки для `prepaid`)

Якщо при створенні зустрічі `paymentType=prepaid` і `paymentStatus=unpaid`, пацієнт заблокований. Після оплати в клініці DocDream викликає:

**Endpoint:** `PATCH /integrations/{tenantId}/appointments/{appointmentId}/payment-status`

**Альтернатива** (за external ID, якщо DocDream не зберіг наш UUID):
`PATCH /integrations/{tenantId}/appointments/by-external/{externalAppointmentId}/payment-status`

**Body:**
```json
{ "paymentStatus": "paid" }
```

**Response:**
```json
{
  "ok": true,
  "appointmentId": "c6442524-...",
  "misPaymentStatus": "paid",
  "status": "CONFIRMED"
}
```

Після цього кнопка підключення в пацієнта стає активною (автоматичний polling оновить UI протягом ~15 секунд).

### Помилки

| Код | Причина |
|---|---|
| `400 Appointment is not MIS-prepaid` | У зустрічі не заданий `paymentType=prepaid`, оновлювати нічого |
| `404 Appointment not found` | Невірний id |

---

## 6. Отримання запису консультації

Після завершення відеоконсультації Telemed завантажує MP3-файл у своє S3-сховище. DocDream запитує посилання на завантаження:

**Endpoint:** `GET /integrations/{tenantId}/appointments/{appointmentId}/recording`

**Альтернатива:** `GET /integrations/{tenantId}/appointments/by-external/{externalAppointmentId}/recording`

**Response:**
```json
{
  "recordingId": "...",
  "status": "STORED",
  "durationSec": 842,
  "downloadUrl": "https://minio.<domain>/telemed-files/<tenantId>/recordings/<sessionId>.mp3?X-Amz-Algorithm=..."
}
```

### Поля відповіді

| Поле | Значення | Коментар |
|---|---|---|
| `status` | `RECORDING` \| `STORED` | `RECORDING` — консультація ще триває. `STORED` — можна завантажувати |
| `durationSec` | число | Тривалість запису |
| `downloadUrl` | `string` \| `null` | Presigned S3 URL, валідний **1 годину**. `null` поки `status=RECORDING` |

### Формат файлу

- **Codec:** MP3
- **Content-Type:** `audio/mpeg`
- **Вміст:** змікшоване аудіо обох учасників (лікар + пацієнт)

### Retention

Файли зберігаються згідно з `audioPolicy.retentionDays` tenant'а (за замовчуванням 30 днів). Після цього видаляються автоматично.

### Коли забирати

Рекомендується polling з інтервалом 30 секунд після `endAt`. Зазвичай запис готовий протягом 1-2 хвилин.

---

## 7. Скасування зустрічі

Якщо зустріч треба скасувати (пацієнт зателефонував до клініки, лікар захворів тощо), DocDream викликає:

**Endpoint:** `POST /integrations/{tenantId}/appointments/{appointmentId}/cancel`

**Альтернатива:** `POST /integrations/{tenantId}/appointments/by-external/{externalAppointmentId}/cancel`

**Body:**
```json
{ "reason": "Пацієнт не може прийти" }
```

**Response:**
```json
{
  "ok": true,
  "appointmentId": "c6442524-...",
  "status": "CANCELLED_BY_PROVIDER",
  "cancelledReason": "Пацієнт не може прийти",
  "invitesRevoked": 2
}
```

### Що відбувається
- Зустріч переходить у `CANCELLED_BY_PROVIDER` (термінальний статус)
- **Усі активні invite-посилання відкликаються** — ані пацієнт, ані лікар більше не зможуть використати своє посилання
- Спроба підключитися до відео → `403 "Зустріч скасовано або завершено"`
- Спроба consume'ити вже відкликаний invite → `401 "Invalid or expired invite link"`

Зустріч у термінальному статусі не може бути «оживлена». Якщо пацієнт потім зателефонує і захоче перепланувати — це нова зустріч із новим `externalAppointmentId`.

---

## 8. Відкликання invite-посилань (без скасування зустрічі)

Сценарій: зустріч має відбутися, але конкретне посилання витекло (вкрали телефон, переслали SMS не туди). Треба вбити **тільки** посилання, не чіпаючи саму зустріч.

**Endpoint:** `POST /integrations/{tenantId}/appointments/{appointmentId}/invites/revoke`

**Альтернатива:** `POST /integrations/{tenantId}/appointments/by-external/{externalAppointmentId}/invites/revoke`

**Body (опційно):**
```json
{ "role": "PATIENT" }
```

| `role` | Ефект |
|---|---|
| не вказано | Відкликати **обидва** посилання (пацієнта та лікаря) |
| `"PATIENT"` | Тільки посилання пацієнта |
| `"DOCTOR"` | Тільки посилання лікаря |

**Response:**
```json
{
  "ok": true,
  "appointmentId": "c6442524-...",
  "revoked": 1
}
```

`revoked` — кількість фактично відкликаних посилань (ігнорує вже відкликані раніше).

### Як видати нове посилання
Після відкликання надішли **повторний** `POST /integrations/{tid}/appointments` із тим самим `externalAppointmentId`. Наш ідемпотентний обробник віддасть нові invite-URL у відповіді — ти доставиш їх пацієнту новим каналом.

```bash
# 1. Відкликати скомпрометоване посилання пацієнта
curl -X POST .../integrations/$TID/appointments/by-external/dd-12345/invites/revoke \
  -H "Authorization: ApiKey tmd_live_..." \
  -d '{"role":"PATIENT"}'

# 2. Перевидати посилання (endpoint ідемпотентний)
curl -X POST .../integrations/$TID/appointments \
  -H "Authorization: ApiKey tmd_live_..." \
  -d '{"type":"appointment.online","externalAppointmentId":"dd-12345",...}'
# → new patientInviteUrl + doctorInviteUrl
```

---

## 9. Повний приклад flow

```
T-7d  DocDream створює prepaid-зустріч
      → POST /integrations/{tid}/appointments
      ← patientInviteUrl, appointmentId

      DocDream надсилає посилання пацієнту (SMS/email)

T-6d  Пацієнт клікає посилання, бачить "Оплату не завершено"

T-5d  Пацієнт оплачує в клініці за реквізитами DocDream
      DocDream підтверджує оплату:
      → PATCH /integrations/{tid}/appointments/{aid}/payment-status
        body: { "paymentStatus": "paid" }
      ← { status: "CONFIRMED" }

      Пацієнт автоматично бачить кнопку "Підключитись"

T-0   Пацієнт і лікар підключаються за 15 хв до startAt
      Відеоконсультація, автоматичний MP3-запис

T+1min  Консультація завершена

T+3min  DocDream запитує запис:
        → GET /integrations/{tid}/appointments/{aid}/recording
        ← { status: "STORED", downloadUrl: "https://..." }
        DocDream завантажує MP3 за URL
```

---

## 10. Session binding (опційно)

Адміністратор клініки може увімкнути в налаштуваннях tenant'а прив'язку invite-сесії до IP та/або User-Agent пристрою пацієнта:

| Політика | Ефект |
|---|---|
| `invitePolicy.bindIp: true` | JWT прив'язаний до IP, який зробив consume. Зміна IP (Wi-Fi → 4G, VPN on/off) → `401 Session mismatch` |
| `invitePolicy.bindUserAgent: true` | JWT прив'язаний до hash'у User-Agent. Зміна браузера/пристрою → `401 Session mismatch` |
| Обидві опції `false` (дефолт) | JWT працює звідки і чим завгодно в межах TTL |

### Як пацієнт відновлюється
При `401 Session mismatch` на фронті — пацієнт просто клікає invite-посилання знову, отримує новий JWT, прив'язаний до поточного пристрою/IP. Старий JWT після цього не можна використати ніде.

### Для DocDream
Поведінка інтеграційних endpoint'ів від цієї політики **не залежить** — server-to-server виклики автентифікуються за API-ключем, а не за JWT пацієнта. Варто лише пам'ятати, що пацієнти можуть отримувати 401 при зміні мережі, особливо на мобільних — це не баг, а опція, увімкнена клінікою.

---

## 11. Тестове оточення

Telemed надає DocDream окремий tenant + API-ключ для інтеграційних тестів:
- Base URL: `https://api.demo.<domain>/api/v1`
- TenantId: видається окремо
- API key: видається окремо, префікс `tmd_live_` (той самий формат)

У тестовому оточенні працює все, крім реальних email/SMS — invite-посилання приходять на MailHog-мок.
