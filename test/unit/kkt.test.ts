import { describe, expect, test } from "bun:test";
import { CloudPaymentsClient } from "../../src/client.js";
import {
	CloudPaymentsBusinessError,
	CloudPaymentsSdkError,
	CloudPaymentsUnknownOutcomeError,
} from "../../src/errors/index.js";

const credentials = { publicId: "pk_test", apiSecret: "secret" };

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

describe("KktModule", () => {
	test.each(["idempotency", "serialization"] as const)(
		"keeps a preflight %s failure as a contract error without sending",
		async (failure) => {
			let calls = 0;
			const client = new CloudPaymentsClient({
				...credentials,
				fetch: (async () => {
					calls++;
					return response({ Success: true });
				}) as unknown as typeof fetch,
			});
			const body = {
				Inn: "7700000000",
				Type: "Income" as const,
				CustomerReceipt: {
					Items: [{ label: "Item", price: 10, quantity: 1, amount: 10 }],
				},
				toJSON() {
					if (failure === "serialization") throw new Error("Cannot serialize receipt");
					return {};
				},
			};

			await expect(
				client.kkt.submitReceipt(body, failure === "idempotency" ? { idempotencyKey: " " } : {}),
			).rejects.toBeInstanceOf(CloudPaymentsSdkError);
			expect(calls).toBe(0);
		},
	);

	test.each([null, {}, { Success: "true" }])(
		"reports malformed receipt submission envelopes as unknown: %j",
		async (envelope) => {
			const client = new CloudPaymentsClient({
				...credentials,
				fetch: (async () => response(envelope)) as unknown as typeof fetch,
			});

			await expect(
				client.kkt.submitReceipt({
					Inn: "7700000000",
					Type: "Income",
					CustomerReceipt: {
						Items: [{ label: "Item", price: 10, quantity: 1, amount: 10 }],
					},
				}),
			).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
		},
	);

	test("keeps malformed read-only envelopes as contract errors", async () => {
		const client = new CloudPaymentsClient({
			...credentials,
			fetch: (async () => response({})) as unknown as typeof fetch,
		});

		await expect(client.kkt.getReceiptStatus({ Id: "receipt-1" })).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
	});

	test("submitReceipt sends a typed receipt and preserves warnings", async () => {
		const requests: Array<{ url: string; body: unknown; requestId: string | null }> = [];
		const client = new CloudPaymentsClient({
			...credentials,
			retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
			fetch: (async (url: string | URL | Request, init?: RequestInit) => {
				requests.push({
					url: url.toString(),
					body: JSON.parse(String(init?.body)),
					requestId: new Headers(init?.headers).get("X-Request-ID"),
				});
				return response({
					Success: true,
					Message: null,
					Warning: "Касса скоро требует обслуживания",
					WarningCodes: [101],
					Model: { Id: "receipt-1", ErrorCode: null, ReceiptLocalUrl: "https://receipt.test/1" },
				});
			}) as unknown as typeof fetch,
		});

		const result = await client.kkt.submitReceipt(
			{
				Inn: "7700000000",
				Type: "Income",
				InvoiceId: "order-1",
				CustomerReceipt: {
					Items: [{ label: "Подписка", price: 100, quantity: 1, amount: 100, vat: 0 }],
				},
			},
			{ idempotencyKey: "receipt:order-1" },
		);

		expect(result).toEqual({
			Id: "receipt-1",
			ErrorCode: null,
			ReceiptLocalUrl: "https://receipt.test/1",
			Message: null,
			Warning: "Касса скоро требует обслуживания",
			WarningCodes: [101],
		});
		expect(requests).toEqual([
			{
				url: "https://api.cloudpayments.ru/kkt/receipt",
				requestId: "receipt:order-1",
				body: {
					Inn: "7700000000",
					Type: "Income",
					InvoiceId: "order-1",
					CustomerReceipt: {
						Items: [{ label: "Подписка", price: 100, quantity: 1, amount: 100, vat: 0 }],
					},
				},
			},
		]);
	});

	test("getReceiptStatus safely retries and returns operational warnings", async () => {
		let attempts = 0;
		const client = new CloudPaymentsClient({
			...credentials,
			retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
			fetch: (async () => {
				attempts++;
				if (attempts === 1) return response({ error: "temporary" }, 500);
				return response({
					Success: true,
					Model: "Queued",
					Warnings: [{ Code: 12, Description: "ОФД недоступен", ResolveAction: null }],
				});
			}) as unknown as typeof fetch,
		});

		await expect(client.kkt.getReceiptStatus({ Id: "receipt-1" })).resolves.toEqual({
			Status: "Queued",
			Message: null,
			Warnings: [{ Code: 12, Description: "ОФД недоступен", ResolveAction: null }],
		});
		expect(attempts).toBe(2);
	});

	test("throws a business error for a rejected request", async () => {
		const client = new CloudPaymentsClient({
			...credentials,
			retry: { maxAttempts: 1 },
			fetch: (async () =>
				response({ Success: false, Message: "Invalid receipt" })) as unknown as typeof fetch,
		});

		await expect(
			client.kkt.submitReceipt({
				Inn: "7700000000",
				Type: "Income",
				CustomerReceipt: {
					Items: [{ label: "Товар", price: 10, quantity: 1, amount: 10 }],
				},
			}),
		).rejects.toBeInstanceOf(CloudPaymentsBusinessError);
	});

	test("rejects an undocumented receipt status", async () => {
		const client = new CloudPaymentsClient({
			...credentials,
			retry: { maxAttempts: 1 },
			fetch: (async () => response({ Success: true, Model: "Maybe" })) as unknown as typeof fetch,
		});

		await expect(client.kkt.getReceiptStatus({ Id: "receipt-1" })).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
	});

	test("reports a successful fiscalization response without Message as unknown", async () => {
		const client = new CloudPaymentsClient({
			...credentials,
			retry: { maxAttempts: 1 },
			fetch: (async () => response({ Success: true, Message: null })) as unknown as typeof fetch,
		});

		await expect(
			client.kkt.fiscalize({
				Inn: "7700000000",
				DeviceNumber: "device-1",
				FiscalNumber: "fiscal-1",
				RegNumber: "reg-1",
				Url: "https://merchant.test",
				Ofd: "FirstOfd",
				TaxationSystem: [0],
				MerchantEmail: "merchant@example.test",
				MerchantPhone: "+71234567890",
			}),
		).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});

	test.each([
		{ Success: true },
		{ Success: true, Model: {} },
		{ Success: true, Model: { Id: 42 } },
	])("reports incomplete receipt submission results as unknown: %j", async (envelope) => {
		const opts: { idempotencyKey?: string } = {};
		const client = new CloudPaymentsClient({
			...credentials,
			fetch: (async () => {
				opts.idempotencyKey = "not-sent";
				return response(envelope);
			}) as unknown as typeof fetch,
		});

		await expect(
			client.kkt.submitReceipt(
				{
					Inn: "7700000000",
					Type: "Income",
					CustomerReceipt: {
						Items: [{ label: "Item", price: 10, quantity: 1, amount: 10 }],
					},
				},
				opts,
			),
		).rejects.toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	});
});
