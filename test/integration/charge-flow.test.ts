/**
 * End-to-end charge flow через реальный CP API.
 *
 * Требует:
 *  - CP_TEST_PUBLIC_ID / CP_TEST_API_SECRET
 *  - Выключенные Check-уведомления в ЛК тестового магазина (иначе CP вернёт
 *    ReasonCode=3006 CheckResponseServiceUnavailable, если URL недоступен)
 *  - Bun.WebView + Chrome в PATH (для генерации криптограммы)
 *
 * Покрытие:
 *  - Одностадийка: chargeCryptogram → Transaction с Status="Completed"
 *  - 3DS detection: charge с картой 4242 → CloudPayments3DsRequiredError
 *  - Decline: charge картой 4000...5556 → CloudPaymentsBusinessError
 *  - get(TransactionId) → та же транзакция
 *  - refund частичный → новый TransactionId
 *  - Двухстадийка: authCryptogram → confirm → Transaction с Status="Completed"
 *  - void: authCryptogram → void → Status="Cancelled"
 */
import { describe, expect, test } from "bun:test";
import {
	CloudPayments3DsRequiredError,
	CloudPaymentsBusinessError,
} from "../../src/errors/index.js";
import { generateCryptogram } from "./helpers/cryptogram.js";
import { TEST_CARDS } from "./helpers/test-cards.js";
import { CP_TEST_PUBLIC_ID, HAS_CREDS, makeTestClient } from "./setup.js";

async function cryptogramFor(card: (typeof TEST_CARDS)[keyof typeof TEST_CARDS]): Promise<string> {
	return generateCryptogram({ publicId: CP_TEST_PUBLIC_ID, card });
}

describe.skipIf(!HAS_CREDS)("integration: charge flow (real CP, Bun.WebView cryptogram)", () => {
	test("chargeCryptogram → approved, then get → refund", async () => {
		const cp = makeTestClient();
		const cryptogram = await cryptogramFor(TEST_CARDS.visaNo3dsApproved);

		const tx = await cp.payments.chargeCryptogram({
			Amount: 10,
			Currency: "RUB",
			IpAddress: "127.0.0.1",
			CardCryptogramPacket: cryptogram,
			AccountId: `sdk-charge-${Date.now()}`,
			Description: "sdk integration: one-step charge",
		});

		expect(tx.Status).toBe("Completed");
		expect(tx.Amount).toBe(10);
		expect(tx.Currency).toBe("RUB");
		expect(tx.CardFirstSix).toBe("400000");
		expect(tx.CardLastFour).toBe("3055");
		expect(typeof tx.TransactionId).toBe("number");

		const fetched = await cp.payments.get({ TransactionId: tx.TransactionId });
		expect(fetched.TransactionId).toBe(tx.TransactionId);
		expect(fetched.Status).toBe("Completed");

		const refund = await cp.payments.refund({ TransactionId: tx.TransactionId, Amount: 5 });
		expect(typeof refund.TransactionId).toBe("number");
		expect(refund.TransactionId).not.toBe(tx.TransactionId);
	}, 60_000);

	test("chargeCryptogram with 3DS card → CloudPayments3DsRequiredError", async () => {
		const cp = makeTestClient();
		const cryptogram = await cryptogramFor(TEST_CARDS.visa3dsApproved);

		try {
			await cp.payments.chargeCryptogram({
				Amount: 10,
				Currency: "RUB",
				IpAddress: "127.0.0.1",
				CardCryptogramPacket: cryptogram,
				AccountId: `sdk-3ds-${Date.now()}`,
				Description: "sdk integration: 3DS challenge",
			});
			throw new Error("expected 3DS rejection");
		} catch (err) {
			expect(err).toBeInstanceOf(CloudPayments3DsRequiredError);
			const e = err as CloudPayments3DsRequiredError;
			expect(typeof e.transactionId).toBe("number");
			expect(e.acsUrl).toMatch(/^https?:\/\//);
			expect(typeof e.paReq).toBe("string");
			expect(e.paReq.length).toBeGreaterThan(0);
		}
	}, 60_000);

	test("chargeCryptogram with decline card → CloudPaymentsBusinessError", async () => {
		const cp = makeTestClient();
		const cryptogram = await cryptogramFor(TEST_CARDS.visaNo3dsDecline);

		try {
			await cp.payments.chargeCryptogram({
				Amount: 10,
				Currency: "RUB",
				IpAddress: "127.0.0.1",
				CardCryptogramPacket: cryptogram,
				AccountId: `sdk-decline-${Date.now()}`,
				Description: "sdk integration: decline",
			});
			throw new Error("expected decline");
		} catch (err) {
			expect(err).toBeInstanceOf(CloudPaymentsBusinessError);
			const e = err as CloudPaymentsBusinessError;
			// Реальные коды ошибок CP — у нас они в справочнике ReasonCode.
			// InsufficientFunds = 5051, но в CP test-sandbox может быть другим.
			expect(typeof e.reasonCode).toBe("number");
			const model = e.model as { Reason?: string; Status?: string } | null;
			expect(model?.Status).toBe("Declined");
			expect(model?.Reason).toBeDefined();
		}
	}, 60_000);

	test("two-step: authCryptogram → confirm → Completed", async () => {
		const cp = makeTestClient();
		const cryptogram = await cryptogramFor(TEST_CARDS.visaNo3dsApproved);

		const authorized = await cp.payments.authCryptogram({
			Amount: 20,
			Currency: "RUB",
			IpAddress: "127.0.0.1",
			CardCryptogramPacket: cryptogram,
			AccountId: `sdk-auth-${Date.now()}`,
			Description: "sdk integration: two-step auth",
		});
		expect(authorized.Status).toBe("Authorized");

		await cp.payments.confirm({
			TransactionId: authorized.TransactionId,
			Amount: 20,
		});

		const final = await cp.payments.get({ TransactionId: authorized.TransactionId });
		expect(final.Status).toBe("Completed");
	}, 60_000);

	test("two-step: authCryptogram → void → Cancelled", async () => {
		const cp = makeTestClient();
		const cryptogram = await cryptogramFor(TEST_CARDS.visaNo3dsApproved);

		const authorized = await cp.payments.authCryptogram({
			Amount: 30,
			Currency: "RUB",
			IpAddress: "127.0.0.1",
			CardCryptogramPacket: cryptogram,
			AccountId: `sdk-void-${Date.now()}`,
			Description: "sdk integration: void after auth",
		});
		expect(authorized.Status).toBe("Authorized");

		await cp.payments.void({ TransactionId: authorized.TransactionId });

		const final = await cp.payments.get({ TransactionId: authorized.TransactionId });
		expect(final.Status).toBe("Cancelled");
	}, 60_000);
});
