import { describe, expect, test } from "bun:test";
import {
	CloudPaymentsBusinessError,
	CloudPaymentsSdkError,
	CloudPaymentsUnknownOutcomeError,
} from "../../src/errors/index.js";
import { CloudPaymentsPublicClient } from "../../src/public-client.js";

function mockFetch(fn: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
	return (async (url: string | URL | Request, init: RequestInit = {}) =>
		fn(url.toString(), init)) as unknown as typeof fetch;
}

const request = {
	PublicId: "pk_test",
	AltPayType: "TcsBnplDolyame" as const,
	Amount: 1_000,
	Scheme: "1" as const,
};

describe("DolyameModule", () => {
	test("uses the public endpoint and normalizes top-level ExtensionData", async () => {
		let capturedUrl = "";
		let capturedInit: RequestInit | undefined;
		const client = new CloudPaymentsPublicClient({
			fetch: mockFetch(async (url, init) => {
				capturedUrl = url;
				capturedInit = init;
				return Response.json({
					Success: true,
					Model: { TransactionId: 42, Amount: 1_000, IsTest: true },
					ExtensionData: { Link: "https://dolyame.ru/form/test" },
				});
			}),
		});

		const result = await client.dolyame.createPaymentLink(request, {
			idempotencyKey: "order-42",
		});
		const capturedHeaders = capturedInit?.headers as Record<string, string>;

		expect(capturedUrl).toBe("https://api.cloudpayments.ru/payments/altpay/pay");
		expect(capturedHeaders.Authorization).toBeUndefined();
		expect(capturedHeaders["X-Request-ID"]).toBe("order-42");
		expect(JSON.parse(capturedInit?.body as string)).toEqual(request);
		expect(result).toEqual({
			TransactionId: 42,
			Amount: 1_000,
			IsTest: true,
			Link: "https://dolyame.ru/form/test",
		});
	});

	test("accepts ExtensionData nested in Model", async () => {
		const client = new CloudPaymentsPublicClient({
			fetch: mockFetch(async () =>
				Response.json({
					Success: true,
					Model: {
						TransactionId: 43,
						Amount: 500,
						ExtensionData: { Link: "https://dolyame.ru/form/nested" },
					},
				}),
			),
		});

		const result = await client.dolyame.createPaymentLink(request);
		expect(result).toMatchObject({
			TransactionId: 43,
			Link: "https://dolyame.ru/form/nested",
		});
		expect(result).not.toHaveProperty("ExtensionData");
	});

	test("maps Success=false to CloudPaymentsBusinessError", async () => {
		const client = new CloudPaymentsPublicClient({
			fetch: mockFetch(async () =>
				Response.json({
					Success: false,
					Message: "Declined",
					ErrorCode: 42,
					Model: { ReasonCode: 5001 },
				}),
			),
		});

		try {
			await client.dolyame.createPaymentLink(request);
			throw new Error("request unexpectedly succeeded");
		} catch (error) {
			expect(error).toBeInstanceOf(CloudPaymentsBusinessError);
			expect((error as CloudPaymentsBusinessError).reasonCode).toBe(5001);
			expect((error as CloudPaymentsBusinessError).apiErrorCode).toBe(42);
		}
	});

	test("marks a successful response without a link as unknown without idempotency", async () => {
		const client = new CloudPaymentsPublicClient({
			fetch: mockFetch(async () =>
				Response.json({
					Success: true,
					Model: { TransactionId: 42, Amount: 1_000 },
				}),
			),
		});

		await expect(client.dolyame.createPaymentLink(request)).rejects.toBeInstanceOf(
			CloudPaymentsUnknownOutcomeError,
		);
	});

	test("reports a missing link as a contract error when retry is idempotent", async () => {
		const client = new CloudPaymentsPublicClient({
			fetch: mockFetch(async () =>
				Response.json({
					Success: true,
					Model: { TransactionId: 42, Amount: 1_000 },
				}),
			),
		});

		await expect(
			client.dolyame.createPaymentLink(request, { idempotencyKey: "order-42" }),
		).rejects.toBeInstanceOf(CloudPaymentsSdkError);
	});
});
