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
	const require = createRequire(import.meta.url);
	const required = require(join(packageRoot, packageJson.exports["."].require.default));
	const requiredWebhooks = require(
		join(packageRoot, packageJson.exports["./webhooks"].require.default),
	);
	const requiredErrors = require(
		join(packageRoot, packageJson.exports["./errors"].require.default),
	);

	assert.equal(typeof esm.CloudPaymentsClient, "function");
	assert.equal(typeof required.CloudPaymentsClient, "function");
	assert.equal(typeof webhooks.verifyWebhook, "function");
	assert.equal(typeof requiredWebhooks.verifyWebhook, "function");
	assert.equal(typeof errors.CloudPaymentsUnknownOutcomeError, "function");
	assert.equal(typeof requiredErrors.CloudPaymentsUnknownOutcomeError, "function");
	assert.equal(esm.CloudPaymentsUnknownOutcomeError, errors.CloudPaymentsUnknownOutcomeError);
	assert.equal(
		required.CloudPaymentsUnknownOutcomeError,
		requiredErrors.CloudPaymentsUnknownOutcomeError,
	);
	assert.equal(esm.CloudPaymentsUnknownOutcomeError, required.CloudPaymentsUnknownOutcomeError);
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

	writeFileSync(join(consumer, "package.json"), JSON.stringify({ type: "module" }));
	writeFileSync(
		join(consumer, "smoke.ts"),
		[
			'import { CloudPaymentsClient } from "@onreza/cloudpayments-sdk";',
			'import { verifyWebhook } from "@onreza/cloudpayments-sdk/webhooks";',
			'import { CloudPaymentsUnknownOutcomeError } from "@onreza/cloudpayments-sdk/errors";',
			"const client = new CloudPaymentsClient({ publicId: 'test', apiSecret: 'test' });",
			"void client.payments.get({ TransactionId: 1 });",
			"void verifyWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });",
			"void CloudPaymentsUnknownOutcomeError;",
		].join("\n"),
	);
	writeFileSync(
		join(consumer, "smoke.cts"),
		[
			'import sdk = require("@onreza/cloudpayments-sdk");',
			'import webhooks = require("@onreza/cloudpayments-sdk/webhooks");',
			'import errors = require("@onreza/cloudpayments-sdk/errors");',
			"const client = new sdk.CloudPaymentsClient({ publicId: 'test', apiSecret: 'test' });",
			"void client.payments.get({ TransactionId: 1 });",
			"void webhooks.verifyWebhook({ rawBody: '', signature: 'test', apiSecret: 'test' });",
			"void errors.CloudPaymentsUnknownOutcomeError;",
		].join("\n"),
	);
	execFileSync(
		join(root, "node_modules", ".bin", "tsc"),
		[
			"--noEmit",
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
