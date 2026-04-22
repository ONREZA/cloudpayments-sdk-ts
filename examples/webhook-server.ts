/**
 * Webhook-сервер на Bun.serve, принимающий все 7 типов CP-уведомлений.
 *
 * CloudPayments шлёт разные типы на разные URL — настраивается в ЛК.
 * Рекомендуем pattern: `/cp/webhook/{type}` чтобы listener знал тип по path.
 *
 * Запуск:
 *   CP_API_SECRET=... bun examples/webhook-server.ts
 */
import {
	type AnyWebhookPayload,
	verifyCancelWebhook,
	verifyCheckWebhook,
	verifyConfirmWebhook,
	verifyFailWebhook,
	verifyPayWebhook,
	verifyRecurrentWebhook,
	verifyRefundWebhook,
	WebhookVerificationError,
} from "@onreza/cloudpayments-sdk/webhooks";

const API_SECRET = process.env.CP_API_SECRET ?? "";
if (!API_SECRET) throw new Error("CP_API_SECRET required");

const VERIFIERS = {
	check: verifyCheckWebhook,
	pay: verifyPayWebhook,
	fail: verifyFailWebhook,
	confirm: verifyConfirmWebhook,
	refund: verifyRefundWebhook,
	recurrent: verifyRecurrentWebhook,
	cancel: verifyCancelWebhook,
} as const;

type WebhookType = keyof typeof VERIFIERS;

function isKnownType(t: string): t is WebhookType {
	return t in VERIFIERS;
}

function handleEvent(type: WebhookType, payload: AnyWebhookPayload): { code: number } {
	switch (type) {
		case "check":
			// Проверьте InvoiceId / Amount / AccountId — вернуть code:0 для одобрения
			// или code:13 для отказа по любой причине.
			console.log(
				`[${type}] TransactionId=${(payload as { TransactionId: number }).TransactionId}`,
			);
			return { code: 0 };
		case "pay":
		case "confirm":
		case "refund":
		case "recurrent":
		case "cancel":
		case "fail":
			console.log(`[${type}]`, JSON.stringify(payload).slice(0, 200));
			return { code: 0 };
	}
}

const server = Bun.serve({
	port: Number(process.env.PORT ?? 8787),
	hostname: "0.0.0.0",
	async fetch(req) {
		const url = new URL(req.url);
		const type = url.pathname.replace(/^\/cp\/webhook\//, "").toLowerCase();
		if (!isKnownType(type)) return new Response("unknown type", { status: 404 });

		const signature = req.headers.get("content-hmac") ?? req.headers.get("x-content-hmac");
		const rawBody = await req.text();

		try {
			const payload = await VERIFIERS[type]({
				rawBody,
				signature,
				apiSecret: API_SECRET,
				// Убедитесь что формат совпадает с настройками в ЛК CP:
				contentType: "application/json",
			});
			const response = handleEvent(type, payload);
			return Response.json(response);
		} catch (err) {
			if (err instanceof WebhookVerificationError) {
				console.warn(`[${type}] rejected: ${err.reason}`);
				return new Response(err.message, { status: 401 });
			}
			console.error(`[${type}] handler error:`, err);
			return new Response("internal error", { status: 500 });
		}
	},
});

console.log(`Listening on http://0.0.0.0:${server.port}`);
console.log(`Configure in CP admin: https://your.domain/cp/webhook/{check|pay|fail|…}`);
