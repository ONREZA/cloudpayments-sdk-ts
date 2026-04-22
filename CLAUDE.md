# cloudpayments-sdk-ts

Типизированный TypeScript SDK для [API CloudPayments](https://developers.cloudpayments.ru). Публикуется как `@onreza/cloudpayments-sdk`. Работает в Node 18+, Bun, Deno, Cloudflare Workers (WebCrypto + fetch).

## Особенность проекта — нет OpenAPI

У CloudPayments нет машинно-читаемой спецификации — только одна большая HTML-страница. Поэтому тут реализован **свой pipeline scrape → IR → codegen** вместо `openapi-typescript`:

```
tools/scrape.ts → specs/raw.html     (curl, sha256-guard)
tools/parse.ts  → specs/ir.json      (cheerio, walk by headings)
tools/gen.ts    → src/_generated/    (handbooks + endpoint request types + webhook payloads)
```

IR (`specs/ir.json`) — промежуточное представление, **коммитится в репо**. Human-reviewable, diffable при обновлении доки. Никогда не редактируется руками.

## Сборка и запуск

```bash
bun install
bun run docs:scrape    # скачать свежий HTML в specs/raw.html
bun run docs:parse     # HTML → specs/ir.json
bun run gen            # IR → src/_generated/
bun run docs:sync      # всё вместе (для CI)
bun run build          # tsup: ESM + CJS + DTS, subpath exports
bun test               # bun test
bun run typecheck
bun run lint           # biome check .
```

## Архитектура

```
cloudpayments-sdk-ts/      (плоская репа, не monorepo)
├─ src/
│  ├─ _generated/          # AUTO — tools/gen.ts, не редактировать
│  │  ├─ handbooks.ts      # TransactionStatus, ReasonCode, Currency, … + label-мапы
│  │  ├─ endpoints.ts      # Per-method Request interfaces + URL-константы + ENDPOINTS
│  │  ├─ webhook-payloads.ts # Check/Pay/Fail/Confirm/Refund/Recurrent/Cancel payloads
│  │  ├─ shared.ts         # Payer, Receipt, CloudPaymentsMeta (объекты из request)
│  │  ├─ meta.ts           # BASE_URL, docs sha256/parsedAt
│  │  └─ index.ts          # re-export
│  ├─ core/                # транспорт
│  │  ├─ http.ts           # CloudPaymentsHttpClient (Basic Auth, retry, timeout)
│  │  └─ retry.ts          # backoff, parseRetryAfter, sleep, isAbortError
│  ├─ auth/basic.ts        # buildBasicAuthHeader (publicId:apiSecret → base64)
│  ├─ modules/             # UX-обёртки, по одной на раздел API
│  │  ├─ base.ts           # BaseModule: exec(), unwrap(), 3DS detection
│  │  ├─ payments.ts       # charge/auth/confirm/void/refund/payout/get/list/post3ds
│  │  ├─ subscriptions.ts  # create/get/findByAccount/update/cancel
│  │  ├─ orders.ts         # create/cancel
│  │  └─ settings.ts       # getNotification/updateNotification (c {Type} substitution)
│  ├─ webhooks/index.ts    # verifyWebhook + typed wrappers + WebhookVerificationError
│  ├─ errors/index.ts      # CloudPaymentsError иерархия + 3DsRequiredError + BusinessError
│  ├─ types.ts             # РУЧНЫЕ Response shapes: Transaction, Subscription, Order, ThreeDsChallenge, TokenRecord, ApiEnvelope
│  ├─ client.ts            # CloudPaymentsClient — composition root
│  └─ index.ts             # публичные exports
├─ test/unit/              # bun test — 27 тестов
├─ tools/                  # pipeline scrape→parse→gen
├─ specs/
│  ├─ raw.html             # (gitignored отдельно) скачанный HTML
│  └─ ir.json              # IR, коммитится
└─ dist/                   # billder output
```

### Слои (важно не смешивать)

```
┌─ UX layer (handwritten) ─────────────────────────────┐
│ CloudPaymentsClient → PaymentsModule и т.д.          │
│ base.ts.exec() → http.post() + unwrap envelope       │
└─────────────────┬─────────────────────────────────────┘
                  │
┌─ Generated layer ────────────────────────────────────┐
│ Request interfaces, handbook types, webhook payloads │
│ src/_generated/ — регенерируется, не трогать         │
└─────────────────┬─────────────────────────────────────┘
                  │
┌─ Transport core ─────────────────────────────────────┐
│ HttpClient: Basic auth, retry 5xx/429/network,       │
│ X-Request-ID, timeout, маппинг → доменные ошибки     │
└───────────────────────────────────────────────────────┘
```

### Ключевые паттерны

- **Все API-ответы обёрнуты в `{ Success, Message, Model }`**. В модулях распаковывается через `BaseModule.exec()` → при `Success:true` возвращает `Model`, при `Success:false` бросает `CloudPaymentsBusinessError` или `CloudPayments3DsRequiredError` (если детектирован 3DS-challenge).
- **3DS detection** включён для charge/auth (по флагу `detect3ds: true` в exec-опциях). Распознаётся по форме `Model: { AcsUrl, PaReq }`.
- **Идемпотентность**: через `opts.idempotencyKey` → заголовок `X-Request-ID`. CP хранит результат 1 час.
- **Retry двойной потолок**: `429` ретраится с `Retry-After` (если есть), `5xx` — с exponential backoff + full jitter. Сетевые ошибки — тоже ретрит, если `retryOnNetworkError: true`. Default: 3 попытки.
- **AbortError** пользователя пробрасывается как есть; timeout (от нашего AbortController) заворачивается в `CloudPaymentsNetworkError`.
- **Webhook verify**: HMAC-SHA256 через WebCrypto (кроссрантаймный), base64-сравнение в constant time. Тип payload пользователь передаёт явно через `verifyCheckWebhook`/`verifyPayWebhook`/… (CP не шлёт тип заголовком — разные URL на стороне ТСП).

## Тип-система

### Generated

- `*Request` — один interface на endpoint+URL, префиксованный модулем:
  - `PaymentsChargeCryptogramRequest`, `PaymentsAuthCryptogramRequest`, `SubscriptionsCreateRequest`, `OrdersCreateRequest` …
- `*_URL` — SCREAMING_SNAKE_CASE константы:
  - `PAYMENTS_CHARGE_CRYPTOGRAM_URL`, `SUBSCRIPTIONS_CREATE_URL`, …
- `ENDPOINTS` — реестр `{ module: { method: { url, method } } }`.
- Handbook enums — `type TransactionStatus = "Authorized" | ...`, `type ReasonCode = 5001 | 5051 | ...` (numeric union), плюс `*_VALUES` массивы и `*Labels` / `*Info` объекты.

### Ручные (`src/types.ts`)

- `ApiEnvelope<T>` — `{ Success, Message, Model? }`.
- `Transaction` — ~55 полей, вытащено из response example charge.
- `ThreeDsChallenge` — для bounce на AcsUrl.
- `Subscription`, `Order`, `TokenRecord`, `OrderStatus`, `CheckCallbackCode`.

## Авторизация

`new CloudPaymentsClient({ publicId, apiSecret })`. Внутри — `Basic base64(publicId:apiSecret)` в `Authorization` заголовке при каждом запросе. Никакого токен-менеджмента у CP нет — это не OAuth.

## Webhooks

CP шлёт POST с HMAC-SHA256 в заголовке `Content-HMAC` или `X-Content-HMAC` (base64, ключ = API Secret, сообщение = raw body).

```ts
import { verifyCheckWebhook, WebhookVerificationError } from "@onreza/cloudpayments-sdk/webhooks";
try {
  const payload = await verifyCheckWebhook({
    rawBody: req.body,
    signature: req.headers["content-hmac"],
    apiSecret: process.env.CP_API_SECRET,
  });
  // payload типизирован как CheckNotificationPayload
} catch (e) {
  if (e instanceof WebhookVerificationError) {
    // e.reason: "signature_mismatch" | "missing_signature" | "bad_body" | ...
  }
}
```

Типы уведомлений (7): Check, Pay, Fail, Confirm, Refund, Recurrent, Cancel.

## Обновление доки

CP меняет доку редко, но когда меняет — `bun run docs:sync` + ревью diff в `specs/ir.json` и `src/_generated/`.

- Появилось новое поле в таблице — попадёт в IR автоматически и в сгенерированный Request/payload interface.
- Появился новый endpoint — нужно добавить alias в `ENDPOINT_ALIASES` в `tools/gen.ts` (anchor → module + methodName) и ручной wrapper в соответствующий `modules/*.ts`.
- Response shape изменился — правим `src/types.ts` вручную.

Парсер терпим к артефактам в доке (напр. кривые названия заголовков типа "Пример формы" для endpoint post3ds) — переименование живёт в `ENDPOINT_ALIASES`, а не в парсере.

## Conventions

- **Минимум комментариев.** Только когда объясняют неочевидный *why*. Никаких «added for issue #X» и ритуальных JSDoc над тривиальными геттерами.
- **Никаких «Generated with Claude Code» футеров.**
- **Файлы/функции**: `camelCase`. Типы/классы: `PascalCase`. Константы: `SCREAMING_SNAKE`.
- **tsconfig строгий**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Не ослаблять.
- **Никаких `any` в публичных сигнатурах.** `unknown` + narrow через type guard.
- **WebCrypto везде**, не `node:crypto` (кроссрантаймность).
- **Публичный API** — только exports из `src/index.ts`, `src/webhooks/index.ts`, `src/errors/index.ts`. Всё остальное — internal.

## Интеграционные тесты

```bash
bun run test              # unit (27 тестов, быстро, без сети)
bun run test:integration  # integration (19 тестов, требует env + сеть + Chrome)
```

Все integration-тесты автоматически skip-ятся без `CP_TEST_PUBLIC_ID` и `CP_TEST_API_SECRET` в env (лежат в `.env`, gitignored).

### Что тестируется

- **Auth** — валидные/невалидные credentials, `CloudPaymentsAuthError` на 401.
- **Smoke** — `payments.test()`, несуществующие TransactionId/Subscription → `CloudPaymentsBusinessError`.
- **Orders** — полный lifecycle `create → cancel` (работает без карт).
- **Charge flow** (через Bun.WebView + Checkout.js):
  - одностадийка `chargeCryptogram → get → refund`
  - двухстадийка `authCryptogram → confirm → Completed`
  - двухстадийка `authCryptogram → void → Cancelled`
  - decline-карта → `CloudPaymentsBusinessError`
  - 3DS-карта → `CloudPayments3DsRequiredError` с `acsUrl`/`paReq`
- **Token flow** — `charge(SaveCard=true) → Token → chargeToken`.
- **Subscriptions lifecycle** — `create → get → findByAccount → update → cancel`.
- **Webhooks e2e** (self-signed) — наш же signer → `verifyWebhook`.

### Как работает Checkout.js в тестах

Helper `test/integration/helpers/cryptogram.ts` через **Bun.WebView** (Chrome backend, headless) грузит временную HTML-страницу с `<script src="https://checkout.cloudpayments.ru/checkout.js">`, вызывает `cp.Checkout.createPaymentCryptogram({cardNumber, expDateMonth, expDateYear, cvv})` — получает валидный `CardCryptogramPacket`. В проде SDK это НЕ делает — криптограмма генерится фронтом и передаётся как параметр.

Headless-режим: `new Bun.WebView({ backend: { type: "chrome", argv: ["--headless=new", "--disable-gpu", "--no-sandbox"] } })`. Без этого Chrome поднимал видимое окно и каждый раз спрашивал разрешить remote-debugging у основного профиля.

### Требования к ЛК тестового магазина

- **Выключить все webhook-уведомления** (особенно Check) — иначе CP перед авторизацией стучится на наш URL, не получает `{code:0}` и отклоняет с `ReasonCode=3006 CheckResponseServiceUnavailable`.
- **Включить «Сохранение токена карты»** — для token-flow и subscriptions тестов (иначе `Transaction.Token === null`).

### Тестовые карты

Из раздела `#testirovanie` документации CP (expDate любой будущий, CVV любой):

- `4000 0000 0000 3055` — Visa без 3DS, approved (charge/confirm/void/refund/token)
- `4242 4242 4242 4242` — Visa с 3DS, triggers 3DS challenge
- `4000 0566 5566 5556` — Visa, Insufficient Funds (decline)

Все карты в `test/integration/helpers/test-cards.ts`.

### Webhook-real test (opt-in)

`test/integration/webhooks-real.test.ts` — опциональный тест с реальным туннелем от CP на твой listener. Запускается **только** при `CP_WEBHOOK_RUN=1` (иначе skip). Нужны env `CP_WEBHOOK_PORT`, `CP_WEBHOOK_PUBLIC_URL`. Ограничение: CloudPayments validation в ЛК **не принимает URL с нестандартным портом** (например `:5083`) — нужен туннель на 80/443.

## Внешние ресурсы

- API docs: https://developers.cloudpayments.ru
- Prod base URL: `https://api.cloudpayments.ru`
- EU / KZ base URLs: в `src/_generated/meta.ts`
- Sandbox — не отдельный домен, а тестовые Public ID/Secret, см. раздел `#testirovanie` документации.
