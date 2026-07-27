/**
 * Верификация входящих webhook-уведомлений CloudPayments.
 *
 * CP отправляет уведомления (check/pay/fail/confirm/refund/recurrent/cancel) POST-ом
 * с заголовками:
 *   - Content-HMAC         — HMAC-SHA256(rawBody) в base64 при URL-encoded теле
 *   - X-Content-HMAC       — то же, но по decoded значению
 *
 * Ключ HMAC — ваш API Secret. Подробности:
 *   https://developers.cloudpayments.ru/#proverka-uvedomleniy
 *
 * Разные CP-уведомления настраиваются на разные URL на стороне ТСП, поэтому
 * тип определяется endpoint-ом, а не заголовком. Используйте `verifyWebhook<T>`
 * с заданным типом payload.
 */

import type {
	AnyWebhookPayload,
	CancelNotificationPayload,
	CheckNotificationPayload,
	ConfirmNotificationPayload,
	FailNotificationPayload,
	PayNotificationPayload,
	RecurrentNotificationPayload,
	RefundNotificationPayload,
} from "../_generated/webhook-payloads.js";
import { WEBHOOK_FIELD_KINDS } from "../_generated/webhook-payloads.js";

export type {
	AnyWebhookPayload,
	CancelNotificationPayload,
	CheckNotificationPayload,
	ConfirmNotificationPayload,
	FailNotificationPayload,
	PayNotificationPayload,
	RecurrentNotificationPayload,
	RefundNotificationPayload,
} from "../_generated/webhook-payloads.js";

export type WebhookVerificationReason =
	| "signature_mismatch"
	| "missing_signature"
	| "bad_body"
	| "bad_content_type"
	| "crypto_unavailable";

export type WebhookSignatureKind = "content-hmac" | "x-content-hmac";

export class WebhookVerificationError extends Error {
	constructor(
		message: string,
		public readonly reason: WebhookVerificationReason,
	) {
		super(message);
		this.name = "WebhookVerificationError";
	}
}

export interface VerifyWebhookInput {
	/** Сырое тело запроса как строка (UTF-8) или Uint8Array. */
	rawBody: string | Uint8Array;
	/** Значение заголовка Content-HMAC (или X-Content-HMAC), base64. */
	signature: string | null | undefined;
	/**
	 * Какой заголовок передан. Content-HMAC подписывает encoded body,
	 * X-Content-HMAC — URL-decoded body. По умолчанию Content-HMAC.
	 */
	signatureKind?: WebhookSignatureKind;
	/** API Secret из ЛК CloudPayments (НЕ Public ID). */
	apiSecret: string;
	/**
	 * Content-Type запроса. По умолчанию `application/x-www-form-urlencoded`
	 * — формат, который CP использует out-of-the-box.
	 */
	contentType?: string;
}

/**
 * Проверяет подпись и парсит payload в заданный тип T.
 *
 * - Не делает специальных проверок «Мошеннический IP» — адреса CP указаны в доке.
 *   Проверку по IP лучше делать на уровне ingress/reverse proxy.
 * - Константное время сравнения подписи (timing-safe).
 */
export async function verifyWebhook<T = AnyWebhookPayload>(input: VerifyWebhookInput): Promise<T> {
	if (!input.signature) {
		throw new WebhookVerificationError("Missing signature header", "missing_signature");
	}
	const bodyBytes = typeof input.rawBody === "string" ? encodeUtf8(input.rawBody) : input.rawBody;
	const bodyStr =
		typeof input.rawBody === "string" ? input.rawBody : new TextDecoder("utf-8").decode(bodyBytes);
	const contentType = normalizeContentType(input.contentType);
	const signatureBytes =
		input.signatureKind === "x-content-hmac" && contentType === "application/x-www-form-urlencoded"
			? encodeUtf8(decodeFormForSignature(bodyStr))
			: bodyBytes;
	const expected = await hmacSha256Base64(input.apiSecret, signatureBytes);
	if (!timingSafeEqual(expected, input.signature)) {
		throw new WebhookVerificationError("Signature mismatch", "signature_mismatch");
	}
	if (contentType === "application/json") {
		try {
			return JSON.parse(bodyStr) as T;
		} catch (_err) {
			throw new WebhookVerificationError("Body is not valid JSON", "bad_body");
		}
	}
	return parseFormUrlEncoded(bodyStr) as T;
}

/**
 * Стандартный ответ на Check-уведомление: { code: 0 } — платёж может быть
 * проведён. Передайте {@link CheckCallbackCode} для отклонения.
 */
export function checkResponse(code: 0 | 10 | 11 | 12 | 13 | 20 = 0): { code: typeof code } {
	return { code };
}

/* ───────────────────── Typed helpers ─────────────────────
 * Один универсальный verifyWebhook<T> достаточно, но пользователям удобнее
 * явные имена методов без generic-параметра — не надо помнить как называется тип.
 */
export const verifyCheckWebhook = (i: VerifyWebhookInput) =>
	verifyWebhook<CheckNotificationPayload>(i);
export const verifyPayWebhook = (i: VerifyWebhookInput) => verifyWebhook<PayNotificationPayload>(i);
export const verifyFailWebhook = (i: VerifyWebhookInput) =>
	verifyWebhook<FailNotificationPayload>(i);
export const verifyConfirmWebhook = (i: VerifyWebhookInput) =>
	verifyWebhook<ConfirmNotificationPayload>(i);
export const verifyRefundWebhook = (i: VerifyWebhookInput) =>
	verifyWebhook<RefundNotificationPayload>(i);
export const verifyRecurrentWebhook = (i: VerifyWebhookInput) =>
	verifyWebhook<RecurrentNotificationPayload>(i);
export const verifyCancelWebhook = (i: VerifyWebhookInput) =>
	verifyWebhook<CancelNotificationPayload>(i);

/* ───────────────────── Internals ───────────────────── */

function encodeUtf8(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

async function hmacSha256Base64(secret: string, data: Uint8Array): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) {
		throw new WebhookVerificationError(
			"WebCrypto (crypto.subtle) is not available in this runtime",
			"crypto_unavailable",
		);
	}
	const keyBytes = encodeUtf8(secret);
	const key = await subtle.importKey(
		"raw",
		keyBytes as unknown as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await subtle.sign("HMAC", key, data as unknown as BufferSource);
	return base64Encode(new Uint8Array(sig));
}

function base64Encode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function parseFormUrlEncoded(body: string): Record<string, unknown> {
	const params = new URLSearchParams(body);
	const result: Record<string, unknown> = {};
	for (const [key, rawVal] of params) {
		const val = parseFormValue(key, rawVal);
		if (key in result) {
			const existing = result[key];
			if (Array.isArray(existing)) existing.push(val);
			else result[key] = [existing, val];
		} else {
			result[key] = val;
		}
	}
	return result;
}

function parseFormValue(key: string, value: string): unknown {
	const fieldKind = (WEBHOOK_FIELD_KINDS as Partial<Record<string, "number" | "boolean" | "json">>)[
		key
	];
	if (fieldKind === "number") {
		if (value.trim() === "") {
			throw new WebhookVerificationError(`Field ${key} is not a valid number`, "bad_body");
		}
		const number = Number(value);
		if (!Number.isFinite(number)) {
			throw new WebhookVerificationError(`Field ${key} is not a valid number`, "bad_body");
		}
		return number;
	}
	if (fieldKind === "boolean") {
		if (value === "true" || value === "1") return true;
		if (value === "false" || value === "0") return false;
		throw new WebhookVerificationError(`Field ${key} is not a valid boolean`, "bad_body");
	}
	if (fieldKind === "json" && value !== "") {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			throw new WebhookVerificationError(`Field ${key} is not valid JSON`, "bad_body");
		}
	}
	return value;
}

function normalizeContentType(
	contentType?: string,
): "application/x-www-form-urlencoded" | "application/json" {
	const normalized = (contentType ?? "application/x-www-form-urlencoded")
		.split(";", 1)[0]
		?.trim()
		.toLowerCase();
	if (normalized === "application/json" || normalized === "application/x-www-form-urlencoded") {
		return normalized;
	}
	throw new WebhookVerificationError(
		`Unsupported Content-Type: ${contentType}`,
		"bad_content_type",
	);
}

function decodeFormForSignature(body: string): string {
	try {
		return decodeURIComponent(body.replace(/\+/g, " "));
	} catch {
		throw new WebhookVerificationError("Body is not valid URL-encoded data", "bad_body");
	}
}
