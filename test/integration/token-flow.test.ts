/**
 * Token-flow — оплата по сохранённому токену (рекарринг-карта без криптограммы).
 *
 *  1. Исходный charge с SaveCard=true → получаем Token в ответе
 *  2. chargeToken({ Token }) → transaction без Checkout.js
 */
import { describe, expect, test } from "bun:test";
import { generateCryptogram } from "./helpers/cryptogram.js";
import { TEST_CARDS } from "./helpers/test-cards.js";
import { CP_TEST_PUBLIC_ID, HAS_CREDS, makeTestClient } from "./setup.js";

describe.skipIf(!HAS_CREDS)("integration: token flow", () => {
	test("charge with SaveCard=true → Token → chargeToken", async () => {
		const cp = makeTestClient();
		const accountId = `sdk-token-${Date.now()}`;

		// Шаг 1: первичный charge. CP возвращает Token при SaveCard=true, но
		// только если в ЛК включена опция «Сохранение токена карты».
		// Если выключено — Token будет null, тест честно фейлится как нотификация.
		const cryptogram = await generateCryptogram({
			publicId: CP_TEST_PUBLIC_ID,
			card: TEST_CARDS.visaNo3dsApproved,
		});
		const initial = await cp.payments.chargeCryptogram({
			Amount: 10,
			Currency: "RUB",
			IpAddress: "127.0.0.1",
			CardCryptogramPacket: cryptogram,
			AccountId: accountId,
			SaveCard: true,
			Description: "sdk integration: initial charge with SaveCard",
		});
		expect(initial.Status).toBe("Completed");
		expect(initial.Token).toBeTruthy();

		if (!initial.Token) {
			throw new Error(
				"Token not returned. Включите «Сохранение токена карты» в ЛК CloudPayments → Настройки магазина.",
			);
		}

		// Шаг 2: повторное списание по токену.
		// TrInitiatorCode=0 — транзакция инициирована ТСП (рекарринг, не пользователь).
		// При TrInitiatorCode=0 обязателен и PaymentScheduled.
		const recurring = await cp.payments.chargeToken({
			Amount: 7,
			Currency: "RUB",
			AccountId: accountId,
			Token: initial.Token,
			TrInitiatorCode: 0,
			PaymentScheduled: 0,
			Description: "sdk integration: charge by saved token",
		});
		expect(recurring.Status).toBe("Completed");
		expect(recurring.Token).toBeTruthy();
	}, 120_000);
});
