# Contributing

## Требования и команды

- Bun 1.4.4 из `packageManager`; CI читает ту же версию из `package.json`.
- Node 24+ — поддерживаемый runtime; tooling проверяется на актуальном Node 24.
- TypeScript 7 (`@typescript/native`) — строгая проверка исходников, тестов и tools.
  TypeScript 6 — compiler API генератора и сборка деклараций. Публичные типы
  проверяются обоими компиляторами в отдельно установленном npm-пакете.
- `lefthook` устанавливает hooks при `bun install`; для сообщений commits нужен
  [cocogitto](https://github.com/cocogitto/cocogitto).

```bash
bun install --frozen-lockfile
bun run format             # Bun fmt
bun run lint               # Oxlint; warnings также останавливают проверку
bun run lint:fix           # только безопасные автоисправления
bun run test:changed       # быстрые затронутые unit-тесты
bun run verify             # полный локальный контур, включая npm-архив
```

`test` запускает только offline unit-тесты с изоляцией файлов и `--parallel`.
`test:tools` проверяет генерацию, sync, lint и release-gates. `test:integration`
запускается отдельно и требует явного решения работать с провайдером.
Изолированные зависимости устанавливаются через Bun. Для установки без сети:
`bun pm fetch`, затем `bun install --offline --frozen-lockfile`.

## Устройство и источники API

`src/core/` отвечает за POST transport, replay safety, timeout и очередь;
`src/auth/` — Basic credentials; `src/modules/` — envelope и UX-обёртки;
`src/webhooks/` — HMAC и typed parsing; `src/browser/` — загрузчики Widget,
PaymentBlocks и Checkout. Публичные entry points: `src/index.ts`,
`src/webhooks/index.ts`, `src/errors/index.ts`, `src/browser/index.ts`.

У провайдеров нет OpenAPI. Pipeline: `tools/scrape.ts` → сохранённые HTML →
`tools/parse.ts` → IR → `tools/gen.ts` → `src/_generated/`. Оба источника
CloudPayments/CloudKassir и IR коммитятся. Вложенные request-модели остаются
в `src/models.ts`, response-модели — в `src/types.ts` и `src/kkt-types.ts`.
Их изменение проверяется по документации и наблюдаемому контракту.

```bash
bun run spec:fetch          # скачать оба HTML-источника
bun run spec:diff           # сравнить текущие и предыдущие IR
bun run spec:sync           # fetch + parse + gen + semantic report
bun run verify
```

Исторические `docs:scrape`, `docs:parse`, `docs:sync` остаются совместимыми
командами. Для одного источника: `bun tools/scrape.ts cloudkassir` и
`bun tools/parse.ts cloudkassir`.

Sync восстанавливает raw/IR/prev/generated при ошибке операции и удаляет stale
report. Exit 100 означает отсутствие новых изменений. Это rollback процесса,
не обещание crash-atomic файловой транзакции. `.prev` сохраняется для diff.

Два QR image метода T-Pay/SberPay больше не описаны в текущей HTML. Их прежние
контракты сохранены в `specs/compatibility-endpoints.json` с provenance.
Это не доказательство текущей доступности endpoint: не удаляйте публичные методы
и не расширяйте fallback на неизвестные URL без отдельного решения.
Новые обязательные поля, endpoints и изменения response требуют проверки SDK,
а не ослабления coverage gate.

## Проверки и релизы

CI использует тот же стандарт, что Tochka SDK: полный `verify`, npm-пакет на
минимальном Node 24.0.0, commits и заголовок PR. Актуальный Node 24 проверяется
в основном verify; Bun запускает tooling и отдельные consumer imports.
Сборка создаёт один ESM artifact; Node 24 `require(esm)` проверяется отдельно.
Публикуемые entry points проверяются по именам пакета, не абсолютным dist-путям.

GitHub Actions закреплены SHA, Bun — в `packageManager`. `main` принимает PR
с актуальной базой и обязательными проверками; force push и удаление запрещены.
CodeQL, Code Quality, secret scanning и push protection дополняют локальный lint.
Dependencies и Actions обновляет Dependabot; `.github/dependabot.yml` использует
экосистему `bun` для `bun.lock`.

Conventional commits обязательны; scope изменений SDK — `cloudpayments-sdk`.
Release Please обновляет версию, changelog и manifest. В 0.x breaking change
повышает minor. Полный verify точного release tag предшествует npm trusted
publishing OIDC с provenance. Публикация не должна зависеть только от сборки.

Sync и Release Please используют GitHub App: `SYNC_APP_CLIENT_ID` и
`SYNC_APP_PRIVATE_KEY`. Installation token ограничен `Contents: write` и
`Pull requests: write`; App запускает CI созданных PR. Значения secrets не
должны попадать в командную строку и логи. Preflight останавливает workflow,
если конфигурации App нет. Версии двух SDK выпускаются независимо.

## Интеграционные проверки

CloudPayments использует общий API-домен и тестовый терминал вместо отдельного
sandbox. Нужны `CP_TEST_PUBLIC_ID` и `CP_TEST_API_SECRET`; наличие credentials
не является разрешением выполнять платёжные операции.

```bash
bun run test:integration
```

Workflow `integration.yml` запускается вручную: read contract либо полный
mutation lifecycle. Полный набор использует environment `cloudpayments-test`.
Он включает charge/auth/confirm/void/refund, token flow, orders и subscriptions.
Расписание нельзя включать без отдельного решения и provisioning тестовой среды.

Криптограмма для тестов генерируется официальным Checkout.js через Bun.WebView
с headless Chrome, отдельной временной страницей и тестовыми картами из
`test/integration/helpers/test-cards.ts`. Production SDK не генерирует
криптограммы на backend и не включает Checkout.js в bundle.

Для тестового терминала отключите webhook-уведомления, особенно Check: иначе
провайдер может отклонить авторизацию с ReasonCode=3006. Для token/subscription
flow включите сохранение токена карты; иначе `Transaction.Token` может быть null.

`webhooks-real.test.ts` требует `CP_WEBHOOK_RUN=1`, `CP_WEBHOOK_PORT` и
`CP_WEBHOOK_PUBLIC_URL`, реальный туннель и ручную оплату. Валидация URL провайдера
требует внешнего порта 80/443. Self-signed webhook tests проверяют только наш
signer/verifier и не квалифицируют реальную доставку уведомления провайдером.

## Разбор ошибок

Для воспроизведения нужны версия SDK/runtime, операция и безопасный класс/код
ошибки. Не прикладывайте credentials, карточные данные, криптограммы, raw bodies
или токены. Сначала воспроизведите проблему offline через custom fetch и добавьте
регрессионный тест. Подтверждённый source fix, зелёный CI и опубликованный пакет —
отдельные этапы; после релиза проверьте установку и источник npm-артефакта.
Неопределённый исход платежа требует сверки, а не новой оплаты по возрасту ошибки.
