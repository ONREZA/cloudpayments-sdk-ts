/**
 * Проверяет что Basic auth реально валидируется CloudPayments.
 *  - с правильными тестовыми credentials — /test возвращает GUID
 *  - с заведомо неверным apiSecret — сервер отвечает 401 → CloudPaymentsAuthError
 */
import { describe, expect, test } from "bun:test";
import { CloudPaymentsAuthError } from "../../src/errors/index.js";
import { CloudPaymentsClient } from "../../src/index.js";
import { CP_TEST_PUBLIC_ID, HAS_CREDS, makeTestClient } from "./setup.js";

describe.skipIf(!HAS_CREDS)("integration: auth", () => {
	test("valid test credentials — /test returns GUID in Message", async () => {
		const cp = makeTestClient();
		const guid = await cp.payments.test();
		expect(typeof guid).toBe("string");
		expect(guid.length).toBeGreaterThan(0);
	});

	test("wrong apiSecret → CloudPaymentsAuthError", async () => {
		const cp = new CloudPaymentsClient({
			publicId: CP_TEST_PUBLIC_ID,
			apiSecret: "definitely-wrong-secret",
			timeoutMs: 15_000,
			retry: { maxAttempts: 1 },
		});
		await expect(cp.payments.test()).rejects.toBeInstanceOf(CloudPaymentsAuthError);
	});
});
