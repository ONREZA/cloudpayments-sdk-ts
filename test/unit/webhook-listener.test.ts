import { expect, test } from "bun:test";
import { WebhookListener } from "../integration/helpers/webhook-listener.js";

test("webhook listener keeps diagnostics local and preserves retry status", async () => {
	const listener = new WebhookListener({ port: 0, apiSecret: "test-secret" });
	const url = new URL("/pay", listener.start());
	url.hostname = "127.0.0.1";
	try {
		const rejected = await fetch(url, { method: "POST", body: "{}" });
		expect(rejected.status).toBe(401);
		expect(await rejected.text()).toBe("Webhook verification failed");
		expect(listener.received[0]?.verificationError).toBeTruthy();
		const body = "{";
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode("test-secret"),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const signature = Buffer.from(
			await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
		).toString("base64");
		const malformed = await fetch(url, {
			method: "POST",
			body,
			headers: { "content-hmac": signature, "content-type": "application/json" },
		});
		expect(malformed.status).toBe(500);
		expect(await malformed.text()).toBe("Webhook verification failed");
		expect(listener.received[1]?.verificationError).toBeTruthy();
	} finally {
		listener.close();
	}
});
