import { describe, expect, test } from "bun:test";
import {
	CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL,
	CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL,
	CLOUDPAYMENTS_WIDGET_SCRIPT_URL,
	CloudPaymentsBrowserLoadError,
	loadCloudPaymentsCheckout,
	loadCloudPaymentsPaymentBlocks,
	loadCloudPaymentsWidget,
} from "../../src/browser/index.js";
import type { CloudPaymentsBrowserNamespace } from "../../src/browser/types.js";

class FakeScript extends EventTarget {
	src = "";
	async = false;
	nonce = "";
	removed = false;

	remove() {
		this.removed = true;
	}
}

function fakeDocument(
	install: (namespace: CloudPaymentsBrowserNamespace) => void,
	mode: "load" | "error" | "never" = "load",
) {
	const scripts: FakeScript[] = [];
	const namespace: CloudPaymentsBrowserNamespace = {};
	const window = { cp: namespace };
	const append = (node: Node) => {
		const script = node as unknown as FakeScript;
		scripts.push(script);
		if (mode !== "never")
			queueMicrotask(() => {
				if (mode === "load") install(namespace);
				script.dispatchEvent(new Event(mode));
			});
	};
	const document = {
		defaultView: window,
		head: { append },
		documentElement: { append },
		createElement: () => new FakeScript(),
		querySelector: (selector: string) => {
			const url = selector.match(/^script\[src="(.+)"\]$/)?.[1];
			return scripts.find((script) => script.src === url && !script.removed) ?? null;
		},
	} as unknown as Document;
	return { document, namespace, scripts };
}

describe("CloudPayments browser loaders", () => {
	test("fails explicitly outside a browser", async () => {
		try {
			await loadCloudPaymentsWidget();
			throw new Error("loader unexpectedly succeeded");
		} catch (error) {
			expect(error).toBeInstanceOf(CloudPaymentsBrowserLoadError);
			expect((error as CloudPaymentsBrowserLoadError).code).toBe("browser_unavailable");
		}
	});

	test("loads the Widget from the fixed official URL and deduplicates concurrent calls", async () => {
		const fixture = fakeDocument((namespace) => {
			namespace.CloudPayments = function CloudPayments() {} as never;
		});

		const [first, second] = await Promise.all([
			loadCloudPaymentsWidget({ document: fixture.document, nonce: "nonce-42" }),
			loadCloudPaymentsWidget({ document: fixture.document, nonce: "nonce-42" }),
		]);

		expect(first).toBe(second);
		expect(fixture.scripts).toHaveLength(1);
		expect(fixture.scripts[0]?.src).toBe(CLOUDPAYMENTS_WIDGET_SCRIPT_URL);
		expect(fixture.scripts[0]?.nonce).toBe("nonce-42");
	});

	test("returns an already available namespace without injecting a script", async () => {
		const fixture = fakeDocument(() => {});
		fixture.namespace.Checkout = function Checkout() {} as never;

		const namespace = await loadCloudPaymentsCheckout({ document: fixture.document });

		expect(namespace as CloudPaymentsBrowserNamespace).toBe(fixture.namespace);
		expect(fixture.scripts).toHaveLength(0);
	});

	test("loads PaymentBlocks and Checkout from their official URLs", async () => {
		const blocks = fakeDocument((namespace) => {
			namespace.PaymentBlocks = function PaymentBlocks() {} as never;
		});
		const checkout = fakeDocument((namespace) => {
			namespace.Checkout = function Checkout() {} as never;
		});

		await loadCloudPaymentsPaymentBlocks({ document: blocks.document });
		await loadCloudPaymentsCheckout({ document: checkout.document });

		expect(blocks.scripts[0]?.src).toBe(CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL);
		expect(checkout.scripts[0]?.src).toBe(CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL);
	});

	test("reports a loaded script without the expected namespace", async () => {
		const fixture = fakeDocument(() => {});

		try {
			await loadCloudPaymentsCheckout({ document: fixture.document });
			throw new Error("loader unexpectedly succeeded");
		} catch (error) {
			expect(error).toBeInstanceOf(CloudPaymentsBrowserLoadError);
			expect((error as CloudPaymentsBrowserLoadError).code).toBe("namespace_missing");
		}
	});

	test("removes a newly added script after a network error", async () => {
		const fixture = fakeDocument(() => {}, "error");

		await expect(loadCloudPaymentsWidget({ document: fixture.document })).rejects.toBeInstanceOf(
			CloudPaymentsBrowserLoadError,
		);
		expect(fixture.scripts[0]?.removed).toBe(true);
	});

	test("forgets a settled load instead of returning a stale namespace", async () => {
		let installs = 0;
		const fixture = fakeDocument((namespace) => {
			installs++;
			namespace.CloudPayments = function CloudPayments() {} as never;
		});

		await loadCloudPaymentsWidget({ document: fixture.document });
		fixture.scripts[0]?.remove();
		delete fixture.namespace.CloudPayments;
		await loadCloudPaymentsWidget({ document: fixture.document });

		expect(installs).toBe(2);
		expect(fixture.scripts).toHaveLength(2);
	});

	test("reports a timeout and removes the script it added", async () => {
		const fixture = fakeDocument(() => {}, "never");

		try {
			await loadCloudPaymentsCheckout({ document: fixture.document, timeoutMs: 0 });
			throw new Error("loader unexpectedly succeeded");
		} catch (error) {
			expect(error).toBeInstanceOf(CloudPaymentsBrowserLoadError);
			expect((error as CloudPaymentsBrowserLoadError).code).toBe("script_timeout");
		}
		expect(fixture.scripts[0]?.removed).toBe(true);
	});

	test("normalizes a synchronous DOM append failure and cleans up", async () => {
		const fixture = fakeDocument(() => {});
		(fixture.document.head as unknown as { append: () => void }).append = () => {
			throw new Error("CSP blocked insertion");
		};

		try {
			await loadCloudPaymentsWidget({ document: fixture.document });
			throw new Error("loader unexpectedly succeeded");
		} catch (error) {
			expect(error).toBeInstanceOf(CloudPaymentsBrowserLoadError);
			expect((error as CloudPaymentsBrowserLoadError).code).toBe("script_load_failed");
		}
		expect(fixture.scripts).toHaveLength(0);
	});
});
