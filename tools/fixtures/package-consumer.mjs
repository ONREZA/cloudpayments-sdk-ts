import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as esm from "@onreza/cloudpayments-sdk";
import * as webhooks from "@onreza/cloudpayments-sdk/webhooks";
import * as errors from "@onreza/cloudpayments-sdk/errors";
import * as browser from "@onreza/cloudpayments-sdk/browser";

const require = createRequire(import.meta.url);
const required = require("@onreza/cloudpayments-sdk");
const requiredWebhooks = require("@onreza/cloudpayments-sdk/webhooks");
const requiredErrors = require("@onreza/cloudpayments-sdk/errors");
const requiredBrowser = require("@onreza/cloudpayments-sdk/browser");
const packageJson = require("@onreza/cloudpayments-sdk/package.json");

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
assert.equal(typeof requiredBrowser.waitForWidgetResult, "function");
const widgetResult = {
	type: "payment",
	status: "wait",
	isAwaitingResult: true,
};
assert.deepEqual(await browser.waitForWidgetResult(Promise.resolve(widgetResult)), {
	status: "reported",
	result: widgetResult,
});
assert.equal(
	errors.CloudPaymentsUnknownOutcomeError,
	requiredErrors.CloudPaymentsUnknownOutcomeError,
);
assert.equal(esm.CP_SDK_VERSION, packageJson.version);
assert.equal(packageJson.engines.node, ">=24");
