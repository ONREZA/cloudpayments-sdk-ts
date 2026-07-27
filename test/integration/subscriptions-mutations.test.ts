import { describe, expect, test } from "bun:test";
import { CloudPaymentsBusinessError } from "../../src/errors/index.js";
import { HAS_CREDS, makeTestClient } from "./setup.js";

describe.skipIf(!HAS_CREDS)("integration: subscription mutations", () => {
	test("cancel(nonexistent Id) returns BusinessError", async () => {
		const cp = makeTestClient();
		try {
			await cp.subscriptions.cancel(
				{ Id: "__does_not_exist__" },
				{ idempotencyKey: "sdk-test-cancel-does-not-exist" },
			);
			throw new Error("expected rejection");
		} catch (err) {
			expect(err).toBeInstanceOf(CloudPaymentsBusinessError);
		}
	});
});
