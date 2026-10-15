import { describe, expect, spyOn, test } from "bun:test";
import {
	CloudPaymentsHttpClient,
	CloudPaymentsPublicHttpClient,
	type PostOptions,
} from "../../src/core/http.js";
import {
	CloudPaymentsAuthError,
	CloudPaymentsHttpError,
	CloudPaymentsRateLimitError,
	CloudPaymentsSdkError,
	CloudPaymentsUnknownOutcomeError,
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
		expect(captured.init?.redirect).toBe("error");
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

	test.each([
		"",
		" ",
		" payment-42 ",
		"payment\t42",
		"payment\r\n42",
		"payment\u000042",
		"payment-💳",
	])("rejects an invalid idempotency key before sending: %j", async (idempotencyKey) => {
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 2, baseDelayMs: 0 },
			fetch: mockFetch(async () => {
				calls++;
				return new Response("retry", { status: 503 });
			}),
		});

		await expect(client.post("/", {}, { idempotencyKey })).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
		expect(calls).toBe(0);
	});

	test("snapshots the idempotency key before request serialization can mutate options", async () => {
		const opts: PostOptions = { idempotencyKey: "payment-42" };
		const requestIds: Array<string | null> = [];
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
			fetch: mockFetch(async (_url, init) => {
				requestIds.push(new Headers(init.headers).get("X-Request-ID"));
				return requestIds.length === 1
					? new Response("retry", { status: 503 })
					: Response.json({ Success: true });
			}),
		});

		await client.post(
			"/",
			{
				toJSON() {
					delete opts.idempotencyKey;
					return {};
				},
			},
			opts,
		);
		expect(requestIds).toEqual(["payment-42", "payment-42"]);
	});

	test("throws CloudPaymentsAuthError on 401", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetch(
				async () => new Response("denied", { status: 401, statusText: "Unauthorized" }),
			),
		});
		await expect(client.post("/", {})).rejects.toBeInstanceOf(CloudPaymentsAuthError);
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
		await expect(client.post("/", {}, { replaySafety: "safe" })).rejects.toBeInstanceOf(
			CloudPaymentsHttpError,
		);
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
		const res = await client.post<{ Success: boolean }>("/", {}, { replaySafety: "safe" });
		expect(res.Success).toBe(true);
		expect(calls).toBe(2);
	});

	test("throws CloudPaymentsRateLimitError after 429 retries exhausted", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 2 },
			fetch: mockFetch(async () => new Response("", { status: 429, statusText: "TMR" })),
		});
		await expect(client.post("/", {})).rejects.toBeInstanceOf(CloudPaymentsRateLimitError);
	});

	test("reports unknown mutation outcome after fetch throws", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetch(async () => {
				throw new Error("ECONNREFUSED");
			}),
		});
		await expect(client.post("/", {})).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});

	test("reports a successful response with invalid JSON as an SDK contract error", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetch(async () => new Response("<html>not json</html>", { status: 200 })),
		});

		await expect(client.post("/", {}, { replaySafety: "safe" })).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
	});

	test("reports an ambiguous mutation response as an unknown outcome", async () => {
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetch(async () => new Response("<html>not json</html>", { status: 200 })),
		});

		await expect(client.post("/", {})).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});

	test("reports a mutation 5xx as an unknown outcome without replay", async () => {
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetch(async () => {
				calls++;
				return new Response("boom", { status: 503 });
			}),
		});

		await expect(client.post("/", {})).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
		expect(calls).toBe(1);
	});

	test.each([500, 501, 599])(
		"reports mutation HTTP %d as unknown even when retries exclude it",
		async (status) => {
			let calls = 0;
			const client = new CloudPaymentsHttpClient({
				credentials: creds,
				retry: { retryableStatuses: [] },
				fetch: mockFetch(async () => {
					calls++;
					return new Response("error", { status });
				}),
			});

			await expect(client.post("/", {})).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
			expect(calls).toBe(1);
		},
	);

	test("retries mutation with the same idempotency key", async () => {
		const requestIds: string[] = [];
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
			fetch: mockFetch(async (_url, init) => {
				requestIds.push((init.headers as Record<string, string>)["X-Request-ID"] ?? "");
				return requestIds.length === 1
					? new Response("retry", { status: 503 })
					: new Response(JSON.stringify({ Success: true }), { status: 200 });
			}),
		});

		await client.post("/", { Amount: 10 }, { idempotencyKey: "payment-42" });

		expect(requestIds).toEqual(["payment-42", "payment-42"]);
	});

	test("refuses a mutation retry delayed beyond the provider idempotency window", async () => {
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetch(async () => {
				calls++;
				return new Response("retry", { status: 429, headers: { "Retry-After": "3600" } });
			}),
		});

		await expect(
			client.post("/", {}, { idempotencyKey: "payment-42", signal: AbortSignal.timeout(10) }),
		).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
		expect(calls).toBe(1);
	});

	test.each(["safe", "requires-idempotency"] as const)(
		"checks the idempotency deadline after a delayed hook only for mutation: %s",
		async (replaySafety) => {
			const clock = spyOn(performance, "now").mockReturnValue(0);
			let calls = 0;
			try {
				const client = new CloudPaymentsHttpClient({
					credentials: creds,
					retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
					hooks: {
						onRequest: ({ attempt }) => {
							if (attempt === 1) clock.mockReturnValue(3_600_000);
						},
					},
					fetch: mockFetch(async () => {
						calls++;
						return calls === 1
							? new Response("retry", { status: 503 })
							: Response.json({ Success: true });
					}),
				});
				const request = client.post("/", {}, { idempotencyKey: "payment-42", replaySafety });
				if (replaySafety === "safe") {
					await expect(request).resolves.toEqual({ Success: true });
					expect(calls).toBe(2);
				} else {
					await expect(request).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
					expect(calls).toBe(1);
				}
			} finally {
				clock.mockRestore();
			}
		},
	);

	test("partial request retry options preserve client maxAttempts", async () => {
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 4, baseDelayMs: 0, maxDelayMs: 0 },
			fetch: mockFetch(async () => {
				calls++;
				return calls < 4
					? new Response("retry", { status: 503 })
					: new Response(JSON.stringify({ Success: true }), { status: 200 });
			}),
		});

		const response = await client.post<{ Success: boolean }>(
			"/",
			{},
			{
				replaySafety: "safe",
				retry: { baseDelayMs: 0 },
			},
		);

		expect(response.Success).toBe(true);
		expect(calls).toBe(4);
	});

	test("routes relative endpoints through baseUrl", async () => {
		let requestedUrl = "";
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			baseUrl: "https://api.cp.kz",
			fetch: mockFetch(async (url) => {
				requestedUrl = url;
				return new Response("{}", { status: 200 });
			}),
		});

		await client.post("/test", {}, { replaySafety: "safe" });

		expect(requestedUrl).toBe("https://api.cp.kz/test");
	});

	test("rejects an external origin before credentials reach fetch", async () => {
		let calls = 0;
		const client = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetch(async () => {
				calls++;
				return new Response("{}");
			}),
		});

		await expect(client.post("https://example.com/pay", {})).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
		expect(calls).toBe(0);
	});
});

describe("CloudPaymentsPublicHttpClient.post", () => {
	test("never sends an Authorization header", async () => {
		let capturedHeaders: Record<string, string> = {};
		const client = new CloudPaymentsPublicHttpClient({
			fetch: mockFetch(async (_url, init) => {
				capturedHeaders = init.headers as Record<string, string>;
				return new Response("{}", { status: 200 });
			}),
		});

		await client.post("/payments/altpay/pay", { PublicId: "pk_test" });

		expect(capturedHeaders.Authorization).toBeUndefined();
		expect(capturedHeaders["Content-Type"]).toBe("application/json");
	});

	test("does not report a missing API Secret for a public 401 response", async () => {
		const client = new CloudPaymentsPublicHttpClient({
			fetch: mockFetch(
				async () => new Response("denied", { status: 401, statusText: "Unauthorized" }),
			),
		});

		try {
			await client.post("/payments/altpay/pay", { PublicId: "pk_test" });
			throw new Error("request unexpectedly succeeded");
		} catch (error) {
			expect(error).toBeInstanceOf(CloudPaymentsHttpError);
			expect(error).not.toBeInstanceOf(CloudPaymentsAuthError);
		}
	});
});
