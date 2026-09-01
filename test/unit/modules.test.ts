import { describe, expect, test } from "bun:test";
import { ENDPOINTS } from "../../src/_generated/endpoints.js";
import { CloudPaymentsClient } from "../../src/client.js";
import { CloudPaymentsHttpClient } from "../../src/core/http.js";
import {
	CloudPayments3DsRequiredError,
	CloudPaymentsBusinessError,
	CloudPaymentsSdkError,
	CloudPaymentsUnknownOutcomeError,
} from "../../src/errors/index.js";
import { PaymentsModule } from "../../src/modules/payments.js";
import { SettingsModule } from "../../src/modules/settings.js";
import { CloudPaymentsPublicClient } from "../../src/public-client.js";

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

	test("test() rejects a successful response without Message", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetchReturning({ Success: true, Message: null }),
		});

		await expect(new PaymentsModule(http).test()).rejects.toBeInstanceOf(CloudPaymentsSdkError);
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
		await settings.updateNotification("Fail", {
			IsEnabled: false,
			HttpMethod: "POST",
			Encoding: "Windows1251",
			Format: "QIWI",
		});

		expect(urls).toEqual([
			"https://api.cp.kz/test",
			"https://api.cp.kz/site/notifications/Pay/get",
			"https://api.cp.kz/site/notifications/Fail/update",
		]);
		expect(bodies).toEqual([
			{},
			{},
			{
				IsEnabled: false,
				HttpMethod: "POST",
				Encoding: "Windows1251",
				Format: "QIWI",
			},
		]);
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

	test("model-returning methods reject a successful envelope without Model", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetchReturning({ Success: true, Message: null }),
		});

		await expect(new PaymentsModule(http).find({ InvoiceId: "order-1" })).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
	});

	test("model-returning mutations treat a missing Model as an unknown outcome", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			retry: { maxAttempts: 1 },
			fetch: mockFetchReturning({ Success: true, Message: null }),
		});

		await expect(
			new PaymentsModule(http).refund({ TransactionId: 1, Amount: 1 }),
		).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});
});

describe("generated API surface", () => {
	test("every generated endpoint has a public client method", () => {
		const client = new CloudPaymentsClient({ ...creds, retry: { maxAttempts: 1 } });
		const publicClient = new CloudPaymentsPublicClient({ retry: { maxAttempts: 1 } });
		for (const [moduleName, endpoints] of Object.entries(ENDPOINTS)) {
			const sdkModule =
				moduleName === "dolyame"
					? publicClient.dolyame
					: (client[moduleName as keyof CloudPaymentsClient] as object);
			for (const methodName of Object.keys(endpoints)) {
				expect(typeof (sdkModule as Record<string, unknown>)[methodName]).toBe("function");
			}
		}
	});

	test("client modules call the newly covered official endpoints", async () => {
		const urls: string[] = [];
		const client = new CloudPaymentsClient({
			publicId: creds.publicId,
			apiSecret: creds.apiSecret,
			retry: { maxAttempts: 1 },
			fetch: (async (url: string | URL | Request) => {
				urls.push(url.toString());
				return mockFetchReturning({ Success: true, Model: [] })(url);
			}) as typeof fetch,
		});

		await client.payments.find({ InvoiceId: "order-1" });
		await client.payments.findLegacy({ InvoiceId: "order-1" });
		await client.escrow.getInfo({ EscrowAccumulationIds: ["escrow-1"] });
		await client.sbp.listBanks({ PublicTerminalId: "terminal-1" });

		const tPayRequest = {
			publicId: "pk_test",
			Amount: 100,
			Currency: "RUB" as const,
			Scheme: 0 as const,
			Browser: "Chrome",
			Os: "Linux",
			Webview: false,
			Device: "DesktopWeb" as const,
			SuccessRedirectUrl: "https://merchant.test/success",
			FailRedirectUrl: "https://merchant.test/fail",
		};
		await client.tPay.createLink(tPayRequest);
		await client.tPay.createQrImage(tPayRequest);

		const sbpRequest = {
			PublicId: "pk_test",
			Amount: 100,
			Currency: "RUB" as const,
			Scheme: "charge" as const,
		};
		await client.sbp.createLink(sbpRequest);
		await client.sbp.createQrImage(sbpRequest);

		const sberPayRequest = {
			PublicId: "pk_test",
			Amount: 100,
			Currency: "RUB" as const,
			Scheme: "charge" as const,
			Os: "Linux",
			Webview: false,
			Device: "DesktopWeb" as const,
			Browser: "Chrome",
		};
		await client.sberPay.createLink(sberPayRequest);
		await client.sberPay.createQrImage(sberPayRequest);

		expect(urls).toEqual([
			"https://api.cloudpayments.ru/v2/payments/find",
			"https://api.cloudpayments.ru/payments/find",
			"https://api.cloudpayments.ru/Escrow/GetEscrowInfo",
			"https://api.cloudpayments.ru/sbp/v2/banks/info",
			"https://api.cloudpayments.ru/payments/qr/tinkoffpay/link",
			"https://api.cloudpayments.ru/payments/qr/tinkoffpay/image",
			"https://api.cloudpayments.ru/payments/qr/sbp/link",
			"https://api.cloudpayments.ru/payments/qr/sbp/image",
			"https://api.cloudpayments.ru/payments/qr/sberpay/link",
			"https://api.cloudpayments.ru/payments/qr/sberpay/image",
		]);
	});
});
