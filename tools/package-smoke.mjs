import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "cloudpayments-sdk-smoke-"));

try {
	const packOutput = execFileSync(
		"npm",
		["pack", "--ignore-scripts", "--json", "--pack-destination", temp],
		{ cwd: root, encoding: "utf8" },
	);
	const [{ filename }] = JSON.parse(packOutput);
	const consumer = join(temp, "consumer");
	execFileSync(
		"npm",
		[
			"install",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--prefix",
			consumer,
			join(temp, filename),
		],
		{ stdio: "inherit" },
	);

	const packageRoot = join(consumer, "node_modules", "@onreza", "cloudpayments-sdk");
	const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	const esm = await import(
		pathToFileURL(join(packageRoot, packageJson.exports["."].import.default))
	);
	const webhooks = await import(
		pathToFileURL(join(packageRoot, packageJson.exports["./webhooks"].import.default))
	);
	const errors = await import(
		pathToFileURL(join(packageRoot, packageJson.exports["./errors"].import.default))
	);
	const browser = await import(
		pathToFileURL(join(packageRoot, packageJson.exports["./browser"].import.default))
	);
	const require = createRequire(import.meta.url);
	const required = require(join(packageRoot, packageJson.exports["."].require.default));
	const requiredWebhooks = require(
		join(packageRoot, packageJson.exports["./webhooks"].require.default),
	);
	const requiredErrors = require(
		join(packageRoot, packageJson.exports["./errors"].require.default),
	);
	const requiredBrowser = require(
		join(packageRoot, packageJson.exports["./browser"].require.default),
	);

	assert.equal(typeof esm.CloudPaymentsClient, "function");
	assert.equal(typeof required.CloudPaymentsClient, "function");
	assert.equal(typeof esm.CloudPaymentsPublicClient, "function");
	assert.equal(typeof required.CloudPaymentsPublicClient, "function");
	assert.equal(typeof esm.KktModule, "function");
	assert.equal(
		typeof new esm.CloudPaymentsClient({ publicId: "test", apiSecret: "test" }).kkt.submitReceipt,
		"function",
	);
	assert.equal(typeof webhooks.verifyWebhook, "function");
	assert.equal(typeof webhooks.verifyReceiptWebhook, "function");
	assert.equal(typeof requiredWebhooks.verifyWebhook, "function");
	assert.equal(webhooks.WebhookVerificationError, requiredWebhooks.WebhookVerificationError);
	const webhookError = new webhooks.WebhookVerificationError(
		"bad payload",
		"bad_body",
		"body_parsing",
	);
	assert.equal(webhookError.signatureVerified, true);
	assert.equal(typeof errors.CloudPaymentsUnknownOutcomeError, "function");
	assert.equal(typeof requiredErrors.CloudPaymentsUnknownOutcomeError, "function");
	assert.equal(esm.CloudPaymentsUnknownOutcomeError, errors.CloudPaymentsUnknownOutcomeError);
	assert.equal(
		required.CloudPaymentsUnknownOutcomeError,
		requiredErrors.CloudPaymentsUnknownOutcomeError,
	);
	assert.equal(esm.CloudPaymentsUnknownOutcomeError, required.CloudPaymentsUnknownOutcomeError);
	assert.equal(typeof browser.loadCloudPaymentsWidget, "function");
	assert.equal(typeof browser.loadCloudPaymentsPaymentBlocks, "function");
	assert.equal(typeof browser.loadCloudPaymentsCheckout, "function");
	assert.equal(typeof requiredBrowser.loadCloudPaymentsWidget, "function");
	assert.equal(
		errors.CloudPaymentsUnknownOutcomeError,
		requiredErrors.CloudPaymentsUnknownOutcomeError,
	);
	assert.equal(esm.CP_SDK_VERSION, packageJson.version);
	assert.equal(packageJson.engines.node, ">=24.0.0");
	assert.ok(existsSync(join(packageRoot, packageJson.exports["."].import.types)));
	assert.ok(existsSync(join(packageRoot, packageJson.exports["."].require.types)));
	assert.ok(existsSync(join(packageRoot, packageJson.exports["./webhooks"].import.types)));
	assert.ok(existsSync(join(packageRoot, packageJson.exports["./webhooks"].require.types)));
	assert.ok(existsSync(join(packageRoot, packageJson.exports["./errors"].import.types)));
	assert.ok(existsSync(join(packageRoot, packageJson.exports["./errors"].require.types)));
	assert.ok(existsSync(join(packageRoot, packageJson.exports["./browser"].import.types)));
	assert.ok(existsSync(join(packageRoot, packageJson.exports["./browser"].require.types)));

	writeFileSync(join(consumer, "package.json"), JSON.stringify({ type: "module" }));
	writeFileSync(
		join(consumer, "smoke.ts"),
		[
			'import { CloudPaymentsClient, CloudPaymentsPublicClient, type KktCorrectionReceiptVatRate, type KktPaymentMethod, type KktReceiptAmounts, type KktReceiptStatus, type PaymentsPayoutSbpRequest } from "@onreza/cloudpayments-sdk";',
			'import { WebhookVerificationError, type WebhookVerificationStage, verifyReceiptWebhook, verifyWebhook } from "@onreza/cloudpayments-sdk/webhooks";',
			'import { CloudPaymentsUnknownOutcomeError } from "@onreza/cloudpayments-sdk/errors";',
			'import { loadCloudPaymentsWidget, type CheckoutConstructor, type CloudPaymentsWidget, type WidgetIntentOptions } from "@onreza/cloudpayments-sdk/browser";',
			"const client = new CloudPaymentsClient({ publicId: 'test', apiSecret: 'test' });",
			"const publicClient = new CloudPaymentsPublicClient();",
			"void publicClient.dolyame.createPaymentLink({ PublicId: 'test', AltPayType: 'TcsBnplDolyame', Amount: 1000, Scheme: '1' });",
			"const widgetIntent: WidgetIntentOptions = { publicTerminalId: 'test', amount: 1, currency: 'RUB', paymentSchema: 'Single' };",
			"const typedWidget = null as unknown as CloudPaymentsWidget;",
			"const CheckoutClass = null as unknown as CheckoutConstructor;",
			"void new CheckoutClass({ publicId: 'test' });",
			"// @ts-expect-error legacy Widget API is intentionally not exported",
			"typedWidget.pay;",
			"// @ts-expect-error legacy Widget API is intentionally not exported",
			"typedWidget.charge;",
			"// @ts-expect-error legacy Widget API is intentionally not exported",
			"typedWidget.auth;",
			"// @ts-expect-error legacy Checkout API is intentionally not exported",
			"(null as unknown as import('@onreza/cloudpayments-sdk/browser').Checkout).createCryptogramPacket;",
			"// @ts-expect-error legacy positional Checkout constructor is intentionally not exported",
			"new CheckoutClass('test');",
			"void [loadCloudPaymentsWidget, widgetIntent, typedWidget];",
			"void client.payments.get({ TransactionId: 1 });",
			"void client.payments.listByPeriod({ CreatedDateGte: '2026-08-01', CreatedDateLte: '2026-08-24', PageNumber: 1, TimeZone: 'MSK', Statuses: ['Completed'] });",
			"void client.subscriptions.update({ Id: 'subscription-1', Interval: 'Month' });",
			"void client.orders.create({ Amount: 1, Description: 'Invoice', SubscriptionBehavior: 'CreateMonthly' });",
			"void client.settings.updateNotification('Pay', { HttpMethod: 'POST', Encoding: 'UTF8', Format: 'CloudPayments' });",
			"void client.kkt.submitReceipt({ Inn: '7700000000', Type: 'Income', CustomerReceipt: { Items: [{ label: 'Item', price: 1, quantity: 1, amount: 1 }] } });",
			"void client.kkt.getReceiptStatus({ Id: 'receipt-1' });",
			"const payout: PaymentsPayoutSbpRequest = { Amount: 1, Currency: 'RUB', Receiver: { Phone: '+71234567890' } };",
			"void client.payments.payoutSbp(payout);",
			"void client.payments.confirm({ TransactionId: 1, Amount: 1, JsonData: { cloudpayments: { CustomerReceipt: { Items: [{ label: 'Item', price: 1, quantity: 1, amount: 1, method: 0 }] } } } });",
			"const paymentMethod: KktPaymentMethod = 0;",
			"const receiptAmounts: KktReceiptAmounts = { Electronic: 1 };",
			"const correctionVat: KktCorrectionReceiptVatRate = 1;",
			"void [paymentMethod, receiptAmounts, correctionVat];",
			"const receiptStatus: KktReceiptStatus = 'Queued';",
			"void receiptStatus;",
			"void verifyWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });",
			"void verifyReceiptWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });",
			"const webhookStage: WebhookVerificationStage = 'body_parsing';",
			"void new WebhookVerificationError('bad payload', 'bad_body', webhookStage).signatureVerified;",
			"void CloudPaymentsUnknownOutcomeError;",
		].join("\n"),
	);
	writeFileSync(
		join(consumer, "smoke.cts"),
		[
			'import sdk = require("@onreza/cloudpayments-sdk");',
			'import webhooks = require("@onreza/cloudpayments-sdk/webhooks");',
			'import errors = require("@onreza/cloudpayments-sdk/errors");',
			'import browser = require("@onreza/cloudpayments-sdk/browser");',
			"const client = new sdk.CloudPaymentsClient({ publicId: 'test', apiSecret: 'test' });",
			"const publicClient = new sdk.CloudPaymentsPublicClient();",
			"void publicClient.dolyame.createPaymentLink({ PublicId: 'test', AltPayType: 'TcsBnplDolyame', Amount: 1000, Scheme: '1' });",
			"const widgetIntent: browser.WidgetIntentOptions = { publicTerminalId: 'test', amount: 1, currency: 'RUB', paymentSchema: 'Single' };",
			"const typedWidget = null as unknown as browser.CloudPaymentsWidget;",
			"const CheckoutClass = null as unknown as browser.CheckoutConstructor;",
			"void new CheckoutClass({ publicId: 'test' });",
			"// @ts-expect-error legacy Widget API is intentionally not exported",
			"typedWidget.pay;",
			"// @ts-expect-error legacy Widget API is intentionally not exported",
			"typedWidget.charge;",
			"// @ts-expect-error legacy Widget API is intentionally not exported",
			"typedWidget.auth;",
			"// @ts-expect-error legacy Checkout API is intentionally not exported",
			"(null as unknown as browser.Checkout).createCryptogramPacket;",
			"// @ts-expect-error legacy positional Checkout constructor is intentionally not exported",
			"new CheckoutClass('test');",
			"void [browser.loadCloudPaymentsWidget, widgetIntent, typedWidget];",
			"void client.payments.get({ TransactionId: 1 });",
			"void client.payments.listByPeriod({ CreatedDateGte: '2026-08-01', CreatedDateLte: '2026-08-24', PageNumber: 1, TimeZone: 'MSK', Statuses: ['Completed'] });",
			"void client.subscriptions.update({ Id: 'subscription-1', Interval: 'Month' });",
			"void client.orders.create({ Amount: 1, Description: 'Invoice', SubscriptionBehavior: 'CreateMonthly' });",
			"void client.settings.updateNotification('Pay', { HttpMethod: 'POST', Encoding: 'UTF8', Format: 'CloudPayments' });",
			"void client.kkt.submitReceipt({ Inn: '7700000000', Type: 'Income', CustomerReceipt: { Items: [{ label: 'Item', price: 1, quantity: 1, amount: 1 }] } });",
			"void client.kkt.getReceiptStatus({ Id: 'receipt-1' });",
			"const payout: sdk.PaymentsPayoutSbpRequest = { Amount: 1, Currency: 'RUB', Receiver: { Phone: '+71234567890' } };",
			"void client.payments.payoutSbp(payout);",
			"void client.payments.confirm({ TransactionId: 1, Amount: 1, JsonData: { cloudpayments: { CustomerReceipt: { Items: [{ label: 'Item', price: 1, quantity: 1, amount: 1, method: 0 }] } } } });",
			"const paymentMethod: sdk.KktPaymentMethod = 0;",
			"const receiptAmounts: sdk.KktReceiptAmounts = { Electronic: 1 };",
			"const correctionVat: sdk.KktCorrectionReceiptVatRate = 1;",
			"void [paymentMethod, receiptAmounts, correctionVat];",
			"void webhooks.verifyWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });",
			"void webhooks.verifyReceiptWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });",
			"const webhookStage: webhooks.WebhookVerificationStage = 'body_parsing';",
			"void new webhooks.WebhookVerificationError('bad payload', 'bad_body', webhookStage).signatureVerified;",
			"void errors.CloudPaymentsUnknownOutcomeError;",
		].join("\n"),
	);
	execFileSync(
		process.execPath,
		[
			join(root, "node_modules", "@typescript", "native", "bin", "tsc"),
			"--noEmit",
			"--stableTypeOrdering",
			"--checkers",
			"1",
			"--strict",
			"--target",
			"ES2022",
			"--module",
			"NodeNext",
			"--moduleResolution",
			"NodeNext",
			"smoke.ts",
			"smoke.cts",
		],
		{ cwd: consumer, stdio: "inherit" },
	);

	console.log(`package smoke passed for ${packageJson.name}@${packageJson.version}`);
} finally {
	rmSync(temp, { recursive: true, force: true });
}
