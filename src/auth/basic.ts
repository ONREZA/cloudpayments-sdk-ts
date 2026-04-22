/**
 * HTTP Basic Auth для CloudPayments: Public ID:API Secret в заголовке Authorization.
 * См. https://developers.cloudpayments.ru/#autentifikatsiya-zaprosov
 */

export interface CloudPaymentsCredentials {
	/** Public ID из личного кабинета CloudPayments (pk_...) */
	publicId: string;
	/** API Secret из личного кабинета CloudPayments */
	apiSecret: string;
}

/** Готовит значение заголовка Authorization: `Basic base64(publicId:apiSecret)`. */
export function buildBasicAuthHeader(creds: CloudPaymentsCredentials): string {
	const raw = `${creds.publicId}:${creds.apiSecret}`;
	return `Basic ${base64Encode(raw)}`;
}

/** Кроссрантайм base64 (Node 16+, Bun, Workers, Browser). */
function base64Encode(input: string): string {
	if (typeof btoa === "function") {
		const bytes = new TextEncoder().encode(input);
		let binary = "";
		for (const b of bytes) binary += String.fromCharCode(b);
		return btoa(binary);
	}
	// Node fallback (не требуется для Node 16+, но на всякий случай)
	return Buffer.from(input, "utf8").toString("base64");
}
