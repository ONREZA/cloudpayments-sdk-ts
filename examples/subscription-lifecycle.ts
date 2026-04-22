/**
 * Полный lifecycle рекуррентной подписки:
 *  1) первичный charge с SaveCard=true → получаем Token
 *  2) subscriptions.create на этом Token
 *  3) get / findByAccount / update
 *  4) cancel
 *
 * В ЛК CloudPayments должна быть включена опция «Сохранение токена карты».
 */
import { CloudPayments3DsRequiredError, CloudPaymentsClient } from "@onreza/cloudpayments-sdk";

const cp = new CloudPaymentsClient({
	publicId: process.env.CP_PUBLIC_ID ?? "",
	apiSecret: process.env.CP_API_SECRET ?? "",
});

const accountId = process.env.CP_ACCOUNT_ID ?? `demo-${Date.now()}`;

// 1. Первичный платёж
let initialTx: Awaited<ReturnType<typeof cp.payments.chargeCryptogram>>;
try {
	initialTx = await cp.payments.chargeCryptogram({
		Amount: 199,
		Currency: "RUB",
		IpAddress: process.env.CP_IP ?? "127.0.0.1",
		CardCryptogramPacket: process.env.CP_CRYPTOGRAM ?? "",
		AccountId: accountId,
		Description: "Установочный платёж месячной подписки",
		SaveCard: true,
	});
} catch (err) {
	if (err instanceof CloudPayments3DsRequiredError) {
		console.log("3-D Secure required — обработайте через ACS redirect + post3ds");
		process.exit(2);
	}
	throw err;
}

if (!initialTx.Token) {
	throw new Error(
		"Token not returned. Включите «Сохранение токена карты» в ЛК → Настройки магазина.",
	);
}
console.log(`✓ initial charge: tx=${initialTx.TransactionId}, token=${initialTx.Token}`);

// 2. Создаём подписку на тот же Token. StartDate — когда списать следующий раз.
const nextMonth = new Date();
nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

const sub = await cp.subscriptions.create({
	Token: initialTx.Token,
	AccountId: accountId,
	Description: "Месячная подписка Pro",
	Email: "demo@example.com",
	Amount: 199,
	Currency: "RUB",
	RequireConfirmation: false,
	StartDate: nextMonth.toISOString(),
	Interval: "Month",
	Period: 1,
});
console.log(`✓ subscription created: ${sub.Id}, status=${sub.Status}`);

// 3. Просмотр и поиск
const fetched = await cp.subscriptions.get({ Id: sub.Id });
console.log(`  next charge: ${fetched.NextTransactionDateIso}`);

const byAccount = await cp.subscriptions.findByAccount({ accountId });
console.log(`  account has ${byAccount.length} active subscription(s)`);

// 4. Обновление цены
const updated = await cp.subscriptions.update({ Id: sub.Id, Amount: 249 });
console.log(`✓ updated amount: ${updated.Amount} ${updated.Currency}`);

// 5. Отмена
await cp.subscriptions.cancel({ Id: sub.Id });
console.log(`✓ cancelled`);

const afterCancel = await cp.subscriptions.get({ Id: sub.Id });
console.log(`  final status: ${afterCancel.Status}`);
