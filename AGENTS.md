# cloudpayments-sdk-ts

Назначение и публичный API — в [README.md](README.md), команды, устройство
репозитория, интеграционные проверки и релизы — в [CONTRIBUTING.md](CONTRIBUTING.md).

- Полная проверка перед завершением: `bun run verify`. Быстрая итерация:
  `bun run test:changed`; она не заменяет полный набор. Формат: `bun run format`.
- Generated-код обновляй только генератором из проверяемых источников `specs/`.
  `bun run spec:sync` обновляет источники и типы; проверяй семантический diff.
- Проверки используют TypeScript 7, инструменты генерации и декларации — TypeScript 6.
  Не объединяй роли без проверки compiler API и опубликованных consumer types.
- SDK выпускается как ESM для Node 24+, Bun и Workers. Используй fetch/WebCrypto;
  не добавляй Node-only зависимости в runtime. Строгие настройки типов не ослабляй.
- Публичные сигнатуры — без `any`; используй `unknown` с сужением типов.
- Автоматические повторы допустимы только при доказанной replay safety. Отмена,
  timeout и потерянный ответ mutation не доказывают отсутствие побочного эффекта.
- Не повторяй раньше `Retry-After`. Если задержка больше `maxDelayMs`, закончи
  повторы и сохрани исходную ошибку и запрошенную задержку.
- Unit-проверки не обращаются к провайдеру. Интеграционные платежи требуют явного
  разрешения и настроенной тестовой среды; не запускай их по наличию `.env`.
- Не отключай TLS и не выводи credentials, raw платёжные bodies или токены в логи.
- Комментарии и conventional commits — на английском; scope пакета — `cloudpayments-sdk`.

- Источник CP/CloudKassir — HTML → IR → generated; response-модели остаются ручными.
  Два QR-метода сохранены отдельным snapshot совместимости: не расширяй fallback
  на неизвестные endpoints и не удаляй методы только из-за исчезновения из доки.
- Basic credentials не выходят за выбранный origin и не отправляются при redirect.
  Публичный Dolyame использует отдельный транспорт без Authorization.
- CP хранит X-Request-ID один час; сохраняй этот предел и разделение read-only POST
  от mutation. User abort сохраняет reason; после отправки нужна сверка исхода.
- HMAC проверяется до parsing; Content-HMAC и X-Content-HMAC подписывают разные
  представления body. Сохраняй stage/signatureVerified при ошибках.
- Browser subpath безопасен для SSR. UI-result не подтверждает settlement;
  наблюдение повторно ждёт тот же Promise, не запускает новую оплату.
