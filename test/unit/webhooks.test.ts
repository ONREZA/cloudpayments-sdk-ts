import { describe, expect, test } from "bun:test";
import {
	verifyCheckWebhook,
	verifyWebhook,
	WebhookVerificationError,
} from "../../src/webhooks/index.js";

const API_SECRET = "supersecret";

// HMAC-SHA256 + base64 эталон (рассчитан Bun.CryptoHasher для проверки совпадения):
async function makeSig(secret: string, body: string): Promise<string> {
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

describe("verifyWebhook", () => {
	test("throws on missing signature", async () => {
		await expect(
			verifyWebhook({ rawBody: "x=1", signature: null, apiSecret: API_SECRET }),
		).rejects.toBeInstanceOf(WebhookVerificationError);
	});

	test("throws on signature mismatch", async () => {
		await expect(
			verifyWebhook({
				rawBody: "TransactionId=1",
				signature: "deadbeef",
				apiSecret: API_SECRET,
			}),
		).rejects.toMatchObject({ reason: "signature_mismatch" });
	});

	test("parses form-urlencoded body on valid signature", async () => {
		const body = "TransactionId=123&Amount=10.5&TestMode=1&Status=Completed";
		const sig = await makeSig(API_SECRET, body);
		const payload = await verifyCheckWebhook({
			rawBody: body,
			signature: sig,
			apiSecret: API_SECRET,
		});
		expect(payload.TransactionId).toBe(123);
		expect(payload.Amount).toBe(10.5);
		expect(payload.TestMode).toBe(1);
		expect(payload.Status).toBe("Completed");
	});

	test("parses JSON body when contentType=application/json", async () => {
		const body = JSON.stringify({ TransactionId: 77, Amount: 42 });
		const sig = await makeSig(API_SECRET, body);
		const payload = await verifyWebhook<{ TransactionId: number; Amount: number }>({
			rawBody: body,
			signature: sig,
			apiSecret: API_SECRET,
			contentType: "application/json",
		});
		expect(payload.TransactionId).toBe(77);
		expect(payload.Amount).toBe(42);
	});
});
