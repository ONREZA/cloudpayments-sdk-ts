/**
 * Retry/backoff-примитивы для HTTP-транспорта.
 */

export interface RetryOptions {
	/** Максимум попыток (включая первую). По умолчанию 3. */
	maxAttempts?: number;
	/** Базовая задержка в мс (для полного jitter). По умолчанию 300. */
	baseDelayMs?: number;
	/** Верхний потолок задержки в мс. По умолчанию 10_000. */
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
	return { ...DEFAULT_RETRY_OPTIONS, ...(user ?? {}) };
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
		const t = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(t);
				reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
			},
			{ once: true },
		);
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
 * («секунды») и HTTP-date.
 */
export function parseRetryAfter(header: string | null): number | null {
	if (!header) return null;
	const trimmed = header.trim();
	if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
	const date = Date.parse(trimmed);
	if (Number.isNaN(date)) return null;
	return Math.max(0, date - Date.now());
}
