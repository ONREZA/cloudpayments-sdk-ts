/**
 * Общий setup для интеграционных тестов. Если переменные окружения
 * CP_TEST_PUBLIC_ID / CP_TEST_API_SECRET не заданы — весь suite SKIP-ится
 * (через `describe.skipIf`). Реальные вызовы идут в prod-домен api.cloudpayments.ru
 * с тестовыми credentials (CP не выделяет sandbox-домен, тестовый режим ≡ тестовый
 * терминал в ЛК).
 */
import { CloudPaymentsClient } from "../../src/index.js";

export const CP_TEST_PUBLIC_ID = process.env.CP_TEST_PUBLIC_ID ?? "";
export const CP_TEST_API_SECRET = process.env.CP_TEST_API_SECRET ?? "";
export const CP_WEBHOOK_PORT = Number(process.env.CP_WEBHOOK_PORT ?? "0");
export const CP_WEBHOOK_PUBLIC_URL = process.env.CP_WEBHOOK_PUBLIC_URL ?? "";

export const HAS_CREDS = Boolean(CP_TEST_PUBLIC_ID && CP_TEST_API_SECRET);
/**
 * Webhook-real тест opt-in: требует ручное действие (оплата через браузер)
 * и живой туннель. Запускается только если явно выставлен CP_WEBHOOK_RUN=1 —
 * иначе обычный прогон `bun test` занимал бы +180с таймаута.
 */
export const HAS_WEBHOOK_TUNNEL = Boolean(
	HAS_CREDS && CP_WEBHOOK_PORT > 0 && CP_WEBHOOK_PUBLIC_URL && process.env.CP_WEBHOOK_RUN === "1",
);

if (!HAS_CREDS) {
	console.log(
		"⊘ integration tests: skipping (set CP_TEST_PUBLIC_ID and CP_TEST_API_SECRET to run)",
	);
}

/** Фабрика клиента с тестовыми credentials и коротким timeout/retry для CI. */
export function makeTestClient() {
	return new CloudPaymentsClient({
		publicId: CP_TEST_PUBLIC_ID,
		apiSecret: CP_TEST_API_SECRET,
		timeoutMs: 15_000,
		retry: { maxAttempts: 2, baseDelayMs: 200, maxDelayMs: 1_000 },
	});
}

/**
 * Yesterday в формате `YYYY-MM-DD` — для list-методов. На CP listByDay
 * принимает дату UTC; используем вчера чтобы гарантированно «past».
 */
export function yesterdayIso(): string {
	const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
		d.getUTCDate(),
	).padStart(2, "0")}`;
}
