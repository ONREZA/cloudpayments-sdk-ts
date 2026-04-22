/**
 * End-to-end webhook flow: подписать body через WebCrypto (как это делает CP
 * на своей стороне), передать в verifyWebhook с тем же apiSecret — должно
 * пройти и вернуть типизированный payload. Этот тест не ходит в сеть, но он
 * лежит в integration/ чтобы проверять ещё и реальный apiSecret из env
 * (удостовериться что формат секрета не ломает подпись).
 */
import { describe, expect, test } from "bun:test";
import { verifyCheckWebhook, WebhookVerificationError } from "../../src/webhooks/index.js";
import { CP_TEST_API_SECRET, HAS_CREDS } from "./setup.js";

async function sign(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
	let bin = "";
	for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
	return btoa(bin);
}

describe.skipIf(!HAS_CREDS)("integration: webhooks e2e", () => {
	test("roundtrip form-urlencoded Check notification", async () => {
		const body =
			"TransactionId=42&Amount=100.50&Currency=RUB&Status=Completed&TestMode=1" +
			"&Email=test%40example.com&CardFirstSix=424242&CardLastFour=4242";
		const sig = await sign(CP_TEST_API_SECRET, body);

		const payload = await verifyCheckWebhook({
			rawBody: body,
			signature: sig,
			apiSecret: CP_TEST_API_SECRET,
		});

		expect(payload.TransactionId).toBe(42);
		expect(payload.Amount).toBe(100.5);
		expect(payload.Currency).toBe("RUB");
		expect(payload.Status).toBe("Completed");
		expect(payload.TestMode).toBe(1);
		expect(payload.Email).toBe("test@example.com");
	});

	test("tampered body → WebhookVerificationError signature_mismatch", async () => {
		const body = "TransactionId=1";
		const sig = await sign(CP_TEST_API_SECRET, body);
		try {
			await verifyCheckWebhook({
				rawBody: `${body}&Amount=9999`, // подменили после подписи
				signature: sig,
				apiSecret: CP_TEST_API_SECRET,
			});
			throw new Error("expected rejection");
		} catch (err) {
			expect(err).toBeInstanceOf(WebhookVerificationError);
			expect((err as WebhookVerificationError).reason).toBe("signature_mismatch");
		}
	});
});
