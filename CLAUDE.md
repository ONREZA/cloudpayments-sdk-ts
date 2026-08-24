# cloudpayments-sdk-ts

Типизированный TypeScript SDK для [API CloudPayments](https://developers.cloudpayments.ru) и [CloudKassir](https://developers.cloudkassir.ru). Публикуется как `@onreza/cloudpayments-sdk`. Требует Node.js 24+; package artifact проверяется на минимальном и актуальном Node 24, unit-контракты — в Bun. Runtime использует стандартные `fetch` и WebCrypto API.
Сборка содержит один ESM artifact; CommonJS-потребители используют встроенный в Node 24 `require(esm)`.

## Особенность проекта — нет OpenAPI

У CloudPayments и CloudKassir нет машинно-читаемой спецификации — только HTML-страницы. Поэтому тут реализован **свой pipeline scrape → IR → codegen** вместо `openapi-typescript`:

```
tools/scrape.ts → specs/{source}/raw.html  (fetch, sha256-guard)
tools/parse.ts  → specs/{source}/ir.json   (cheerio, walk by headings)
tools/gen.ts    → src/_generated/          (requests + handbooks + webhook payloads)
```

Оба IR (`specs/ir.json`, `specs/cloudkassir/ir.json`) **коммитятся в репо**. Они human-reviewable и diffable при обновлении документации. Никогда не редактируются руками.

## Сборка и запуск

```bash
bun install
bun run docs:scrape    # скачать CloudPayments HTML
bun tools/scrape.ts cloudkassir
bun run docs:parse     # CloudPayments HTML → IR
bun tools/parse.ts cloudkassir
bun run gen            # IR → src/_generated/
bun run docs:sync      # всё вместе (для CI)
bun run build          # tsdown: ESM + DTS, subpath exports
bun test               # bun test
bun run typecheck
bun run lint           # biome check .
bun run verify         # gen freshness + lint + typecheck + unit + build
bun run package:smoke  # pack + fresh install + import/require/subpath contracts
```

## Архитектура

```
cloudpayments-sdk-ts/      (плоская репа, не monorepo)
├─ src/
│  ├─ _generated/          # AUTO — tools/gen.ts, не редактировать
│  │  ├─ handbooks.ts      # TransactionStatus, ReasonCode, Currency, … + label-мапы
│  │  ├─ endpoints.ts      # Per-method Request interfaces + URL-константы + ENDPOINTS
│  │  ├─ webhook-payloads.ts # CloudPayments + Receipt payloads
│  │  ├─ meta.ts           # BASE_URL, package metadata, docs sha256
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
│  │  ├─ settings.ts       # getNotification/updateNotification (c {Type} substitution)
│  │  ├─ alternative-payments.ts # T-Pay, СБП и SberPay
│  │  ├─ escrow.ts         # безопасные сделки
│  │  └─ kkt.ts            # CloudKassir /kkt/*
│  ├─ webhooks/index.ts    # verifyWebhook + typed wrappers + WebhookVerificationError
│  ├─ errors/index.ts      # CloudPaymentsError иерархия + 3DsRequiredError + BusinessError
│  ├─ models.ts            # РУЧНЫЕ вложенные request-модели и чеки
│  ├─ kkt-types.ts         # РУЧНЫЕ CloudKassir response shapes
│  ├─ types.ts             # РУЧНЫЕ CloudPayments response shapes
│  ├─ client.ts            # CloudPaymentsClient — composition root
│  └─ index.ts             # публичные exports
├─ test/unit/              # быстрые contract-тесты без сети
├─ tools/                  # pipeline scrape→parse→gen
├─ specs/
│  ├─ raw.html             # (gitignored отдельно) скачанный HTML
│  ├─ ir.json              # CloudPayments IR, коммитится
│  └─ cloudkassir/         # raw.html + коммитящийся ir.json
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
│ HttpClient: Basic auth, replay-safe retry, timeout,  │
│ X-Request-ID, origin boundary, доменные ошибки       │
└───────────────────────────────────────────────────────┘
```

### Ключевые паттерны

- **API-ответы обёрнуты в `{ Success, Message?, Model? }`**. В модулях распаковываются через `BaseModule`; KKT дополнительно сохраняет `Warning`, `WarningCodes` и `Warnings`.
- **3DS detection** включён внутри charge/auth wrappers. Распознаётся по форме `Model: { AcsUrl, PaReq }`; пользователь не может случайно отключить этот endpoint-инвариант.
- **Идемпотентность**: через `opts.idempotencyKey` → заголовок `X-Request-ID`. CP хранит результат 1 час.
- **Retry**: read-only POST можно повторять. Mutation повторяется только с `idempotencyKey`; иначе timeout/network означает `CloudPaymentsUnknownOutcomeError` и требует сверки, а не replay.
- **Telemetry boundary**: hooks не получают `Authorization` и body; их исключения уходят в `onHookError` и не меняют результат запроса.
- **Origin ownership**: generated endpoints — относительные paths. `CloudPaymentsClient.baseUrl` выбирает RU/EU/KZ; абсолютный URL другого origin и HTTP redirects отклоняются до отправки Basic credentials.
- **AbortError** пользователя пробрасывается как есть; timeout безопасной операции заворачивается в `CloudPaymentsNetworkError`.
- **Webhook verify**: `Content-HMAC` считается по encoded body, `X-Content-HMAC` — по URL-decoded body. Form parser использует отдельную схему каждого типа уведомления; идентификаторы и части номера карты остаются строками.
- **TypeScript toolchain**: прямой typecheck запускается нативным TypeScript 7 через alias `@typescript/native`; `tsdown` использует TypeScript 6 с совместимым compiler API для DTS. Не объединять зависимости, пока tooling не поддерживает API TypeScript 7 без experimental warning.

## Тип-система

### Generated

- `*Request` — один interface на endpoint+URL, префиксованный модулем:
  - `PaymentsChargeCryptogramRequest`, `PaymentsAuthCryptogramRequest`, `SubscriptionsCreateRequest`, `OrdersCreateRequest` …
- `*_URL` — относительные SCREAMING_SNAKE_CASE path-константы:
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

CP шлёт POST с HMAC-SHA256 в заголовке `Content-HMAC` или `X-Content-HMAC`.
Первый подписывает encoded body, второй — URL-decoded body.
`WebhookVerificationError.signatureVerified` становится `true` только после
успешного HMAC: authenticated parse failure можно retry, mismatch подписи — нет.
Typed helpers дополнительно проверяют наличие обязательных полей и runtime-форму
чисел, boolean и JSON; generic `verifyWebhook<T>` выполняет только coercion.

```ts
import { verifyCheckWebhook, WebhookVerificationError } from "@onreza/cloudpayments-sdk/webhooks";
try {
  const contentHmac = req.headers["content-hmac"];
  const payload = await verifyCheckWebhook({
    rawBody: req.rawBody, // до body parser
    signature: contentHmac ?? req.headers["x-content-hmac"],
    signatureKind: contentHmac ? "content-hmac" : "x-content-hmac",
    apiSecret: process.env.CP_API_SECRET,
    contentType: req.headers["content-type"],
  });
  // payload типизирован как CheckNotificationPayload
} catch (e) {
  if (e instanceof WebhookVerificationError) {
    // e.reason: "signature_mismatch" | "missing_signature" | "bad_body" | ...
    // e.stage + e.signatureVerified безопасно разделяют retry-классы.
  }
}
```

Типы уведомлений (8): Check, Pay, Fail, Confirm, Refund, Recurrent, Cancel, Receipt.

## Обновление доки

Провайдеры меняют документацию редко, но когда меняют — `bun run docs:sync` + ревью обоих IR и `src/_generated/`.

- Появилось новое поле в таблице — попадёт в IR автоматически и в сгенерированный Request/payload interface.
- Появился новый endpoint — coverage gate остановит генерацию, пока не добавлены alias в `ENDPOINT_ALIASES` и ручной wrapper в соответствующий `modules/*.ts`.
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
bun run test              # unit, быстро и без сети
bun run test:integration  # provider integration; mutation flow требует env + сеть + Chrome
```

Все integration-тесты автоматически skip-ятся без `CP_TEST_PUBLIC_ID` и `CP_TEST_API_SECRET` в env (лежат в `.env`, gitignored).

`.github/workflows/integration.yml` вручную запускает read contract или полный
mutation lifecycle. Автоматическое расписание можно включать только после
provisioning `CP_TEST_PUBLIC_ID` и `CP_TEST_API_SECRET`; full suite использует
environment `cloudpayments-test`.

## CI и release

- `sync-docs.yml` создаёт PR через GitHub App, чтобы обычный `pull_request` CI реально запускался.
- `release.yml` переиспользует тот же App token: каждый push в `main` создаёт или обновляет Release Please PR, а его merge создаёт tag и GitHub Release.
- Required secrets: `SYNC_APP_CLIENT_ID`, `SYNC_APP_PRIVATE_KEY`. App нужны только `Contents: write` и `Pull requests: write` для этого репозитория; installation token запрашивает те же две permissions явно. Release Please запускается без labels, поэтому `Issues: write` не требуется.
- Workflow намеренно падает на preflight, если App secrets не provisioned: иначе docs PR создавался бы от `GITHUB_TOKEN`, а его CI снова не запускался бы.
- `CI` — единственный владелец verify для PR; sync workflow не дублирует проверки.
- Release Please PR меняет `CHANGELOG.md`, `package.json` и manifest; обязательный CI проверяет release candidate до merge.
- После создания GitHub Release publish job собирает точный tag и публикует его через npm trusted publishing OIDC + provenance.

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
- KKT API docs: https://developers.cloudkassir.ru
- Prod base URL: `https://api.cloudpayments.ru`
- EU / KZ base URLs: в `src/_generated/meta.ts`
- Sandbox — не отдельный домен, а тестовые Public ID/Secret, см. раздел `#testirovanie` документации.
