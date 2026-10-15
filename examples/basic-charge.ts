/**
 * Приём одностадийного платежа.
 *
 * Использует криптограмму, полученную от фронтенда (обычно — сгенерирована
 * Checkout.js на клиенте). Backend SDK сам криптограммы НЕ делает.
 *
 * Запуск:
 *   CP_PUBLIC_ID=pk_... CP_API_SECRET=... \
 *   CP_CRYPTOGRAM="..." CP_IP=1.2.3.4 CP_ACCOUNT_ID=user_1 CP_REQUEST_ID=payment-attempt-42 \
 *   bun examples/basic-charge.ts
 */
import {
	CloudPayments3DsRequiredError,
	CloudPaymentsBusinessError,
	CloudPaymentsClient,
	CloudPaymentsError,
	CloudPaymentsUnknownOutcomeError,
} from "@onreza/cloudpayments-sdk";

const requestId = process.env.CP_REQUEST_ID;
if (!requestId) throw new Error("Set CP_REQUEST_ID to the persisted ID of this payment attempt");

const cp = new CloudPaymentsClient({
	publicId: process.env.CP_PUBLIC_ID ?? "",
	apiSecret: process.env.CP_API_SECRET ?? "",
});

try {
	const tx = await cp.payments.chargeCryptogram(
		{
			Amount: 100,
			Currency: "RUB",
			IpAddress: process.env.CP_IP ?? "127.0.0.1",
			CardCryptogramPacket: process.env.CP_CRYPTOGRAM ?? "",
			AccountId: process.env.CP_ACCOUNT_ID ?? "user_1",
			Description: "Test payment via SDK example",
			// SaveCard: true, — если хотите получить Token для рекарринга
		},
		{ idempotencyKey: requestId },
	);

	console.log("Payment response received; reconcile this transaction before fulfilling the order");
	console.log(`  TransactionId=${tx.TransactionId}`);
	console.log(`  Status=${tx.Status}`);
	console.log(`  Amount=${tx.Amount} ${tx.Currency}`);
	console.log(`  Card=${tx.CardType} ${tx.CardFirstSix}****${tx.CardLastFour}`);
	if (tx.Token) console.log(`  Token=${tx.Token}`);
} catch (err) {
	if (err instanceof CloudPayments3DsRequiredError) {
		console.log("⚠ 3-D Secure required");
		console.log(`  Redirect to: ${err.acsUrl}`);
		console.log(`  With: MD=${err.transactionId}, PaReq=${err.paReq.slice(0, 30)}…`);
		console.log(`  After: call cp.payments.post3ds({ TransactionId, PaRes }, { idempotencyKey })`);
	} else if (err instanceof CloudPaymentsUnknownOutcomeError) {
		console.error("Payment outcome unknown; reconcile the existing attempt before retrying");
	} else if (err instanceof CloudPaymentsBusinessError) {
		console.log("Provider rejected the request; inspect the transaction context");
		console.log(`  ReasonCode=${err.reasonCode}`);
		console.log(`  Message=${err.apiMessage}`);
	} else if (err instanceof CloudPaymentsError) {
		console.error("✗ SDK error:", err.constructor.name, err.message);
	} else {
		throw err;
	}
}
