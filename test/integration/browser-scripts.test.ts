import { describe, expect, test } from "bun:test";
import {
	CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL,
	CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL,
	CLOUDPAYMENTS_WIDGET_SCRIPT_URL,
} from "../../src/browser/index.js";

type BunServerHandle = ReturnType<typeof Bun.serve>;

const contracts = {
	widget: {
		url: CLOUDPAYMENTS_WIDGET_SCRIPT_URL,
		constructor: "CloudPayments",
		methods: ["start", "close"],
	},
	blocks: {
		url: CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL,
		constructor: "PaymentBlocks",
		methods: ["mount", "update", "on", "off", "unmount"],
	},
	checkout: {
		url: CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL,
		constructor: "Checkout",
		methods: ["createPaymentCryptogram"],
	},
} as const;

describe("integration: live browser scripts", () => {
	test("official CDN bundles expose the typed runtime surface", async () => {
		let server: BunServerHandle | undefined;
		try {
			server = Bun.serve({
				port: 0,
				hostname: "127.0.0.1",
				fetch(request) {
					const key = new URL(request.url).pathname.slice(1) as keyof typeof contracts;
					const contract = contracts[key];
					if (!contract) return new Response("not found", { status: 404 });
					return new Response(`<!doctype html><script src="${contract.url}"></script>`, {
						headers: { "content-type": "text/html; charset=utf-8" },
					});
				},
			});
			await using view = new Bun.WebView({
				backend: {
					type: "chrome",
					argv: ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
				},
			});

			for (const [key, contract] of Object.entries(contracts)) {
				await view.navigate(`http://127.0.0.1:${server.port}/${key}`);
				await waitFor(
					view,
					`window.cp && typeof window.cp[${JSON.stringify(contract.constructor)}] === "function"`,
				);
				const methodTypes = (await view.evaluate(
					`(${JSON.stringify(contract.methods)}).map(function (name) {
							return typeof window.cp[${JSON.stringify(contract.constructor)}].prototype[name];
						})`,
				)) as string[];
				expect(methodTypes).toEqual(contract.methods.map(() => "function"));
			}
		} finally {
			server?.stop(true);
		}
	}, 30_000);
});

async function waitFor(
	view: InstanceType<typeof Bun.WebView>,
	expression: string,
	timeoutMs = 15_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await view.evaluate(expression)) return;
		await Bun.sleep(100);
	}
	throw new Error(`Timed out waiting for: ${expression}`);
}
