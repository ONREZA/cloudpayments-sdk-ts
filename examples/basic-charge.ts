/**
 * Приём одностадийного платежа.
 *
 * Использует криптограмму, полученную от фронтенда (обычно — сгенерирована
 * Checkout.js на клиенте). Backend SDK сам криптограммы НЕ делает.
 *
 * Запуск:
 *   CP_PUBLIC_ID=pk_... CP_API_SECRET=... \
 *   CP_CRYPTOGRAM="..." CP_IP=1.2.3.4 CP_ACCOUNT_ID=user_1 \
 *   bun examples/basic-charge.ts
 */
import {
	CloudPayments3DsRequiredError,
	CloudPaymentsBusinessError,
	CloudPaymentsClient,
	CloudPaymentsError,
} from "@onreza/cloudpayments-sdk";

const cp = new CloudPaymentsClient({
	publicId: process.env.CP_PUBLIC_ID ?? "",
	apiSecret: process.env.CP_API_SECRET ?? "",
});

try {
	const tx = await cp.payments.chargeCryptogram({
		Amount: 100,
		Currency: "RUB",
		IpAddress: process.env.CP_IP ?? "127.0.0.1",
		CardCryptogramPacket: process.env.CP_CRYPTOGRAM ?? "",
		AccountId: process.env.CP_ACCOUNT_ID ?? "user_1",
		Description: "Test payment via SDK example",
		// SaveCard: true, — если хотите получить Token для рекарринга
	});

	console.log("✓ Approved");
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
		console.log(`  After: call cp.payments.post3ds({ TransactionId, PaRes })`);
	} else if (err instanceof CloudPaymentsBusinessError) {
		console.log("✗ Declined");
		console.log(`  ReasonCode=${err.reasonCode}`);
		console.log(`  Message=${err.apiMessage}`);
	} else if (err instanceof CloudPaymentsError) {
		console.error("✗ SDK error:", err.constructor.name, err.message);
	} else {
		throw err;
	}
}
