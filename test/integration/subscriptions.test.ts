/**
 * Безопасные интеграционки подписок: поиск по несуществующему AccountId → []
 * и запрос несуществующей подписки → BusinessError.
 */
import { describe, expect, test } from "bun:test";
import { CloudPaymentsBusinessError } from "../../src/errors/index.js";
import { HAS_CREDS, makeTestClient } from "./setup.js";

describe.skipIf(!HAS_CREDS)("integration: subscriptions", () => {
	test("findByAccount(nonexistent) returns empty array", async () => {
		const cp = makeTestClient();
		const list = await cp.subscriptions.findByAccount({
			accountId: `__sdk_test_${Date.now()}__`,
		});
		expect(Array.isArray(list)).toBe(true);
		expect(list.length).toBe(0);
	});

	test("get(nonexistent Id) → BusinessError", async () => {
		const cp = makeTestClient();
		try {
			await cp.subscriptions.get({ Id: "__does_not_exist__" });
			throw new Error("expected rejection");
		} catch (err) {
			expect(err).toBeInstanceOf(CloudPaymentsBusinessError);
		}
	});

	test("cancel(nonexistent Id) → BusinessError", async () => {
		const cp = makeTestClient();
		try {
			await cp.subscriptions.cancel({ Id: "__does_not_exist__" });
			throw new Error("expected rejection");
		} catch (err) {
			expect(err).toBeInstanceOf(CloudPaymentsBusinessError);
		}
	});
});
