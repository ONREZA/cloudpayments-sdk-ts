# @onreza/cloudpayments-sdk

Типизированный TypeScript SDK для [API CloudPayments](https://developers.cloudpayments.ru). Работает в Node 18+, Bun, Deno, Cloudflare Workers (WebCrypto + fetch).

- ✅ 1:1 с документацией CP — все 25+ методов, 7 типов webhook-уведомлений, 10 справочников
- ✅ Строгая типизация запросов и ответов: `Transaction`, `Subscription`, `Order`, `TokenRecord`, `ThreeDsChallenge`
- ✅ Union-типы из справочников: `Currency`, `ReasonCode`, `TransactionStatus`, `CultureName`, …
- ✅ Кроссрантайм WebCrypto для HMAC верификации webhook'ов
- ✅ Retry на 5xx/429/network с экспоненциальным backoff + full jitter
- ✅ Идемпотентность через `X-Request-ID`
- ✅ Автоматическое распознавание 3-D Secure challenge → `CloudPayments3DsRequiredError`

## Установка

```bash
npm install @onreza/cloudpayments-sdk
# или
bun add @onreza/cloudpayments-sdk
```

## Быстрый старт

### 1. Инициализация клиента

```ts
import { CloudPaymentsClient } from "@onreza/cloudpayments-sdk";

const cp = new CloudPaymentsClient({
  publicId: process.env.CP_PUBLIC_ID!,
  apiSecret: process.env.CP_API_SECRET!,
});
```

### 2. Оплата по криптограмме

```ts
import {
  CloudPaymentsClient,
  CloudPayments3DsRequiredError,
  CloudPaymentsBusinessError,
} from "@onreza/cloudpayments-sdk";

try {
  const tx = await cp.payments.chargeCryptogram({
    Amount: 100,
    Currency: "RUB",
    IpAddress: req.ip,
    CardCryptogramPacket: req.body.cryptogram, // от Checkout.js на фронте
    AccountId: "user_123",
    Description: "Заказ #42",
  });
  // tx.Status === "Completed", tx.TransactionId, tx.Token, …
} catch (err) {
  if (err instanceof CloudPayments3DsRequiredError) {
    // Редирект плательщика на err.acsUrl с передачей MD=transactionId, PaReq=err.paReq
    res.render("3ds-redirect", { acsUrl: err.acsUrl, md: err.transactionId, paReq: err.paReq });
  } else if (err instanceof CloudPaymentsBusinessError) {
    // err.reasonCode — числовой код из справочника ReasonCode (5051, 5206, …)
    // err.model — Transaction с деталями отказа
    console.error("Отказ:", err.apiMessage, "code:", err.reasonCode);
  }
}
```

### 3. Завершение 3-D Secure

После того как плательщик вернулся с TermUrl с `PaRes`:

```ts
const tx = await cp.payments.post3ds({
  TransactionId: Number(req.body.MD),
  PaRes: req.body.PaRes,
});
```

### 4. Webhook handler

CloudPayments шлёт уведомления разных типов (Check/Pay/Fail/Confirm/Refund/Recurrent/Cancel) на разные URL. Заголовок подписи — `Content-HMAC` (или `X-Content-HMAC`).

```ts
import { verifyCheckWebhook, WebhookVerificationError } from "@onreza/cloudpayments-sdk/webhooks";

app.post("/cp-webhook/check", async (req, res) => {
  try {
    const payload = await verifyCheckWebhook({
      rawBody: req.rawBody, // сырое тело — НЕ parsed JSON
      signature: req.headers["content-hmac"],
      apiSecret: process.env.CP_API_SECRET!,
      contentType: "application/json",
    });
    // payload типизирован как CheckNotificationPayload
    res.json({ code: 0 }); // одобряем платёж
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      console.warn("Reject webhook:", e.reason);
      res.status(401).end();
    } else {
      throw e;
    }
  }
});
```

### 5. Рекуррентные подписки

```ts
// 1. Сначала сделать charge с SaveCard=true, получить Token
const initial = await cp.payments.chargeCryptogram({
  Amount: 100,
  Currency: "RUB",
  IpAddress: req.ip,
  CardCryptogramPacket: req.body.cryptogram,
  AccountId: "user_123",
  SaveCard: true,
});

// 2. Создать подписку
const sub = await cp.subscriptions.create({
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
});
```

### 6. Разовое списание по сохранённому токену

```ts
const tx = await cp.payments.chargeToken({
  Amount: 499,
  Currency: "RUB",
  AccountId: "user_123",
  Token: savedToken,
  TrInitiatorCode: 0, // 0 — инициирован ТСП, 1 — пользователем
  PaymentScheduled: 0, // 0 — без расписания
});
```

## Модули клиента

- `cp.payments` — оплата, выплаты, 3DS, просмотр/выгрузка транзакций
- `cp.subscriptions` — create / get / findByAccount / update / cancel
- `cp.orders` — счета с оплатой по email-ссылке
- `cp.settings` — настройки уведомлений в ЛК

## Обработка ошибок

Иерархия (все наследуются от `CloudPaymentsError`):

| Класс | Когда |
|---|---|
| `CloudPaymentsNetworkError` | DNS, connection, timeout, abort |
| `CloudPaymentsHttpError` | HTTP non-2xx (до разбора тела) |
| `CloudPaymentsAuthError` | 401 — неверный publicId/apiSecret |
| `CloudPaymentsRateLimitError` | 429 — превышен лимит CP (5/30 concurrent) |
| `CloudPaymentsBusinessError` | `{Success:false}` от CP с `Message` и/или `Model.ReasonCode` |
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

### Кастомный fetch (Cloudflare Workers, мок-тесты)

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

## Документация

- Полная документация CloudPayments: https://developers.cloudpayments.ru
- Архитектура SDK и внутреннее устройство: см. [CLAUDE.md](./CLAUDE.md)
- Примеры: [examples/](./examples/)

## Лицензия

MIT © ONREZA
