# @onreza/cloudpayments-sdk

Типизированный TypeScript SDK для [API CloudPayments](https://developers.cloudpayments.ru) и [CloudKassir](https://developers.cloudkassir.ru). Требует Node.js 24+; package artifact проверяется на минимальном и актуальном Node 24, unit-контракты — в Bun. Транспорт использует стандартные `fetch` и WebCrypto API.
Публикуется один ESM artifact; `require()` поддержан встроенным в Node 24 механизмом `require(esm)`.

- ✅ 1:1 с распознанными API-адресами официальной документации — 49 методов и 8 типов webhook-уведомлений
- ✅ Строгая типизация запросов и ответов: `Transaction`, `Subscription`, `Order`, `TokenRecord`, `ThreeDsChallenge`
- ✅ Типизированные Widget, PaymentBlocks и Checkout через отдельный browser subpath
- ✅ Union-типы из справочников: `Currency`, `ReasonCode`, `TransactionStatus`, `CultureName`, …
- ✅ Кроссрантайм WebCrypto для HMAC верификации webhook'ов
- ✅ Безопасный retry: read-only операции и mutation с `X-Request-ID`
- ✅ Идемпотентность через `X-Request-ID`
- ✅ Автоматическое распознавание 3-D Secure challenge → `CloudPayments3DsRequiredError`

## Установка

```bash
npm install @onreza/cloudpayments-sdk
# или
bun add @onreza/cloudpayments-sdk
```

## Браузерные интеграции

Browser API вынесены в `@onreza/cloudpayments-sdk/browser`. Импорт безопасен для
SSR: `document` используется только при явном вызове загрузчика. Скрипты всегда
загружаются с официальных CloudPayments CDN; произвольный URL загрузчик не
принимает.

### Платёжный Widget

```ts
import { loadCloudPaymentsWidget } from "@onreza/cloudpayments-sdk/browser";

const { CloudPayments } = await loadCloudPaymentsWidget({ nonce: cspNonce });
const widget = new CloudPayments();
const result = await widget.start({
  publicTerminalId: "test_api_00000000000000000000002",
  amount: 1_001,
  currency: "RUB",
  paymentSchema: "Single",
  description: "Заказ #42",
  externalId: "order-42",
});
```

SDK намеренно типизирует только современный `start()`: устаревшие
`pay`/`charge`/`auth` не входят в публичный контракт. Для управления актуальным
виджетом доступны `close` и коллбэки экземпляра.

### Платёжный конструктор PaymentBlocks

```ts
import { loadCloudPaymentsPaymentBlocks } from "@onreza/cloudpayments-sdk/browser";

const { PaymentBlocks } = await loadCloudPaymentsPaymentBlocks();
const blocks = new PaymentBlocks({
  publicTerminalId: "test_api_00000000000000000000002",
  amount: 1_001,
  currency: "RUB",
  paymentSchema: "Single",
});
blocks.on("success", (result) => console.log(result.data?.transactionId));
blocks.mount(document.getElementById("payment-form")!);
```

### Checkout и криптограмма

```ts
import { loadCloudPaymentsCheckout } from "@onreza/cloudpayments-sdk/browser";

const { Checkout } = await loadCloudPaymentsCheckout();
const checkout = new Checkout({ publicId: "test_api_00000000000000000000002" });
const cryptogram = await checkout.createPaymentCryptogram({
  cardNumber: "4242 4242 4242 4242",
  expDateMonthYear: "12/30",
  cvv: "911",
});
```

Checkout необходимо загружать именно с CDN CloudPayments. Не копируйте и не
собирайте `checkout.js` внутрь своего bundle; требования HTTPS, PCI DSS и запрет
на хранение криптограммы остаются ответственностью интеграции. Устаревшие
positional-конструктор и `createCryptogramPacket()` намеренно не типизированы.

## Быстрый старт

### 1. Инициализация клиента

```ts
import { CloudPaymentsClient } from "@onreza/cloudpayments-sdk";

const cp = new CloudPaymentsClient({
  publicId: process.env.CP_PUBLIC_ID!,
  apiSecret: process.env.CP_API_SECRET!,
});
```

### Публичный API Долями

Этот endpoint не использует API Secret и поэтому намеренно доступен через
отдельный клиент, который не отправляет `Authorization`:

```ts
import { CloudPaymentsPublicClient } from "@onreza/cloudpayments-sdk";

const publicCp = new CloudPaymentsPublicClient();
const payment = await publicCp.dolyame.createPaymentLink(
  {
    PublicId: "pk_0fe1d5c9cb47e8cf8d96102201419",
    AltPayType: "TcsBnplDolyame",
    Amount: 1_000,
    Scheme: "1",
    InvoiceId: "order-42",
  },
  { idempotencyKey: "dolyame-order-42" },
);

res.redirect(payment.Link);
```

### 2. Оплата по криптограмме

```ts
import {
  CloudPaymentsClient,
  CloudPayments3DsRequiredError,
  CloudPaymentsBusinessError,
} from "@onreza/cloudpayments-sdk";

try {
  const tx = await cp.payments.chargeCryptogram(
    {
      Amount: 100,
      Currency: "RUB",
      IpAddress: req.ip,
      CardCryptogramPacket: req.body.cryptogram, // от Checkout.js на фронте
      AccountId: "user_123",
      Description: "Заказ #42",
    },
    { idempotencyKey: "payment-order-42" },
  );
  // tx.Status === "Completed", tx.TransactionId, tx.Token, …
} catch (err) {
  if (err instanceof CloudPayments3DsRequiredError) {
    // Редирект плательщика на err.acsUrl с передачей MD=transactionId, PaReq=err.paReq
    res.render("3ds-redirect", { acsUrl: err.acsUrl, md: err.transactionId, paReq: err.paReq });
  } else if (err instanceof CloudPaymentsBusinessError) {
    // err.reasonCode — числовой код из справочника ReasonCode (5051, 5206, …)
    // err.apiErrorCode — отдельный верхнеуровневый ErrorCode ответа API, если он был
    // err.model — Transaction с деталями отказа
    console.error("Отказ:", err.apiMessage, "code:", err.reasonCode);
  }
}
```

### 3. Завершение 3-D Secure

После того как плательщик вернулся с TermUrl с `PaRes`:

```ts
const tx = await cp.payments.post3ds(
  {
    TransactionId: Number(req.body.MD),
    PaRes: req.body.PaRes,
  },
  { idempotencyKey: `post3ds-${req.body.MD}` },
);
```

### 4. Webhook handler

CloudPayments и CloudKassir шлют уведомления разных типов (Check/Pay/Fail/Confirm/Refund/Recurrent/Cancel/Receipt) на разные URL. Заголовок подписи — `Content-HMAC` (или `X-Content-HMAC`).

```ts
import { verifyCheckWebhook, WebhookVerificationError } from "@onreza/cloudpayments-sdk/webhooks";

app.post("/cp-webhook/check", async (req, res) => {
  const contentHmac = req.get("content-hmac");
  const signature = contentHmac ?? req.get("x-content-hmac");

  try {
    const payload = await verifyCheckWebhook({
      rawBody: req.rawBody, // сырое тело — НЕ parsed JSON
      signature,
      signatureKind: contentHmac ? "content-hmac" : "x-content-hmac",
      apiSecret: process.env.CP_API_SECRET!,
      contentType: req.get("content-type"),
    });
    // payload типизирован как CheckNotificationPayload
    res.json({ code: 0 }); // одобряем платёж
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      console.warn("Reject webhook:", e.reason);
      // Authenticated parse failure можно retry; поддельную подпись — нельзя.
      res.status(e.signatureVerified ? 500 : 401).end();
    } else {
      throw e;
    }
  }
});
```

### 5. Рекуррентные подписки

```ts
// 1. Сначала сделать charge с SaveCard=true, получить Token
const initial = await cp.payments.chargeCryptogram(
  {
    Amount: 100,
    Currency: "RUB",
    IpAddress: req.ip,
    CardCryptogramPacket: req.body.cryptogram,
    AccountId: "user_123",
    SaveCard: true,
  },
  { idempotencyKey: "initial-user-123" },
);

// 2. Создать подписку
const sub = await cp.subscriptions.create(
  {
    Token: initial.Token!,
    AccountId: "user_123",
    Description: "Месячная подписка Pro",
    Email: "user@example.com",
    Amount: 499,
    Currency: "RUB",
    RequireConfirmation: false,
    StartDate: new Date().toISOString(),
    Interval: "Month",
    Period: 1,
  },
  { idempotencyKey: "subscription-user-123" },
);
```

### 6. Разовое списание по сохранённому токену

```ts
const tx = await cp.payments.chargeToken(
  {
    Amount: 499,
    Currency: "RUB",
    AccountId: "user_123",
    Token: savedToken,
    TrInitiatorCode: 0, // 0 — инициирован ТСП, 1 — пользователем
    PaymentScheduled: 0, // 0 — без расписания
  },
  { idempotencyKey: "renewal-subscription-42-period-7" },
);
```

### 7. Онлайн-чек CloudKassir

```ts
const submitted = await cp.kkt.submitReceipt(
  {
    Inn: "7700000000",
    Type: "Income",
    InvoiceId: "order-42",
    CustomerReceipt: {
      Items: [
        { label: "Подписка Pro", price: 499, quantity: 1, amount: 499, vat: 20 },
      ],
      taxationSystem: 0,
      amounts: { electronic: 499 },
    },
  },
  { idempotencyKey: "receipt-order-42" },
);

const status = await cp.kkt.getReceiptStatus({ Id: submitted.Id });
// status.Status: "Processed" | "Error" | "Queued" | "NotFound"
// status.Warnings содержит эксплуатационные предупреждения кассы.
```

## Модули клиента

- `cp.payments` — оплата, выплаты, 3DS, просмотр/выгрузка транзакций
- `cp.subscriptions` — create / get / findByAccount / update / cancel
- `cp.orders` — счета с оплатой по email-ссылке
- `cp.settings` — настройки уведомлений в ЛК
- `cp.escrow` — сведения о безопасных сделках
- `cp.tPay`, `cp.sbp`, `cp.sberPay` — ссылки и QR для альтернативных способов оплаты
- `cp.kkt` — чеки, чеки коррекции, маркировка и состояние касс CloudKassir
- `new CloudPaymentsPublicClient().dolyame` — публичная ссылка на оплату Долями без Basic Auth

## Обработка ошибок

Иерархия (все наследуются от `CloudPaymentsError`):

| Класс | Когда |
|---|---|
| `CloudPaymentsNetworkError` | DNS, connection или timeout для read/idempotent запроса |
| `CloudPaymentsUnknownOutcomeError` | Mutation без idempotency key получила неоднозначный network/5xx или неполный успешный ответ; перед повтором нужна сверка |
| `CloudPaymentsHttpError` | HTTP non-2xx (до разбора тела) |
| `CloudPaymentsAuthError` | 401 — неверный publicId/apiSecret |
| `CloudPaymentsRateLimitError` | 429 — превышен лимит CP (5/30 concurrent) |
| `CloudPaymentsBusinessError` | `{Success:false}` от CP; сохраняет `Message`, `Model`, `ReasonCode` и отдельный `ErrorCode` |
| `CloudPayments3DsRequiredError` | Требуется 3-D Secure; содержит `acsUrl` + `paReq` + `transactionId` |
| `CloudPaymentsSdkError` | Внутренние инварианты SDK |

## Справочники и типы

Все перечисления CP доступны как union-типы и label-maps:

```ts
import {
  type TransactionStatus,    // "AwaitingAuthentication" | "Authorized" | "Completed" | "Cancelled" | "Declined"
  type ReasonCode,           // 5001 | 5051 | ... 61 значение
  type Currency,             // "RUB" | "USD" | ... 28 валют
  type CultureName,          // "ru-RU" | "en-US" | "kk-KZ"
  transactionStatusLabels,   // { Authorized: "Авторизована", ... }
  reasonCodeLabels,          // { 5051: "Insufficient Funds", ... }
  currencyLabels,
} from "@onreza/cloudpayments-sdk";
```

## Расширенные опции

### Идемпотентность

```ts
await cp.payments.chargeCryptogram(body, {
  idempotencyKey: `order-${orderId}`, // X-Request-ID, результат кэшируется CP 1 час
});
```

### Retry override

```ts
const cp = new CloudPaymentsClient({
  publicId, apiSecret,
  retry: { maxAttempts: 5, baseDelayMs: 500 },
  timeoutMs: 30_000,
});

// Отключить retry для конкретного запроса
await cp.payments.get(body, { retry: false });
```

Mutation без `idempotencyKey` никогда не повторяется автоматически. При сетевом
обрыве, transient `5xx` или повреждённом успешном ответе SDK возвращает
`CloudPaymentsUnknownOutcomeError`: сначала сверяйте транзакцию через
`payments.get`/реестр, затем принимайте решение о новой операции.

### Региональный API

```ts
import { CloudPaymentsClient, CP_BASE_URL_KZ } from "@onreza/cloudpayments-sdk";

const cp = new CloudPaymentsClient({
  publicId,
  apiSecret,
  baseUrl: CP_BASE_URL_KZ,
});
```

Абсолютный URL другого origin отклоняется, чтобы Basic credentials нельзя было
случайно отправить внешнему сервису. HTTP redirects также отклоняются.

### Telemetry

Hooks получают URL, attempt, status и безопасные заголовки. `Authorization` и
request body не передаются. Ошибка hook не влияет на платёж; её можно получить
через `onHookError`.

### Кастомный fetch

```ts
const cp = new CloudPaymentsClient({
  publicId, apiSecret,
  fetch: customFetch,
});
```

### Отмена запроса

```ts
const ctrl = new AbortController();
const promise = cp.payments.listByDay({ Date: "2026-04-22" }, { signal: ctrl.signal });
setTimeout(() => ctrl.abort(), 5000);
```

Причина пользовательского abort пробрасывается без подмены на SDK-ошибку.

## Документация

- Полная документация CloudPayments: https://developers.cloudpayments.ru
- Документация Widget: https://widget.cloudpayments.ru/docs/widget.html
- Полная документация CloudKassir: https://developers.cloudkassir.ru
- Архитектура SDK и внутреннее устройство: см. [CLAUDE.md](./CLAUDE.md)
- Примеры: [examples/](./examples/)

## Лицензия

MIT © ONREZA
