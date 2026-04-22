/**
 * HTTP-транспорт CloudPayments SDK.
 *
 * Реализует:
 *  - POST к API с Basic Auth заголовком
 *  - идемпотентность через X-Request-ID
 *  - retry с backoff для 429/5xx/сетевых ошибок
 *  - timeout через AbortController
 *  - маппинг HTTP-ответов в доменные ошибки
 *  - client-side concurrency limit (семafore)
 *  - telemetry hooks (onRequest / onResponse / onError)
 *
 * НЕ обрабатывает распаковку { Success, Message, Model } — это уровень модулей.
 */

import { CP_SDK_NAME, CP_SDK_VERSION } from "../_generated/meta.js";
import { buildBasicAuthHeader, type CloudPaymentsCredentials } from "../auth/basic.js";
import {
	CloudPaymentsAuthError,
	CloudPaymentsHttpError,
	CloudPaymentsNetworkError,
	CloudPaymentsRateLimitError,
} from "../errors/index.js";
import {
	computeBackoffMs,
	isAbortError,
	mergeRetryOptions,
	parseRetryAfter,
	type RetryOptions,
	sleep,
} from "./retry.js";
import { Semaphore } from "./semaphore.js";

export interface RequestContext {
	method: "POST";
	url: string;
	headers: Record<string, string>;
	body: string;
	attempt: number;
}

export interface ResponseContext {
	request: RequestContext;
	status: number;
	statusText: string;
	/** Время от начала запроса до получения ответа, мс. */
	durationMs: number;
}

export interface ErrorContext {
	request: RequestContext;
	error: unknown;
	durationMs: number;
}

export interface TelemetryHooks {
	onRequest?: (ctx: RequestContext) => void | Promise<void>;
	onResponse?: (ctx: ResponseContext) => void | Promise<void>;
	onError?: (ctx: ErrorContext) => void | Promise<void>;
}

export interface HttpClientOptions {
	credentials: CloudPaymentsCredentials;
	/** Базовый URL (по умолчанию — домен из endpoints). Используется только для относительных путей. */
	baseUrl?: string;
	/** Timeout на запрос в мс. По умолчанию 60_000. */
	timeoutMs?: number;
	/** Retry-опции. См. {@link RetryOptions}. */
	retry?: RetryOptions;
	/**
	 * Максимум одновременных in-flight запросов. У CP лимит 5 для test / 30
	 * для prod терминалов — при превышении возвращают 429. Клиентский
	 * semaphore позволяет self-throttle. По умолчанию без ограничений.
	 */
	concurrency?: number;
	/** Кастомный fetch (для Workers, мок-тестов). */
	fetch?: typeof fetch;
	/** User-Agent, по умолчанию `@onreza/cloudpayments-sdk/<version>`. */
	userAgent?: string;
	/** Хуки для логирования / трейсинга. */
	hooks?: TelemetryHooks;
}

export interface PostOptions {
	/** X-Request-ID для идемпотентности — CP хранит результат 1 час. */
	idempotencyKey?: string;
	/** AbortSignal от пользователя. */
	signal?: AbortSignal;
	/** Разрешить retry для этого конкретного запроса (переопределяет клиентский retry). */
	retry?: RetryOptions | false;
}

const DEFAULT_USER_AGENT = `${CP_SDK_NAME}/${CP_SDK_VERSION}`;

export class CloudPaymentsHttpClient {
	readonly #credentials: CloudPaymentsCredentials;
	readonly #baseUrl: string;
	readonly #timeoutMs: number;
	readonly #retry: Required<RetryOptions>;
	readonly #fetch: typeof fetch;
	readonly #userAgent: string;
	readonly #semaphore: Semaphore | null;
	readonly #hooks: TelemetryHooks;

	constructor(opts: HttpClientOptions) {
		this.#credentials = opts.credentials;
		this.#baseUrl = opts.baseUrl ?? "https://api.cloudpayments.ru";
		this.#timeoutMs = opts.timeoutMs ?? 60_000;
		this.#retry = mergeRetryOptions(opts.retry);
		this.#fetch = opts.fetch ?? globalThis.fetch;
		this.#userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
		this.#semaphore = opts.concurrency ? new Semaphore(opts.concurrency) : null;
		this.#hooks = opts.hooks ?? {};
	}

	/**
	 * Отправляет POST на абсолютный или относительный URL. Возвращает JSON body.
	 * HTTP-уровень — не бизнес: { Success: false } здесь НЕ бросается.
	 */
	async post<T>(url: string, body: unknown, opts: PostOptions = {}): Promise<T> {
		const absoluteUrl = url.startsWith("http")
			? url
			: `${this.#baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;

		const retryCfg =
			opts.retry === false
				? { ...this.#retry, maxAttempts: 1 }
				: mergeRetryOptions(opts.retry ?? this.#retry);

		const payload = JSON.stringify(body ?? {});
		const exec = () => this.#executeWithRetry<T>(absoluteUrl, payload, retryCfg, opts);
		return this.#semaphore ? this.#semaphore.run(exec) : exec();
	}

	async #executeWithRetry<T>(
		absoluteUrl: string,
		payload: string,
		retryCfg: Required<RetryOptions>,
		opts: PostOptions,
	): Promise<T> {
		const baseHeaders: Record<string, string> = {
			Authorization: buildBasicAuthHeader(this.#credentials),
			"Content-Type": "application/json",
			Accept: "application/json",
			"User-Agent": this.#userAgent,
		};
		if (opts.idempotencyKey) baseHeaders["X-Request-ID"] = opts.idempotencyKey;

		let lastError: unknown = null;
		for (let attempt = 0; attempt < retryCfg.maxAttempts; attempt++) {
			const timeoutCtrl = new AbortController();
			const onUserAbort = () => timeoutCtrl.abort(opts.signal?.reason);
			if (opts.signal) {
				if (opts.signal.aborted) throw opts.signal.reason;
				opts.signal.addEventListener("abort", onUserAbort, { once: true });
			}
			const timeoutHandle = setTimeout(
				() => timeoutCtrl.abort(new DOMException("Request timeout", "TimeoutError")),
				this.#timeoutMs,
			);

			const reqCtx: RequestContext = {
				method: "POST",
				url: absoluteUrl,
				headers: { ...baseHeaders },
				body: payload,
				attempt,
			};
			const startedAt = Date.now();
			try {
				await this.#hooks.onRequest?.(reqCtx);

				const res = await this.#fetch(absoluteUrl, {
					method: "POST",
					headers: baseHeaders,
					body: payload,
					signal: timeoutCtrl.signal,
				});

				const durationMs = Date.now() - startedAt;
				const respCtx: ResponseContext = {
					request: reqCtx,
					status: res.status,
					statusText: res.statusText,
					durationMs,
				};
				await this.#hooks.onResponse?.(respCtx);

				if (res.ok) {
					const text = await res.text();
					if (!text) return {} as T;
					try {
						return JSON.parse(text) as T;
					} catch {
						throw new CloudPaymentsHttpError(res.status, res.statusText, text);
					}
				}

				// non-2xx
				const text = await safeText(res);
				if (res.status === 401) throw new CloudPaymentsAuthError(res.statusText, text);
				if (res.status === 429) {
					const retryAfterMs = parseRetryAfter(res.headers.get("Retry-After"));
					const retryErr = new CloudPaymentsRateLimitError(res.statusText, text, retryAfterMs);
					if (attempt + 1 < retryCfg.maxAttempts) {
						lastError = retryErr;
						await sleep(
							retryAfterMs ?? computeBackoffMs(attempt, retryCfg.baseDelayMs, retryCfg.maxDelayMs),
							opts.signal,
						);
						continue;
					}
					throw retryErr;
				}
				const httpErr = new CloudPaymentsHttpError(res.status, res.statusText, text);
				if (retryCfg.retryableStatuses.includes(res.status) && attempt + 1 < retryCfg.maxAttempts) {
					lastError = httpErr;
					await sleep(
						computeBackoffMs(attempt, retryCfg.baseDelayMs, retryCfg.maxDelayMs),
						opts.signal,
					);
					continue;
				}
				throw httpErr;
			} catch (err) {
				const durationMs = Date.now() - startedAt;
				// AbortError: либо timeout, либо пользовательский cancel.
				if (isAbortError(err)) {
					const isUserCancel = opts.signal?.aborted === true;
					if (isUserCancel) {
						await this.#hooks.onError?.({ request: reqCtx, error: err, durationMs });
						throw err;
					}
					const netErr = new CloudPaymentsNetworkError("Request timeout", err);
					await this.#hooks.onError?.({ request: reqCtx, error: netErr, durationMs });
					if (retryCfg.retryOnNetworkError && attempt + 1 < retryCfg.maxAttempts) {
						lastError = netErr;
						await sleep(
							computeBackoffMs(attempt, retryCfg.baseDelayMs, retryCfg.maxDelayMs),
							opts.signal,
						);
						continue;
					}
					throw netErr;
				}
				if (err instanceof CloudPaymentsHttpError || err instanceof CloudPaymentsAuthError) {
					await this.#hooks.onError?.({ request: reqCtx, error: err, durationMs });
					throw err;
				}
				// fetch throw (network, DNS, …)
				const netErr = new CloudPaymentsNetworkError("Network error", err);
				await this.#hooks.onError?.({ request: reqCtx, error: netErr, durationMs });
				if (retryCfg.retryOnNetworkError && attempt + 1 < retryCfg.maxAttempts) {
					lastError = netErr;
					await sleep(
						computeBackoffMs(attempt, retryCfg.baseDelayMs, retryCfg.maxDelayMs),
						opts.signal,
					);
					continue;
				}
				throw netErr;
			} finally {
				clearTimeout(timeoutHandle);
				opts.signal?.removeEventListener("abort", onUserAbort);
			}
		}
		throw lastError ?? new CloudPaymentsNetworkError("Retry limit exhausted", null);
	}
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}
