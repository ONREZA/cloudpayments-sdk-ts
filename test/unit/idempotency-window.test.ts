import { expect, spyOn, test } from "bun:test";
import { CloudPaymentsClient } from "../../src/client.js";
import {
	CloudPaymentsBusinessError,
	CloudPaymentsSdkError,
	CloudPaymentsUnknownOutcomeError,
} from "../../src/errors/index.js";
import { CloudPaymentsPublicClient } from "../../src/public-client.js";

const credentials = { publicId: "pk_test", apiSecret: "secret" };
const options = { idempotencyKey: "payment-42" };
const charge = { Amount: 10, IpAddress: "127.0.0.1", CardCryptogramPacket: "crypto" };
const receipt = {
	Inn: "7700000000",
	Type: "Income" as const,
	CustomerReceipt: { Items: [{ label: "Item", price: 10, quantity: 1, amount: 10 }] },
};
const dolyame = {
	PublicId: "pk_test",
	AltPayType: "TcsBnplDolyame" as const,
	Amount: 1000,
	Scheme: "1" as const,
};

type Invoke = (
	client: CloudPaymentsClient,
	publicClient: CloudPaymentsPublicClient,
) => Promise<unknown>;
const chargePayment: Invoke = (client) => client.payments.chargeCryptogram(charge, options);
const submitReceipt: Invoke = (client) => client.kkt.submitReceipt(receipt, options);
const createLink: Invoke = (_client, publicClient) =>
	publicClient.dolyame.createPaymentLink(dolyame, options);

const malformed: Array<[string, unknown, Invoke]> = [
	["missing payment Model", { Success: true }, chargePayment],
	["invalid payment Model", { Success: true, Model: {} }, chargePayment],
	[
		"invalid 3DS challenge",
		{ Success: false, Model: { TransactionId: 42, AcsUrl: "https://acs.example" } },
		chargePayment,
	],
	["missing Dolyame Link", { Success: true, Model: { TransactionId: 42 } }, createLink],
	["invalid Dolyame envelope", { Success: "true" }, createLink],
	["missing receipt Id", { Success: true, Model: {} }, submitReceipt],
	["invalid receipt envelope", { Success: "true" }, submitReceipt],
];

for (const elapsed of [1, 3_600_000]) {
	test.each(malformed)(
		`public mutation contract failure after ${elapsed}ms: %s`,
		async (_name, envelope, invoke) => {
			const clock = spyOn(performance, "now").mockReturnValue(0);
			try {
				const fetch = (async () => {
					clock.mockReturnValue(elapsed);
					return Response.json(envelope);
				}) as unknown as typeof globalThis.fetch;
				const client = new CloudPaymentsClient({ ...credentials, fetch });
				const publicClient = new CloudPaymentsPublicClient({ fetch });
				await expect(invoke(client, publicClient)).rejects.toBeInstanceOf(
					elapsed < 3_600_000 ? CloudPaymentsSdkError : CloudPaymentsUnknownOutcomeError,
				);
			} finally {
				clock.mockRestore();
			}
		},
	);
}

test.each([
	["payment", { Success: true, Model: { TransactionId: 42, Status: "Completed" } }, chargePayment],
	[
		"Dolyame",
		{
			Success: true,
			Model: { TransactionId: 42 },
			ExtensionData: { Link: "https://dolyame.example" },
		},
		createLink,
	],
	["receipt", { Success: true, Model: { Id: "receipt-42" } }, submitReceipt],
] satisfies Array<[string, unknown, Invoke]>)(
	"valid %s result remains successful after the deadline",
	async (_name, envelope, invoke) => {
		const clock = spyOn(performance, "now").mockReturnValue(0);
		try {
			const fetch = (async () => {
				clock.mockReturnValue(3_600_000);
				return Response.json(envelope);
			}) as unknown as typeof globalThis.fetch;
			await expect(
				invoke(
					new CloudPaymentsClient({ ...credentials, fetch }),
					new CloudPaymentsPublicClient({ fetch }),
				),
			).resolves.toBeDefined();
		} finally {
			clock.mockRestore();
		}
	},
);

test("known business failures and read-only contract errors retain their classification after one hour", async () => {
	const clock = spyOn(performance, "now").mockReturnValue(0);
	try {
		const fetch = (async () => {
			clock.mockReturnValue(3_600_000);
			return Response.json({ Success: false, Message: "Declined" });
		}) as unknown as typeof globalThis.fetch;
		const client = new CloudPaymentsClient({ ...credentials, fetch });
		await expect(client.payments.chargeCryptogram(charge, options)).rejects.toBeInstanceOf(
			CloudPaymentsBusinessError,
		);
		await expect(client.kkt.getReceiptStatus({ Id: "receipt-42" }, options)).rejects.toBeInstanceOf(
			CloudPaymentsBusinessError,
		);
		const read = new CloudPaymentsClient({
			...credentials,
			fetch: (async () => Response.json({ Success: true })) as unknown as typeof globalThis.fetch,
		});
		await expect(read.kkt.getReceiptStatus({ Id: "receipt-42" }, options)).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
	} finally {
		clock.mockRestore();
	}
});

test("time spent waiting for the semaphore does not consume the mutation protection window", async () => {
	const clock = spyOn(performance, "now").mockReturnValue(0);
	const firstResponse = Promise.withResolvers<Response>();
	const firstDispatched = Promise.withResolvers<void>();
	let calls = 0;
	try {
		const client = new CloudPaymentsClient({
			...credentials,
			concurrency: 1,
			fetch: (async () => {
				if (++calls === 1) {
					firstDispatched.resolve();
					return firstResponse.promise;
				}
				clock.mockReturnValue(3_600_001);
				return Response.json({ Success: true });
			}) as unknown as typeof globalThis.fetch,
		});
		const first = client.payments.test();
		await firstDispatched.promise;
		const queued = client.payments.chargeCryptogram(charge, options).then(
			() => undefined,
			(error: unknown) => error,
		);
		clock.mockReturnValue(3_600_000);
		firstResponse.resolve(Response.json({ Success: true, Message: "ready" }));
		await expect(first).resolves.toBe("ready");
		expect(await queued).toBeInstanceOf(CloudPaymentsSdkError);
		expect(calls).toBe(2);
	} finally {
		clock.mockRestore();
	}
});

test("concurrent calls sharing caller options retain independent dispatch deadlines", async () => {
	const clock = spyOn(performance, "now").mockReturnValue(0);
	const firstResponse = Promise.withResolvers<Response>();
	const firstDispatched = Promise.withResolvers<void>();
	let calls = 0;
	try {
		const client = new CloudPaymentsClient({
			...credentials,
			fetch: (async () => {
				if (++calls === 1) {
					firstDispatched.resolve();
					return firstResponse.promise;
				}
				clock.mockReturnValue(3_600_001);
				return Response.json({ Success: true });
			}) as unknown as typeof globalThis.fetch,
		});
		const first = client.payments
			.chargeCryptogram(charge, options)
			.catch((error: unknown) => error);
		await firstDispatched.promise;
		clock.mockReturnValue(3_600_000);
		await expect(client.payments.chargeCryptogram(charge, options)).rejects.toBeInstanceOf(
			CloudPaymentsSdkError,
		);
		firstResponse.resolve(Response.json({ Success: true }));
		expect(await first).toBeInstanceOf(CloudPaymentsUnknownOutcomeError);
	} finally {
		clock.mockRestore();
	}
});
