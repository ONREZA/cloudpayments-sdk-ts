import { describe, expect, test } from "bun:test";
import {
	verifyCheckWebhook,
	verifyPayWebhook,
	verifyRecurrentWebhook,
	verifyWebhook,
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
		).rejects.toMatchObject({
			reason: "missing_signature",
			stage: "signature_verification",
			signatureVerified: false,
		});
	});

	test("throws on signature mismatch", async () => {
		await expect(
			verifyWebhook({
				rawBody: "TransactionId=",
				signature: "deadbeef",
				apiSecret: API_SECRET,
			}),
		).rejects.toMatchObject({
			reason: "signature_mismatch",
			stage: "signature_verification",
			signatureVerified: false,
		});
	});

	test("parses form-urlencoded body on valid signature", async () => {
		const body =
			"TransactionId=123&Amount=10.5&PaymentAmount=10.50&TestMode=1&Status=Completed" +
			"&AccountId=000123&InvoiceId=000456&CardFirstSix=012345&CardLastFour=0007" +
			"&Data=%7B%22source%22%3A%22sdk%22%7D";
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
		expect(payload.PaymentAmount).toBe("10.50");
		expect(payload.AccountId).toBe("000123");
		expect(payload.InvoiceId).toBe("000456");
		expect(payload.CardFirstSix).toBe("012345");
		expect(payload.CardLastFour).toBe("0007");
		expect(payload.Data).toEqual({ source: "sdk" });
	});

	test("parses JSON body when contentType=application/json", async () => {
		const body = JSON.stringify({ TransactionId: 77, Amount: 42 });
		const sig = await makeSig(API_SECRET, body);
		const payload = await verifyWebhook<{ TransactionId: number; Amount: number }>({
			rawBody: body,
			signature: sig,
			apiSecret: API_SECRET,
			contentType: "application/json; charset=utf-8",
		});
		expect(payload.TransactionId).toBe(77);
		expect(payload.Amount).toBe(42);
	});

	test("classifies malformed signed JSON as an authenticated parse failure", async () => {
		const body = "{";
		const sig = await makeSig(API_SECRET, body);

		await expect(
			verifyWebhook({
				rawBody: body,
				signature: sig,
				apiSecret: API_SECRET,
				contentType: "application/json",
			}),
		).rejects.toMatchObject({
			reason: "bad_body",
			stage: "body_parsing",
			signatureVerified: true,
		});
	});

	test("classifies an unsupported content type before signature verification", async () => {
		await expect(
			verifyWebhook({
				rawBody: "TransactionId=1",
				signature: "not-verified",
				apiSecret: API_SECRET,
				contentType: "text/plain",
			}),
		).rejects.toMatchObject({
			reason: "bad_content_type",
			stage: "pre_verification",
			signatureVerified: false,
		});
	});

	test("verifies X-Content-HMAC against decoded form body", async () => {
		const body = "AccountId=user%2B42&Description=Hello+World";
		const decodedBody = "AccountId=user+42&Description=Hello World";
		const sig = await makeSig(API_SECRET, decodedBody);

		const payload = await verifyWebhook<{ AccountId: string; Description: string }>({
			rawBody: body,
			signature: sig,
			signatureKind: "x-content-hmac",
			apiSecret: API_SECRET,
		});

		expect(payload).toEqual({ AccountId: "user+42", Description: "Hello World" });
	});

	test("coerces form values from the generated webhook schema", async () => {
		const body =
			"Amount=10.5&Period=2&RequireConfirmation=true" +
			"&CustomFields=%5B%7B%22name%22%3A%22source%22%7D%5D";
		const sig = await makeSig(API_SECRET, body);

		const payload = await verifyWebhook<{
			Amount: number;
			Period: number;
			RequireConfirmation: boolean;
			CustomFields: unknown[];
		}>({
			rawBody: body,
			signature: sig,
			apiSecret: API_SECRET,
		});

		expect(payload).toEqual({
			Amount: 10.5,
			Period: 2,
			RequireConfirmation: true,
			CustomFields: [{ name: "source" }],
		});
	});

	test("omits empty optional numeric fields from a signed Pay webhook", async () => {
		const body = "TransactionId=123&ProcessorAndPartnerFee=&FallBackScenarioDeclinedTransactionId=";
		const sig = await makeSig(API_SECRET, body);

		const payload = await verifyPayWebhook({
			rawBody: body,
			signature: sig,
			apiSecret: API_SECRET,
		});

		expect(payload.TransactionId).toBe(123);
		expect("ProcessorAndPartnerFee" in payload).toBe(false);
		expect("FallBackScenarioDeclinedTransactionId" in payload).toBe(false);
	});

	test("preserves zero in an optional numeric field", async () => {
		const body = "ProcessorAndPartnerFee=0";
		const sig = await makeSig(API_SECRET, body);

		const payload = await verifyPayWebhook({
			rawBody: body,
			signature: sig,
			apiSecret: API_SECRET,
		});

		expect(payload.ProcessorAndPartnerFee).toBe(0);
	});

	test("does not omit malformed optional field values", async () => {
		for (const body of [
			"ProcessorAndPartnerFee=%20",
			"ProcessorAndPartnerFee=invalid",
			"Data=%7B",
		]) {
			const sig = await makeSig(API_SECRET, body);

			await expect(
				verifyPayWebhook({
					rawBody: body,
					signature: sig,
					apiSecret: API_SECRET,
				}),
			).rejects.toMatchObject({
				reason: "bad_body",
				stage: "body_parsing",
				signatureVerified: true,
			});
		}
	});

	test("rejects an empty required numeric field after signature verification", async () => {
		const body = "TransactionId=";
		const sig = await makeSig(API_SECRET, body);

		await expect(
			verifyPayWebhook({
				rawBody: body,
				signature: sig,
				apiSecret: API_SECRET,
			}),
		).rejects.toMatchObject({
			reason: "bad_body",
			stage: "body_parsing",
			signatureVerified: true,
		});
	});

	test("rejects an empty required boolean field after signature verification", async () => {
		const body = "RequireConfirmation=";
		const sig = await makeSig(API_SECRET, body);

		await expect(
			verifyRecurrentWebhook({
				rawBody: body,
				signature: sig,
				apiSecret: API_SECRET,
			}),
		).rejects.toMatchObject({
			reason: "bad_body",
			stage: "body_parsing",
			signatureVerified: true,
		});
	});

	test("does not authenticate a malformed X-Content-HMAC body", async () => {
		await expect(
			verifyWebhook({
				rawBody: "Description=%",
				signature: "not-verified",
				signatureKind: "x-content-hmac",
				apiSecret: API_SECRET,
			}),
		).rejects.toMatchObject({
			reason: "bad_body",
			stage: "signature_verification",
			signatureVerified: false,
		});
	});
});
