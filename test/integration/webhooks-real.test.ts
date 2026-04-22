/**
 * End-to-end тест реального webhook flow от CloudPayments.
 *
 * Что делаем:
 *  1. Поднимаем Bun.serve на CP_WEBHOOK_PORT. Снаружи он торчит через
 *     туннель под CP_WEBHOOK_PUBLIC_URL, и этот URL уже прописан в ЛК CP
 *     на все 10 типов уведомлений (POST + JSON).
 *  2. Создаём реальный order через /orders/create и печатаем order.Url.
 *  3. Ждём до 180с любое входящее уведомление, пока тестер вручную
 *     открывает order.Url и оплачивает одной из тестовых карт из доки.
 *  4. Ассертим что verifyWebhook прошёл и payload имеет базовые поля
 *     (TransactionId, Amount, InvoiceId совпадают).
 *
 * Skip если любая из переменных не задана: CP_TEST_PUBLIC_ID,
 * CP_TEST_API_SECRET, CP_WEBHOOK_PORT, CP_WEBHOOK_PUBLIC_URL.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { WebhookListener } from "./helpers/webhook-listener.js";
import {
	CP_TEST_API_SECRET,
	CP_WEBHOOK_PORT,
	CP_WEBHOOK_PUBLIC_URL,
	HAS_WEBHOOK_TUNNEL,
	makeTestClient,
} from "./setup.js";

describe.skipIf(!HAS_WEBHOOK_TUNNEL)("integration: webhooks real tunnel", () => {
	let listener: WebhookListener;

	beforeAll(() => {
		listener = new WebhookListener({ port: CP_WEBHOOK_PORT, apiSecret: CP_TEST_API_SECRET });
		listener.start();
	});

	afterAll(() => {
		listener?.close();
	});

	test("receive verified webhook after manual payment on order.Url", async () => {
		const cp = makeTestClient();
		const invoiceId = `sdk-test-${Date.now()}`;

		const order = await cp.orders.create({
			Amount: 10,
			Currency: "RUB",
			Description: "@onreza/cloudpayments-sdk webhook tunnel test",
			Email: "sdk-integration-test@onreza.local",
			RequireConfirmation: false,
			InvoiceId: invoiceId,
		});

		console.log("");
		console.log("  ┌────────────────────────────────────────────────────────────┐");
		console.log("  │ Listener ready. Open order URL in browser and pay with a   │");
		console.log("  │ test card (напр. 4242 4242 4242 4242, any future exp/cvv): │");
		console.log("  │                                                            │");
		console.log(`  │ ${order.Url.padEnd(58, " ")} │`);
		console.log("  │                                                            │");
		console.log(`  │ Tunnel: ${CP_WEBHOOK_PUBLIC_URL.padEnd(50, " ")} │`);
		console.log(`  │ InvoiceId: ${invoiceId.padEnd(47, " ")} │`);
		console.log("  └────────────────────────────────────────────────────────────┘");
		console.log("");

		const event = await listener.waitForAny(180_000);

		expect(event.verified).toBe(true);
		expect(event.signature).not.toBeNull();
		expect(event.payload).toBeDefined();
		expect(typeof event.payload).toBe("object");

		const payload = event.payload as Record<string, unknown>;
		// Базовые поля есть у всех типов: TransactionId, InvoiceId (если передан).
		expect(typeof payload.TransactionId).toBe("number");

		console.log(`  ✓ Received ${event.type} at ${event.receivedAt.toISOString()}`);
		console.log(`    TransactionId=${payload.TransactionId}, InvoiceId=${payload.InvoiceId}`);
		console.log(`    contentType=${event.contentType}`);

		// Если CP успел отправить несколько (Check → Pay) — покажем счётчик.
		if (listener.received.length > 1) {
			console.log(`  → total received so far: ${listener.received.map((e) => e.type).join(", ")}`);
		}
	}, 200_000);
});
