/**
 * Retry/backoff-примитивы для HTTP-транспорта.
 */

export interface RetryOptions {
	/** Максимум попыток (включая первую). По умолчанию 3. */
	maxAttempts?: number;
	/** Базовая задержка в мс (для полного jitter). По умолчанию 300. */
	baseDelayMs?: number;
	/** Backoff cap in ms. A larger Retry-After stops retries. Default: 10_000. */
	maxDelayMs?: number;
	/** Ретраить сетевые ошибки (fetch throw). По умолчанию true. */
	retryOnNetworkError?: boolean;
	/** Статусы, подлежащие ретраю. По умолчанию [429, 500, 502, 503, 504]. */
	retryableStatuses?: readonly number[];
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
	maxAttempts: 3,
	baseDelayMs: 300,
	maxDelayMs: 10_000,
	retryOnNetworkError: true,
	retryableStatuses: [429, 500, 502, 503, 504],
};

export function mergeRetryOptions(user?: RetryOptions): Required<RetryOptions> {
	const resolved = { ...DEFAULT_RETRY_OPTIONS, ...(user ?? {}) };
	if (!Number.isSafeInteger(resolved.maxAttempts) || resolved.maxAttempts < 1) {
		throw new RangeError("maxAttempts must be a positive safe integer");
	}
	for (const option of ["baseDelayMs", "maxDelayMs"] as const) {
		if (
			!Number.isFinite(resolved[option]) ||
			resolved[option] < 0 ||
			resolved[option] > 2_147_483_647
		) {
			throw new RangeError(`${option} must be finite, non-negative and <= 2147483647`);
		}
	}
	for (const status of resolved.retryableStatuses) {
		if (!Number.isInteger(status) || status < 100 || status > 599) {
			throw new RangeError(`retryableStatuses contains invalid HTTP status: ${status}`);
		}
	}
	return resolved;
}

/** Экспоненциальная задержка с full-jitter. Не превышает maxDelayMs. */
export function computeBackoffMs(attempt: number, base: number, max: number): number {
	const exp = Math.min(max, base * 2 ** attempt);
	return Math.floor(Math.random() * exp);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

export function isAbortError(err: unknown): boolean {
	if (!err || typeof err !== "object") return false;
	const name = (err as { name?: unknown }).name;
	return name === "AbortError";
}

/**
 * Парсит заголовок Retry-After. Возвращает задержку в мс или null, если
 * заголовок невалидный или отсутствует. Поддерживает числовую форму
 * («секунды») и HTTP-date. Positive overflow is Infinity and must stop retries.
 */
export function parseRetryAfter(header: string | null): number | null {
	if (!header) return null;
	const trimmed = header.trim();
	if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
	const date = Date.parse(trimmed);
	if (Number.isNaN(date)) return null;
	return Math.max(0, date - Date.now());
}
