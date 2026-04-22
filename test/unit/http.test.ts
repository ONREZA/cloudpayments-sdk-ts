import { describe, expect, test } from "bun:test";
import { CloudPaymentsHttpClient } from "../../src/core/http.js";
import {
	CloudPaymentsAuthError,
	CloudPaymentsHttpError,
	CloudPaymentsNetworkError,
	CloudPaymentsRateLimitError,
} from "../../src/errors/index.js";

function mockFetch(fn: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
	return (async (url: string | URL | Request, init: RequestInit = {}) =>
		fn(url.toString(), init)) as unknown as typeof fetch;
}

const creds = { publicId: "pk_test", apiSecret: "secret" };

describe("CloudPaymentsHttpClient.post", () => {
	test("sends POST with Basic auth, JSON body, Content-Type", async () => {
		const captured: { init?: RequestInit } = {};
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetch(async (_url, init) => {
				captured.init = init;
				return new Response(JSON.stringify({ Success: true, Model: { ok: true } }), {
					status: 200,
				});
			}),
		});
		const body = { Amount: 100 };
		const res = await client.post<{ Success: true; Model: { ok: boolean } }>(
			"https://api.cloudpayments.ru/test",
			body,
		);
		expect(res.Success).toBe(true);
		expect(captured.init?.method).toBe("POST");
		const headers = captured.init?.headers as Record<string, string>;
		expect(headers.Authorization).toMatch(/^Basic /);
		expect(headers["Content-Type"]).toBe("application/json");
		expect(JSON.parse(captured.init?.body as string)).toEqual(body);
	});

	test("passes X-Request-ID when idempotencyKey set", async () => {
		let capturedHeaders: Record<string, string> = {};
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetch(async (_url, init) => {
				capturedHeaders = init.headers as Record<string, string>;
				return new Response("{}", { status: 200 });
			}),
		});
		await client.post("https://api.cloudpayments.ru/test", {}, { idempotencyKey: "abc-123" });
		expect(capturedHeaders["X-Request-ID"]).toBe("abc-123");
	});

	test("throws CloudPaymentsAuthError on 401", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetch(
				async () => new Response("denied", { status: 401, statusText: "Unauthorized" }),
			),
		});
		await expect(client.post("https://x.test/", {})).rejects.toBeInstanceOf(CloudPaymentsAuthError);
	});

	test("retries 5xx up to maxAttempts and throws", async () => {
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
			fetch: mockFetch(async () => {
				calls++;
				return new Response("boom", { status: 503, statusText: "Service Unavailable" });
			}),
		});
		await expect(client.post("https://x.test/", {})).rejects.toBeInstanceOf(CloudPaymentsHttpError);
		expect(calls).toBe(3);
	});

	test("retries 429 with Retry-After", async () => {
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
			fetch: mockFetch(async () => {
				calls++;
				if (calls === 1) {
					return new Response("rate-limited", {
						status: 429,
						statusText: "Too Many Requests",
						headers: { "Retry-After": "0" },
					});
				}
				return new Response(JSON.stringify({ Success: true }), { status: 200 });
			}),
		});
		const res = await client.post<{ Success: boolean }>("https://x.test/", {});
		expect(res.Success).toBe(true);
		expect(calls).toBe(2);
	});

	test("throws CloudPaymentsRateLimitError after 429 retries exhausted", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 2 },
			fetch: mockFetch(async () => new Response("", { status: 429, statusText: "TMR" })),
		});
		await expect(client.post("https://x.test/", {})).rejects.toBeInstanceOf(
			CloudPaymentsRateLimitError,
		);
	});

	test("wraps fetch throws in CloudPaymentsNetworkError", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetch(async () => {
				throw new Error("ECONNREFUSED");
			}),
		});
		await expect(client.post("https://x.test/", {})).rejects.toBeInstanceOf(
			CloudPaymentsNetworkError,
		);
	});
});
