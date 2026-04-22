/**
 * End-to-end lifecycle orders: create → cancel. В отличие от charge, orders не
 * требуют карточных данных — сервер возвращает Url/Id, по которому клиент
 * мог бы пройти оплату через веб.
 */
import { describe, expect, test } from "bun:test";
import { HAS_CREDS, makeTestClient } from "./setup.js";

describe.skipIf(!HAS_CREDS)("integration: orders", () => {
	test("create → returns Url, then cancel succeeds", async () => {
		const cp = makeTestClient();
		const order = await cp.orders.create({
			Amount: 1,
			Currency: "RUB",
			Description: "@onreza/cloudpayments-sdk integration test",
			// Email обязателен для /orders/create
			Email: "sdk-integration-test@onreza.local",
			RequireConfirmation: false,
		});
		expect(typeof order.Id).toBe("string");
		expect(order.Url).toMatch(/^https:\/\/orders\.cloudpayments\.ru\//);
		expect(order.Amount).toBe(1);
		expect(order.Currency).toBe("RUB");

		// Lifecycle: отменяем созданный заказ
		await cp.orders.cancel({ Id: order.Id });
	});
});
