import type {
	CheckoutNamespace,
	CloudPaymentsBrowserNamespace,
	PaymentBlocksNamespace,
	WidgetNamespace,
} from "./types.js";

export const CLOUDPAYMENTS_WIDGET_SCRIPT_URL =
	"https://widget.cloudpayments.ru/bundles/cloudpayments.js";
export const CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL =
	"https://widget.cloudpayments.ru/bundles/paymentblocks.js";
export const CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL = "https://checkout.cloudpayments.ru/checkout.js";

export type BrowserScriptKind = "widget" | "payment-blocks" | "checkout";
export type BrowserScriptLoadErrorCode =
	| "browser_unavailable"
	| "script_load_failed"
	| "script_timeout"
	| "namespace_missing";

export class CloudPaymentsBrowserLoadError extends Error {
	constructor(
		public readonly code: BrowserScriptLoadErrorCode,
		public readonly scriptKind: BrowserScriptKind,
		message: string,
	) {
		super(message);
		this.name = "CloudPaymentsBrowserLoadError";
	}
}

export interface BrowserScriptLoadOptions {
	/** Документ для iframe/тестов. По умолчанию глобальный `document`. */
	document?: Document;
	/** CSP nonce, который будет установлен на создаваемый script. */
	nonce?: string;
	/** Максимальное ожидание загрузки, по умолчанию 15 секунд. */
	timeoutMs?: number;
}

const loads = new WeakMap<Document, Map<string, Promise<CloudPaymentsBrowserNamespace>>>();

export function loadCloudPaymentsWidget(
	options?: BrowserScriptLoadOptions,
): Promise<WidgetNamespace> {
	return loadCloudPaymentsScript(
		"widget",
		CLOUDPAYMENTS_WIDGET_SCRIPT_URL,
		(namespace): namespace is WidgetNamespace => typeof namespace.CloudPayments === "function",
		options,
	);
}

export function loadCloudPaymentsPaymentBlocks(
	options?: BrowserScriptLoadOptions,
): Promise<PaymentBlocksNamespace> {
	return loadCloudPaymentsScript(
		"payment-blocks",
		CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL,
		(namespace): namespace is PaymentBlocksNamespace =>
			typeof namespace.PaymentBlocks === "function",
		options,
	);
}

export function loadCloudPaymentsCheckout(
	options?: BrowserScriptLoadOptions,
): Promise<CheckoutNamespace> {
	return loadCloudPaymentsScript(
		"checkout",
		CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL,
		(namespace): namespace is CheckoutNamespace => typeof namespace.Checkout === "function",
		options,
	);
}

function loadCloudPaymentsScript<T extends CloudPaymentsBrowserNamespace>(
	kind: BrowserScriptKind,
	url: string,
	isReady: (namespace: CloudPaymentsBrowserNamespace) => namespace is T,
	options: BrowserScriptLoadOptions | undefined,
): Promise<T> {
	const document = options?.document ?? globalThis.document;
	if (!document) {
		return Promise.reject(
			new CloudPaymentsBrowserLoadError(
				"browser_unavailable",
				kind,
				`CloudPayments ${kind} can only be loaded in a browser document`,
			),
		);
	}

	const current = getNamespace(document);
	if (isReady(current)) return Promise.resolve(current);

	let documentLoads = loads.get(document);
	if (!documentLoads) {
		documentLoads = new Map();
		loads.set(document, documentLoads);
	}
	const pending = documentLoads.get(url);
	if (pending) return pending.then(assertReady(kind, isReady));

	const promise = appendScript(document, kind, url, isReady, options);
	documentLoads.set(url, promise);
	const forgetSettledLoad = () => {
		if (documentLoads?.get(url) === promise) documentLoads.delete(url);
	};
	void promise.then(forgetSettledLoad, forgetSettledLoad);
	return promise;
}

function appendScript<T extends CloudPaymentsBrowserNamespace>(
	document: Document,
	kind: BrowserScriptKind,
	url: string,
	isReady: (namespace: CloudPaymentsBrowserNamespace) => namespace is T,
	options: BrowserScriptLoadOptions | undefined,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
		const script = existing ?? document.createElement("script");
		const created = existing === null;
		let settled = false;
		const timeoutMs = options?.timeoutMs ?? 15_000;

		const finish = (error?: CloudPaymentsBrowserLoadError) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			script.removeEventListener("load", onLoad);
			script.removeEventListener("error", onError);
			if (error) {
				if (created) script.remove();
				reject(error);
			} else {
				resolve(getNamespace(document) as T);
			}
		};
		const onLoad = () => {
			if (isReady(getNamespace(document))) finish();
			else
				finish(
					new CloudPaymentsBrowserLoadError(
						"namespace_missing",
						kind,
						`CloudPayments ${kind} script loaded without the expected cp namespace`,
					),
				);
		};
		const onError = () =>
			finish(
				new CloudPaymentsBrowserLoadError(
					"script_load_failed",
					kind,
					`Failed to load CloudPayments script: ${url}`,
				),
			);
		const timeout = setTimeout(
			() =>
				finish(
					new CloudPaymentsBrowserLoadError(
						"script_timeout",
						kind,
						`Timed out loading CloudPayments script: ${url}`,
					),
				),
			timeoutMs,
		);

		script.addEventListener("load", onLoad, { once: true });
		script.addEventListener("error", onError, { once: true });
		if (created) {
			try {
				script.src = url;
				script.async = true;
				if (options?.nonce) script.nonce = options.nonce;
				(document.head ?? document.documentElement).append(script);
			} catch {
				finish(
					new CloudPaymentsBrowserLoadError(
						"script_load_failed",
						kind,
						`Failed to append CloudPayments script: ${url}`,
					),
				);
			}
		}
	});
}

function assertReady<T extends CloudPaymentsBrowserNamespace>(
	kind: BrowserScriptKind,
	isReady: (namespace: CloudPaymentsBrowserNamespace) => namespace is T,
): (namespace: CloudPaymentsBrowserNamespace) => T {
	return (namespace) => {
		if (isReady(namespace)) return namespace;
		throw new CloudPaymentsBrowserLoadError(
			"namespace_missing",
			kind,
			`CloudPayments ${kind} script loaded without the expected cp namespace`,
		);
	};
}

function getNamespace(document: Document): CloudPaymentsBrowserNamespace {
	return document.defaultView?.cp ?? {};
}
