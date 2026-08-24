/**
 * Верификация входящих webhook-уведомлений CloudPayments.
 *
 * CloudPayments и CloudKassir отправляют уведомления
 * (check/pay/fail/confirm/refund/recurrent/cancel/receipt) POST-ом с заголовками:
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
	ReceiptNotificationPayload,
	RecurrentNotificationPayload,
	RefundNotificationPayload,
} from "../_generated/webhook-payloads.js";
import {
	WEBHOOK_FIELD_SCHEMAS,
	WEBHOOK_FIELD_SCHEMAS_BY_TYPE,
} from "../_generated/webhook-payloads.js";

export type {
	AnyWebhookPayload,
	CancelNotificationPayload,
	CheckNotificationPayload,
	ConfirmNotificationPayload,
	FailNotificationPayload,
	PayNotificationPayload,
	ReceiptNotificationPayload,
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

export type WebhookVerificationStage =
	| "pre_verification"
	| "signature_verification"
	| "body_parsing";

export class WebhookVerificationError extends Error {
	/** `true` только после успешного сравнения HMAC, до разбора payload. */
	public readonly signatureVerified: boolean;

	constructor(
		message: string,
		public readonly reason: WebhookVerificationReason,
		/** Стадия, на которой SDK отклонил webhook. */
		public readonly stage: WebhookVerificationStage = "pre_verification",
	) {
		super(message);
		this.name = "WebhookVerificationError";
		this.signatureVerified = stage === "body_parsing";
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
	return verifyWebhookWithSchema<T>(input, WEBHOOK_FIELD_SCHEMAS);
}

async function verifyWebhookWithSchema<T>(
	input: VerifyWebhookInput,
	fieldSchemas: Readonly<Record<string, WebhookFieldSchema>>,
): Promise<T> {
	if (!input.signature) {
		throw new WebhookVerificationError(
			"Missing signature header",
			"missing_signature",
			"signature_verification",
		);
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
		throw new WebhookVerificationError(
			"Signature mismatch",
			"signature_mismatch",
			"signature_verification",
		);
	}
	if (contentType === "application/json") {
		try {
			return JSON.parse(bodyStr) as T;
		} catch (_err) {
			throw bodyParsingError("Body is not valid JSON");
		}
	}
	return parseFormUrlEncoded(bodyStr, fieldSchemas) as T;
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
	verifyWebhookWithSchema<CheckNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Check);
export const verifyPayWebhook = (i: VerifyWebhookInput) =>
	verifyWebhookWithSchema<PayNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Pay);
export const verifyFailWebhook = (i: VerifyWebhookInput) =>
	verifyWebhookWithSchema<FailNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Fail);
export const verifyConfirmWebhook = (i: VerifyWebhookInput) =>
	verifyWebhookWithSchema<ConfirmNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Confirm);
export const verifyRefundWebhook = (i: VerifyWebhookInput) =>
	verifyWebhookWithSchema<RefundNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Refund);
export const verifyRecurrentWebhook = (i: VerifyWebhookInput) =>
	verifyWebhookWithSchema<RecurrentNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Recurrent);
export const verifyCancelWebhook = (i: VerifyWebhookInput) =>
	verifyWebhookWithSchema<CancelNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Cancel);
export const verifyReceiptWebhook = (i: VerifyWebhookInput) =>
	verifyWebhookWithSchema<ReceiptNotificationPayload>(i, WEBHOOK_FIELD_SCHEMAS_BY_TYPE.Receipt);

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
			"signature_verification",
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

const OMIT_FORM_FIELD = Symbol("omit-form-field");

interface WebhookFieldSchema {
	readonly kind: "number" | "boolean" | "json";
	readonly optional: boolean;
}

function parseFormUrlEncoded(
	body: string,
	fieldSchemas: Readonly<Record<string, WebhookFieldSchema>>,
): Record<string, unknown> {
	const params = new URLSearchParams(body);
	const result: Record<string, unknown> = {};
	for (const [key, rawVal] of params) {
		const val = parseFormValue(key, rawVal, fieldSchemas);
		if (val === OMIT_FORM_FIELD) continue;
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

function parseFormValue(
	key: string,
	value: string,
	fieldSchemas: Readonly<Record<string, WebhookFieldSchema>>,
): unknown {
	const fieldSchema = fieldSchemas[key];
	if (fieldSchema?.kind === "number") {
		if (value === "" && fieldSchema.optional) return OMIT_FORM_FIELD;
		if (value.trim() === "") {
			throw bodyParsingError(`Field ${key} is not a valid number`);
		}
		const number = Number(value);
		if (!Number.isFinite(number)) {
			throw bodyParsingError(`Field ${key} is not a valid number`);
		}
		return number;
	}
	if (fieldSchema?.kind === "boolean") {
		if (value === "" && fieldSchema.optional) return OMIT_FORM_FIELD;
		if (value === "true" || value === "1") return true;
		if (value === "false" || value === "0") return false;
		throw bodyParsingError(`Field ${key} is not a valid boolean`);
	}
	if (fieldSchema?.kind === "json" && value !== "") {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			throw bodyParsingError(`Field ${key} is not valid JSON`);
		}
	}
	return value;
}

function bodyParsingError(message: string): WebhookVerificationError {
	return new WebhookVerificationError(message, "bad_body", "body_parsing");
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
		"pre_verification",
	);
}

function decodeFormForSignature(body: string): string {
	try {
		return decodeURIComponent(body.replace(/\+/g, " "));
	} catch {
		throw new WebhookVerificationError(
			"Body is not valid URL-encoded data",
			"bad_body",
			"signature_verification",
		);
	}
}
