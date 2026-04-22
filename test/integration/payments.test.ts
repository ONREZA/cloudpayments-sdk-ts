/**
 * Безопасные интеграционки по payments — без карточных криптограмм.
 * Покрывают: envelope unwrap (Success → Model), BusinessError на несуществующей
 * транзакции, list-методы (envelope → array).
 */
import { describe, expect, test } from "bun:test";
import { CloudPaymentsBusinessError } from "../../src/errors/index.js";
import { HAS_CREDS, makeTestClient, yesterdayIso } from "./setup.js";

describe.skipIf(!HAS_CREDS)("integration: payments", () => {
	test("get() on nonexistent TransactionId → BusinessError", async () => {
		const cp = makeTestClient();
		try {
			await cp.payments.get({ TransactionId: 1 });
			throw new Error("expected rejection");
		} catch (err) {
			// CP отвечает либо Success:false с Message "Transaction not found",
			// либо Success:false с Model{ReasonCode}. Оба случая — BusinessError.
			expect(err).toBeInstanceOf(CloudPaymentsBusinessError);
		}
	});

	test("listByDay(yesterday) returns Transaction[]", async () => {
		const cp = makeTestClient();
		const list = await cp.payments.listByDay({ Date: yesterdayIso() });
		expect(Array.isArray(list)).toBe(true);
	});

	test("listByPeriod(last 24h) returns Transaction[]", async () => {
		const cp = makeTestClient();
		const to = new Date().toISOString();
		const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const list = await cp.payments.listByPeriod({
			CreatedDateGte: from,
			CreatedDateLte: to,
			PageNumber: 1,
		});
		expect(Array.isArray(list)).toBe(true);
	});

	test("listTokens() returns TokenRecord[]", async () => {
		const cp = makeTestClient();
		const list = await cp.payments.listTokens();
		expect(Array.isArray(list)).toBe(true);
	});
});
