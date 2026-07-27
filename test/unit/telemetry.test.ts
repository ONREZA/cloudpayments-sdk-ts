import { describe, expect, test } from "bun:test";
import type { ErrorContext, RequestContext, ResponseContext } from "../../src/core/http.js";
import { CloudPaymentsHttpClient } from "../../src/core/http.js";

const creds = { publicId: "pk_test", apiSecret: "secret" };

function mockFetch(fn: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
	return (async (url: string | URL | Request, init: RequestInit = {}) =>
		fn(url.toString(), init)) as unknown as typeof fetch;
}

describe("telemetry hooks", () => {
	test("onRequest + onResponse fire on success", async () => {
		const requests: RequestContext[] = [];
		const responses: ResponseContext[] = [];
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			baseUrl: "https://x.test",
			retry: { maxAttempts: 1 },
			fetch: mockFetch(
				async () => new Response(JSON.stringify({ Success: true }), { status: 200 }),
			),
			hooks: {
				onRequest: (ctx) => {
					requests.push(ctx);
				},
				onResponse: (ctx) => {
					responses.push(ctx);
				},
			},
		});
		await client.post("https://x.test/", {});
		expect(requests).toHaveLength(1);
		expect(requests[0]?.method).toBe("POST");
		expect(requests[0]?.url).toBe("https://x.test/");
		expect(requests[0]?.headers.Authorization).toBeUndefined();
		expect(responses).toHaveLength(1);
		expect(responses[0]?.status).toBe(200);
		expect(responses[0]?.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("onError fires on network throw", async () => {
		const errors: ErrorContext[] = [];
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			baseUrl: "https://x.test",
			retry: { maxAttempts: 1 },
			fetch: mockFetch(async () => {
				throw new Error("ECONNREFUSED");
			}),
			hooks: {
				onError: (ctx) => {
					errors.push(ctx);
				},
			},
		});
		await expect(client.post("https://x.test/", {})).rejects.toThrow();
		expect(errors).toHaveLength(1);
		const telemetryError = errors[0];
		if (!telemetryError) {
			throw new Error("Telemetry error was not captured");
		}
		expect((telemetryError.error as Error).message).toContain("outcome is unknown");
	});

	test("onRequest called for each retry attempt", async () => {
		const requests: RequestContext[] = [];
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			baseUrl: "https://x.test",
			retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
			fetch: mockFetch(async () => {
				calls++;
				return calls < 3
					? new Response("boom", { status: 503 })
					: new Response(JSON.stringify({ Success: true }), { status: 200 });
			}),
			hooks: {
				onRequest: (ctx) => {
					requests.push(ctx);
				},
			},
		});
		await client.post("https://x.test/", {}, { replaySafety: "safe" });
		expect(requests).toHaveLength(3);
		expect(requests[0]?.attempt).toBe(0);
		expect(requests[1]?.attempt).toBe(1);
		expect(requests[2]?.attempt).toBe(2);
	});

	test("hook failures are reported without changing the response", async () => {
		const hookErrors: string[] = [];
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			baseUrl: "https://x.test",
			retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
			fetch: mockFetch(async () => {
				calls++;
				return new Response(JSON.stringify({ Success: true }), { status: 200 });
			}),
			hooks: {
				onResponse: () => {
					throw new Error("telemetry unavailable");
				},
				onHookError: (hook) => {
					hookErrors.push(hook);
				},
			},
		});

		const response = await client.post<{ Success: boolean }>("/", {});

		expect(response.Success).toBe(true);
		expect(calls).toBe(1);
		expect(hookErrors).toEqual(["onResponse"]);
	});

	test("slow hooks do not consume the request timeout", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			baseUrl: "https://x.test",
			timeoutMs: 1,
			retry: { maxAttempts: 1 },
			fetch: mockFetch(async (_url, init) => {
				if (init.signal?.aborted) throw init.signal.reason;
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					text: async () => JSON.stringify({ Success: true }),
				} as Response;
			}),
			hooks: {
				onRequest: () => new Promise((resolve) => setTimeout(resolve, 5)),
				onResponse: () => new Promise((resolve) => setTimeout(resolve, 5)),
			},
		});

		const response = await client.post<{ Success: boolean }>("/", {});

		expect(response.Success).toBe(true);
	});
});
