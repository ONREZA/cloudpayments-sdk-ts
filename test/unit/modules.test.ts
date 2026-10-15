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

	test.each([null, {}, { Success: "true", Message: "guid-123" }, { Success: true, Message: 42 }])(
		"test() rejects a malformed response: %j",
		async (envelope) => {
			const http = new CloudPaymentsHttpClient({
				credentials: creds,
				fetch: mockFetchReturning(envelope),
			});

			await expect(new PaymentsModule(http).test()).rejects.toBeInstanceOf(CloudPaymentsSdkError);
		},
	);

	test.each(["get", "find", "findLegacy"] as const)(
		"%s preserves transaction status and raw provider fields even when Success is false",
		async (method) => {
			for (const Status of ["AwaitingAuthentication", "Declined", "FutureStatus"]) {
				const model = {
					TransactionId: 42,
					Status,
					Reason: "ThreeDomainSecure",
					CreatedDate: "raw",
				};
				const http = new CloudPaymentsHttpClient({
					credentials: creds,
					fetch: mockFetchReturning({ Success: false, Model: model }),
				});
				const payments = new PaymentsModule(http);
				const result: unknown =
					method === "get"
						? await payments.get({ TransactionId: 42 })
						: await payments[method]({ InvoiceId: "order-42" });
				expect(result).toEqual(model);
			}
		},
	);

	test("get rejects a response for a different transaction", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetchReturning({
				Success: true,
				Model: { TransactionId: 43, Status: "Completed" },
			}),
		});

		await expect(new PaymentsModule(http).get({ TransactionId: 42 })).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
	});

	test.each([42, 43])(
		"get retains the sent transaction ID when the caller mutates the body: %d",
		async (TransactionId) => {
			const body = { TransactionId: 42 };
			const http = new CloudPaymentsHttpClient({
				credentials: creds,
				fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
					expect(JSON.parse(String(init?.body))).toEqual({ TransactionId: 42 });
					body.TransactionId = 43;
					return Response.json({ Success: true, Model: { TransactionId, Status: "Completed" } });
				}) as unknown as typeof fetch,
			});
			const result = new PaymentsModule(http).get(body);
			if (TransactionId === 42) {
				await expect(result).resolves.toMatchObject({ TransactionId: 42 });
			} else {
				await expect(result).rejects.toBeInstanceOf(CloudPaymentsSdkError);
			}
		},
	);

	test.each(["get", "find", "findLegacy"] as const)(
		"%s rejects malformed envelopes and incomplete transaction models",
		async (method) => {
			for (const envelope of [
				null,
				{},
				{ Success: "true", Model: { TransactionId: 42, Status: "Completed" } },
				{ Success: true },
				{ Success: true, Model: {} },
				{ Success: false, Model: { TransactionId: "42", Status: "Completed" } },
				{ Success: true, Model: { TransactionId: 0, Status: "Completed" } },
				{ Success: true, Model: { TransactionId: 1.5, Status: "Completed" } },
				{ Success: true, Model: { TransactionId: 42, Status: "" } },
			]) {
				const http = new CloudPaymentsHttpClient({
					credentials: creds,
					fetch: mockFetchReturning(envelope),
				});
				const payments = new PaymentsModule(http);
				const result =
					method === "get"
						? payments.get({ TransactionId: 42 })
						: payments[method]({ InvoiceId: "order-42" });
				await expect(result).rejects.toBeInstanceOf(CloudPaymentsSdkError);
			}
		},
	);

	test.each(["get", "find", "findLegacy"] as const)(
		"%s keeps a missing transaction as a business error",
		async (method) => {
			const http = new CloudPaymentsHttpClient({
				credentials: creds,
				fetch: mockFetchReturning({ Success: false, Message: "Not found" }),
			});
			const payments = new PaymentsModule(http);
			const result =
				method === "get"
					? payments.get({ TransactionId: 42 })
					: payments[method]({ InvoiceId: "order-42" });
			await expect(result).rejects.toBeInstanceOf(CloudPaymentsBusinessError);
		},
	);

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

	test.each([
		{ TransactionId: 42, AcsUrl: "https://acs.example/" },
		{ TransactionId: 42, AcsUrl: "", PaReq: "abc" },
		{ TransactionId: 0, AcsUrl: "https://acs.example/", PaReq: "abc" },
	])("reports malformed authentication challenges as unknown: %j", async (Model) => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetchReturning({ Success: false, Model }),
		});

		await expect(
			new PaymentsModule(http).chargeCryptogram({
				Amount: 10,
				IpAddress: "127.0.0.1",
				CardCryptogramPacket: "crypto",
			}),
		).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});

	test("retains a pending transaction when its authentication challenge is incomplete", async () => {
		const Model = {
			TransactionId: 42,
			Status: "AwaitingAuthentication",
			Reason: "ThreeDomainSecure",
		};
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetchReturning({ Success: false, Model }),
		});

		try {
			await new PaymentsModule(http).chargeCryptogram({
				Amount: 10,
				IpAddress: "127.0.0.1",
				CardCryptogramPacket: "crypto",
			});
			throw new Error("request unexpectedly succeeded");
		} catch (error) {
			expect(error).toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
			if (!(error instanceof CloudPaymentsUnknownOutcomeError)) throw error;
			expect(error.cause).toBeInstanceOf(CloudPaymentsSdkError);
			expect((error.cause as CloudPaymentsSdkError).cause).toEqual(Model);
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

	test("refund reports a successful response without its transaction ID as unknown", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetchReturning({ Success: true, Model: {} }),
		});

		await expect(
			new PaymentsModule(http).refund({ TransactionId: 1, Amount: 1 }),
		).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});

	test("uses the sent idempotency options to classify a malformed mutation result", async () => {
		const opts: { idempotencyKey?: string } = {};
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: (async () => {
				opts.idempotencyKey = "not-sent";
				return Response.json({ Success: true, Model: {} });
			}) as unknown as typeof fetch,
		});

		await expect(
			new PaymentsModule(http).chargeCryptogram(
				{ Amount: 10, IpAddress: "127.0.0.1", CardCryptogramPacket: "crypto" },
				opts,
			),
		).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});

	test.each([{}, { TransactionId: 42 }, { TransactionId: "42", Status: "Completed" }])(
		"reports malformed successful payment transactions as unknown: %j",
		async (Model) => {
			const http = new CloudPaymentsHttpClient({
				credentials: creds,
				fetch: mockFetchReturning({ Success: true, Model }),
			});

			await expect(
				new PaymentsModule(http).chargeCryptogram({
					Amount: 10,
					IpAddress: "127.0.0.1",
					CardCryptogramPacket: "crypto",
				}),
			).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
		},
	);

	test.each([null, {}, [], "response", { Success: "true", Model: {} }])(
		"reports a malformed mutation envelope as unknown: %j",
		async (envelope) => {
			const http = new CloudPaymentsHttpClient({
				credentials: creds,
				fetch: mockFetchReturning(envelope),
			});

			await expect(
				new PaymentsModule(http).refund({ TransactionId: 1, Amount: 1 }),
			).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
		},
	);

	test("reports a malformed protected mutation envelope as a contract error", async () => {
		const http = new CloudPaymentsHttpClient({
			credentials: creds,
			fetch: mockFetchReturning({}),
		});

		await expect(
			new PaymentsModule(http).refund(
				{ TransactionId: 1, Amount: 1 },
				{ idempotencyKey: "refund-1" },
			),
		).rejects.toBeInstanceOf(CloudPaymentsSdkError);
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
				return mockFetchReturning({
					Success: true,
					Model: url.toString().includes("/payments/find")
						? { TransactionId: 42, Status: "Completed" }
						: [],
				})(url);
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
