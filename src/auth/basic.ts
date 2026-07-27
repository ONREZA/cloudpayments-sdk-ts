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

/** UTF-8 base64 через Web API, доступный в поддерживаемых runtime. */
function base64Encode(input: string): string {
	const bytes = new TextEncoder().encode(input);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
