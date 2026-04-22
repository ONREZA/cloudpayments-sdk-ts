/**
 * Генерация CardCryptogramPacket через реальный CloudPayments Checkout.js.
 *
 * CP-криптограмма — это шифрованный RSA-2048 карточный пакет, привязанный к
 * PublicId терминала и к секретному ключу, загружаемому динамически из
 * `https://checkout.cloudpayments.ru/checkout.js`. Её нельзя подделать
 * офлайн — только запустить оригинальный скрипт в браузере с настоящими
 * карточными данными.
 *
 * Решение:
 *  1. Bun.serve отдаёт минимальный HTML, подгружающий Checkout.js
 *     (URL `http://127.0.0.1:<random-port>/` — Chromium считает localhost
 *     secure-context без TLS-сертификата).
 *  2. Bun.WebView (Chrome backend) грузит эту страницу, ждёт появления
 *     `window.cp.Checkout`, вызывает `createPaymentCryptogram` и кладёт
 *     результат на `window.__cp_cryptogram` через then/catch.
 *  3. Мы polling-ом достаём результат через evaluate.
 *
 * Если CP-сервер потом при charge отвергнет криптограмму из-за не-совпадения
 * TerminalUrl — используем явно переданный `terminalUrl` (по-умолчанию тот же
 * localhost URL, который должен быть whitelisted в ЛК для тестового терминала).
 */

export interface CardInput {
	/** "4242 4242 4242 4242" — пробелы игнорируются CP-скриптом. */
	cardNumber: string;
	/** "12" */
	expDateMonth: string;
	/** "30" — две цифры года. */
	expDateYear: string;
	/** "911" — произвольный CVV для тестовых карт. */
	cvv: string;
	/** Имя держателя латиницей (необязательно). */
	name?: string;
}

export interface GenerateCryptogramOptions {
	publicId: string;
	card: CardInput;
	/** Тайм-аут на ожидание инициализации checkout.js. Default 15000. */
	initTimeoutMs?: number;
	/** Тайм-аут на getting криптограммы. Default 15000. */
	cryptogramTimeoutMs?: number;
}

type BunServerHandle = ReturnType<typeof Bun.serve>;

const CHECKOUT_JS_URL = "https://checkout.cloudpayments.ru/checkout.js";

function makeHostingPage(): string {
	return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>cp-sdk-cryptogram</title>
</head>
<body>
  <div id="ready">loading…</div>
  <script src="${CHECKOUT_JS_URL}"></script>
  <script>
    (function () {
      function poll () {
        if (window.cp && typeof window.cp.Checkout === "function") {
          window.__cp_ready = true;
          document.getElementById("ready").textContent = "ready";
        } else {
          setTimeout(poll, 50);
        }
      }
      poll();

      // Вызывается из Node: window.__cp_run(publicIdJson, cardJson) — оба аргумента
      // это сериализованные JSON-строки, парсим сами.
      window.__cp_run = function (publicIdJson, cardJson) {
        window.__cp_cryptogram = undefined;
        window.__cp_error = undefined;
        window.__cp_done = false;
        try {
          var publicId = JSON.parse(publicIdJson);
          var card = JSON.parse(cardJson);
          var checkout = new cp.Checkout({ publicId: publicId });
          checkout.createPaymentCryptogram(card)
            .then(function (c) { window.__cp_cryptogram = c; window.__cp_done = true; })
            .catch(function (e) {
              var msg = (e && e.message) ? e.message : String(e);
              try { msg += " | " + JSON.stringify(e); } catch (_) {}
              window.__cp_error = msg;
              window.__cp_done = true;
            });
        } catch (e) {
          window.__cp_error = String(e);
          window.__cp_done = true;
        }
      };
    })();
  </script>
</body>
</html>`;
}

async function waitForCondition(
	view: InstanceType<typeof Bun.WebView>,
	expr: string,
	timeoutMs: number,
	pollMs = 100,
): Promise<unknown> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = await view.evaluate(expr);
		if (value) return value;
		await new Promise((r) => setTimeout(r, pollMs));
	}
	throw new Error(`timeout after ${timeoutMs}ms waiting for: ${expr}`);
}

export async function generateCryptogram(opts: GenerateCryptogramOptions): Promise<string> {
	const initTimeoutMs = opts.initTimeoutMs ?? 15_000;
	const cryptogramTimeoutMs = opts.cryptogramTimeoutMs ?? 15_000;

	const page = makeHostingPage();
	let server: BunServerHandle | null = null;
	try {
		server = Bun.serve({
			port: 0, // случайный свободный
			hostname: "127.0.0.1",
			fetch: () =>
				new Response(page, {
					headers: { "content-type": "text/html; charset=utf-8" },
				}),
		});
		const pageUrl = `http://127.0.0.1:${server.port}/`;

		// Headless-режим: чтобы Bun не поднимал видимое окно Chrome и не просил
		// разрешить remote-debugging к основному профилю пользователя.
		await using view = new Bun.WebView({
			width: 800,
			height: 600,
			backend: {
				type: "chrome",
				argv: ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
			},
		});
		await view.navigate(pageUrl);

		// 1. дождаться загрузки checkout.js
		await waitForCondition(view, "window.__cp_ready === true", initTimeoutMs);

		// 2. запустить генерацию криптограммы через функцию, заложенную в HTML.
		const publicIdJson = JSON.stringify(opts.publicId);
		const cardJson = JSON.stringify({
			cvv: opts.card.cvv,
			cardNumber: opts.card.cardNumber,
			expDateMonth: opts.card.expDateMonth,
			expDateYear: opts.card.expDateYear,
			...(opts.card.name ? { name: opts.card.name } : {}),
		});

		await view.evaluate(
			`window.__cp_run(${JSON.stringify(publicIdJson)}, ${JSON.stringify(cardJson)})`,
		);

		// 3. дождаться завершения
		await waitForCondition(view, "window.__cp_done === true", cryptogramTimeoutMs);

		const err = (await view.evaluate("window.__cp_error || null")) as string | null;
		if (err) throw new Error(`checkout.createPaymentCryptogram failed: ${err}`);

		const cryptogram = (await view.evaluate("window.__cp_cryptogram || null")) as string | null;
		if (!cryptogram || typeof cryptogram !== "string") {
			throw new Error("checkout.js returned empty cryptogram");
		}
		return cryptogram;
	} finally {
		server?.stop(true);
	}
}
