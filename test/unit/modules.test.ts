import { describe, expect, test } from "bun:test";
import { CloudPaymentsHttpClient } from "../../src/core/http.js";
import {
	CloudPayments3DsRequiredError,
	CloudPaymentsBusinessError,
} from "../../src/errors/index.js";
import { PaymentsModule } from "../../src/modules/payments.js";
import { SettingsModule } from "../../src/modules/settings.js";

function mockFetchReturning(body: unknown, status = 200): typeof fetch {
	return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const creds = { publicId: "pk_test", apiSecret: "secret" };

describe("PaymentsModule", () => {
	test("test() returns Message (CP /test puts GUID there, not Model)", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetchReturning({ Success: true, Message: "guid-123" }),
		});
		const payments = new PaymentsModule(http);
		const res = await payments.test();
		expect(res).toBe("guid-123");
	});

	test("generated paths use baseUrl and preserve notification placeholders", async () => {
		const urls: string[] = [];
		const bodies: unknown[] = [];
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			baseUrl: "https://api.cp.kz",
			retry: { maxAttempts: 1 },
			fetch: (async (url: string | URL | Request, init?: RequestInit) => {
				const value = url.toString();
				urls.push(value);
				bodies.push(JSON.parse(String(init?.body)));
				return value.endsWith("/test")
					? new Response(JSON.stringify({ Success: true, Message: "guid-123" }))
					: value.endsWith("/update")
						? new Response(JSON.stringify({ Success: true, Message: null }))
						: new Response(
								JSON.stringify({
									Success: true,
									Model: {
										IsEnabled: true,
										Address: "https://example.test/webhook",
										HttpMethod: "POST",
										Encoding: "UTF8",
										Format: "CloudPayments",
									},
								}),
							);
			}) as typeof fetch,
		});

		await new PaymentsModule(http).test();
		const settings = new SettingsModule(http);
		await settings.getNotification("Pay");
		await settings.updateNotification("Fail", { IsEnabled: false });

		expect(urls).toEqual([
			"https://api.cp.kz/test",
			"https://api.cp.kz/site/notifications/Pay/get",
			"https://api.cp.kz/site/notifications/Fail/update",
		]);
		expect(bodies).toEqual([{}, {}, { IsEnabled: false }]);
	});

	test("chargeCryptogram throws 3DsRequiredError when Success=false + AcsUrl+PaReq", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetchReturning({
				Success: false,
				Message: null,
				Model: {
					TransactionId: 42,
					PaReq: "abc",
					AcsUrl: "https://acs.example/",
					ThreeDsCallbackId: "cb-1",
				},
			}),
		});
		const payments = new PaymentsModule(http);
		try {
			await payments.chargeCryptogram({
				Amount: 10,
				IpAddress: "127.0.0.1",
				CardCryptogramPacket: "crypto",
			});
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CloudPayments3DsRequiredError);
			const e = err as CloudPayments3DsRequiredError;
			expect(e.transactionId).toBe(42);
			expect(e.acsUrl).toBe("https://acs.example/");
		}
	});

	test("chargeCryptogram throws BusinessError on declined (ReasonCode present)", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetchReturning({
				Success: false,
				Message: null,
				Model: { ReasonCode: 5051, TransactionId: 100 },
			}),
		});
		const payments = new PaymentsModule(http);
		try {
			await payments.chargeCryptogram({
				Amount: 10,
				IpAddress: "127.0.0.1",
				CardCryptogramPacket: "crypto",
			});
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CloudPaymentsBusinessError);
			const e = err as CloudPaymentsBusinessError;
			expect(e.reasonCode).toBe(5051);
		}
	});

	test("confirm returns undefined on Success without Model", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetchReturning({ Success: true, Message: null }),
		});
		const payments = new PaymentsModule(http);
		const res = await payments.confirm({ TransactionId: 1, Amount: 1 });
		expect(res).toBeUndefined();
	});
});
