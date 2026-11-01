import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync("/var/tmp/cloudpayments-sdk-package-");

try {
	// Keep prepack enabled so this checks the package users actually publish.
	execFileSync("npm", ["pack", "--pack-destination", temp], { cwd: root, stdio: "inherit" });
	const tarballs = readdirSync(temp).filter((name) => name.endsWith(".tgz"));
	assert.equal(tarballs.length, 1);
	const consumer = join(temp, "consumer");
	mkdirSync(consumer);
	writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
	execFileSync(
		"npm",
		[
			"install",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--prefix",
			consumer,
			join(temp, tarballs[0]),
		],
		{ stdio: "inherit" },
	);

	const packageRoot = join(consumer, "node_modules", "@onreza", "cloudpayments-sdk");
	const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	for (const file of ["README.md", "LICENSE"]) assert.ok(existsSync(join(packageRoot, file)));
	const artifacts = readdirSync(join(packageRoot, "dist"), { recursive: true });
	assert.deepEqual(
		artifacts.filter((file) => /\.(?:cjs|cts)(?:\.map)?$/.test(file)),
		[],
	);
	for (const entry of Object.values(packageJson.exports)) {
		if (typeof entry === "string") continue;
		assert.ok(existsSync(join(packageRoot, entry.types)));
		assert.ok(existsSync(join(packageRoot, entry.default)));
	}
	copyFileSync(
		join(root, "tools", "fixtures", "package-consumer.mjs"),
		join(consumer, "runtime.mjs"),
	);
	for (const runtime of [process.execPath, "bun"]) {
		execFileSync(runtime, ["runtime.mjs"], { cwd: consumer, stdio: "inherit" });
	}

	const typeBody = `const client = new sdk.CloudPaymentsClient({ publicId: 'test', apiSecret: 'test' });
const publicClient = new sdk.CloudPaymentsPublicClient();
void publicClient.dolyame.createPaymentLink({ PublicId: 'test', AltPayType: 'TcsBnplDolyame', Amount: 1000, Scheme: '1' });
const widgetIntent: browser.WidgetIntentOptions = { publicTerminalId: 'test', amount: 1, currency: 'RUB', paymentSchema: 'Single' };
const typedWidget = null as unknown as browser.CloudPaymentsWidget;
const CheckoutClass = null as unknown as browser.CheckoutConstructor;
void new CheckoutClass({ publicId: 'test' });
// @ts-expect-error legacy Widget API is intentionally not exported
typedWidget.pay;
// @ts-expect-error legacy Widget API is intentionally not exported
typedWidget.charge;
// @ts-expect-error legacy Widget API is intentionally not exported
typedWidget.auth;
// @ts-expect-error legacy Checkout API is intentionally not exported
(null as unknown as browser.Checkout).createCryptogramPacket;
// @ts-expect-error legacy positional Checkout constructor is intentionally not exported
new CheckoutClass('test');
void [browser.loadCloudPaymentsWidget, widgetIntent, typedWidget];
const observation: Promise<browser.WidgetWaitResult> = browser.waitForWidgetResult(Promise.resolve({ type: 'payment', status: 'wait' }));
void observation;
void client.payments.get({ TransactionId: 1 });
void client.payments.listByPeriod({ CreatedDateGte: '2026-08-01', CreatedDateLte: '2026-08-24', PageNumber: 1, TimeZone: 'MSK', Statuses: ['Completed'] });
void client.subscriptions.update({ Id: 'subscription-1', Interval: 'Month' });
void client.orders.create({ Amount: 1, Description: 'Invoice', SubscriptionBehavior: 'CreateMonthly' });
void client.settings.updateNotification('Pay', { HttpMethod: 'POST', Encoding: 'UTF8', Format: 'CloudPayments' });
void client.kkt.submitReceipt({ Inn: '7700000000', Type: 'Income', CustomerReceipt: { Items: [{ label: 'Item', price: 1, quantity: 1, amount: 1 }] } });
void client.kkt.getReceiptStatus({ Id: 'receipt-1' });
const payout: sdk.PaymentsPayoutSbpRequest = { Amount: 1, Currency: 'RUB', Receiver: { Phone: '+71234567890' } };
void client.payments.payoutSbp(payout);
void client.payments.confirm({ TransactionId: 1, Amount: 1, JsonData: { cloudpayments: { CustomerReceipt: { Items: [{ label: 'Item', price: 1, quantity: 1, amount: 1, method: 0 }] } } } });
const paymentMethod: sdk.KktPaymentMethod = 0;
const receiptAmounts: sdk.KktReceiptAmounts = { Electronic: 1 };
const correctionVat: sdk.KktCorrectionReceiptVatRate = 1;
void [paymentMethod, receiptAmounts, correctionVat];
void webhooks.verifyWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });
void webhooks.verifyReceiptWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });
const webhookStage: webhooks.WebhookVerificationStage = 'body_parsing';
void new webhooks.WebhookVerificationError('bad payload', 'bad_body', webhookStage).signatureVerified;
void errors.CloudPaymentsUnknownOutcomeError;
const receiptStatus: sdk.KktReceiptStatus = 'Queued';
const blocks = null as unknown as browser.PaymentBlocks;
blocks.update({ amount: 200 });
const customizedIntent: browser.WidgetIntentOptions = { ...widgetIntent, components: { paymentButton: { text: 'Pay' } }, appearance: { colors: { background: '#ffffff' }, backdrop: { opacity: 0.5 } } };
void [receiptStatus, customizedIntent];
`;
	const modules = {
		sdk: "@onreza/cloudpayments-sdk",
		webhooks: "@onreza/cloudpayments-sdk/webhooks",
		errors: "@onreza/cloudpayments-sdk/errors",
		browser: "@onreza/cloudpayments-sdk/browser",
	};
	for (const extension of ["mts", "cts"]) {
		const imports = Object.entries(modules).map(([name, specifier]) =>
			extension === "mts"
				? `import * as ${name} from "${specifier}";`
				: `import ${name} = require("${specifier}");`,
		);
		writeFileSync(join(consumer, `consumer.${extension}`), `${imports.join("\n")}\n${typeBody}`);
	}
	for (const compiler of ["typescript", "@typescript/native"]) {
		execFileSync(
			process.execPath,
			[
				join(root, "node_modules", compiler, "bin", "tsc"),
				...(compiler === "@typescript/native" ? ["--stableTypeOrdering", "--checkers", "1"] : []),
				"--noEmit",
				"--strict",
				"--exactOptionalPropertyTypes",
				"--noUncheckedIndexedAccess",
				"--target",
				"ES2024",
				"--module",
				"NodeNext",
				"--moduleResolution",
				"NodeNext",
				"consumer.mts",
				"consumer.cts",
			],
			{ cwd: consumer, stdio: "inherit" },
		);
	}
	console.log(`package check passed for ${packageJson.name}@${packageJson.version}`);
} finally {
	rmSync(temp, { recursive: true, force: true });
}
