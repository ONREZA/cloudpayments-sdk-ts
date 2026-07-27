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
	CloudPaymentsSdkError,
	CloudPaymentsUnknownOutcomeError,
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
	/** Безопасные для логирования заголовки. Authorization намеренно исключён. */
	headers: Record<string, string>;
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
	/** Ошибки telemetry не влияют на сетевой запрос и передаются только сюда. */
	onHookError?: (
		hook: "onRequest" | "onResponse" | "onError",
		error: unknown,
	) => void | Promise<void>;
}

export type RequestReplaySafety = "safe" | "requires-idempotency";

export interface HttpClientOptions {
	credentials: CloudPaymentsCredentials;
	/** API origin для относительных endpoint paths. По умолчанию `https://api.cloudpayments.ru`. */
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
	/** Кастомный fetch для совместимого runtime или тестов. */
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
	/**
	 * `safe` разрешает replay без X-Request-ID и предназначен только для
	 * семантически read-only endpoint-ов. Mutation по умолчанию требует ключ.
	 */
	replaySafety?: RequestReplaySafety;
}

const DEFAULT_USER_AGENT = `${CP_SDK_NAME}/${CP_SDK_VERSION}`;

export class CloudPaymentsHttpClient {
	readonly #credentials: CloudPaymentsCredentials;
	readonly #baseUrl: URL;
	readonly #timeoutMs: number;
	readonly #retry: Required<RetryOptions>;
	readonly #fetch: typeof fetch;
	readonly #userAgent: string;
	readonly #semaphore: Semaphore | null;
	readonly #hooks: TelemetryHooks;

	constructor(opts: HttpClientOptions) {
		this.#credentials = opts.credentials;
		this.#baseUrl = new URL(opts.baseUrl ?? "https://api.cloudpayments.ru");
		this.#timeoutMs = opts.timeoutMs ?? 60_000;
		this.#retry = mergeRetryOptions(opts.retry);
		this.#fetch = opts.fetch ?? globalThis.fetch;
		this.#userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
		this.#semaphore = opts.concurrency === undefined ? null : new Semaphore(opts.concurrency);
		this.#hooks = opts.hooks ?? {};
	}

	/**
	 * Отправляет POST на абсолютный или относительный URL. Возвращает JSON body.
	 * HTTP-уровень — не бизнес: { Success: false } здесь НЕ бросается.
	 */
	async post<T>(url: string, body: unknown, opts: PostOptions = {}): Promise<T> {
		const absoluteUrl = this.#resolveUrl(url);

		const configuredRetry =
			opts.retry === false
				? { ...this.#retry, maxAttempts: 1 }
				: mergeRetryOptions({ ...this.#retry, ...(opts.retry ?? {}) });
		const replayAllowed = opts.replaySafety === "safe" || Boolean(opts.idempotencyKey);
		const retryCfg = replayAllowed ? configuredRetry : { ...configuredRetry, maxAttempts: 1 };

		let payload: string | undefined;
		try {
			payload = JSON.stringify(body ?? {});
		} catch (cause) {
			throw new CloudPaymentsSdkError("Request body is not JSON-serializable", cause);
		}
		if (payload === undefined) {
			throw new CloudPaymentsSdkError("Request body is not JSON-serializable");
		}
		const exec = () => this.#executeWithRetry<T>(absoluteUrl, payload, retryCfg, opts);
		return this.#semaphore ? this.#semaphore.run(exec, opts.signal) : exec();
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
		const telemetryHeaders = { ...baseHeaders };
		delete telemetryHeaders.Authorization;

		let lastError: unknown = null;
		for (let attempt = 0; attempt < retryCfg.maxAttempts; attempt++) {
			const reqCtx: RequestContext = {
				method: "POST",
				url: absoluteUrl,
				headers: { ...telemetryHeaders },
				attempt,
			};
			const timeoutCtrl = new AbortController();
			const onUserAbort = () => timeoutCtrl.abort(opts.signal?.reason);
			let timedOut = false;
			let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
			const stopAttempt = () => {
				if (timeoutHandle !== undefined) {
					clearTimeout(timeoutHandle);
					timeoutHandle = undefined;
				}
				opts.signal?.removeEventListener("abort", onUserAbort);
			};
			let startedAt = Date.now();
			try {
				await this.#invokeHook("onRequest", () => this.#hooks.onRequest?.(reqCtx));
				if (opts.signal?.aborted) {
					throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
				}
				opts.signal?.addEventListener("abort", onUserAbort, { once: true });
				timeoutHandle = setTimeout(() => {
					timedOut = true;
					timeoutCtrl.abort(new DOMException("Request timeout", "TimeoutError"));
				}, this.#timeoutMs);
				startedAt = Date.now();

				const res = await this.#fetch(absoluteUrl, {
					method: "POST",
					headers: baseHeaders,
					body: payload,
					signal: timeoutCtrl.signal,
					redirect: "error",
				});

				const text = res.ok ? await res.text() : await safeText(res);
				stopAttempt();
				const durationMs = Date.now() - startedAt;
				const respCtx: ResponseContext = {
					request: reqCtx,
					status: res.status,
					statusText: res.statusText,
					durationMs,
				};
				await this.#invokeHook("onResponse", () => this.#hooks.onResponse?.(respCtx));

				if (res.ok) {
					if (!text) return {} as T;
					try {
						return JSON.parse(text) as T;
					} catch (cause) {
						const contractError = new CloudPaymentsSdkError(
							"CloudPayments returned invalid JSON",
							cause,
						);
						throw this.#ambiguousOutcomeError(contractError, absoluteUrl, opts);
					}
				}

				// non-2xx
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
				if (retryCfg.retryableStatuses.includes(res.status)) {
					const outcomeError = this.#ambiguousOutcomeError(httpErr, absoluteUrl, opts);
					if (outcomeError !== httpErr) throw outcomeError;
					if (attempt + 1 < retryCfg.maxAttempts) {
						lastError = httpErr;
						await sleep(
							computeBackoffMs(attempt, retryCfg.baseDelayMs, retryCfg.maxDelayMs),
							opts.signal,
						);
						continue;
					}
				}
				throw httpErr;
			} catch (err) {
				stopAttempt();
				const durationMs = Date.now() - startedAt;
				if (opts.signal?.aborted) {
					const abortReason = opts.signal.reason ?? err;
					await this.#invokeHook("onError", () =>
						this.#hooks.onError?.({ request: reqCtx, error: abortReason, durationMs }),
					);
					throw abortReason;
				}
				if (timedOut || isAbortError(err)) {
					const netErr = this.#networkError("Request timeout", err, absoluteUrl, opts);
					await this.#invokeHook("onError", () =>
						this.#hooks.onError?.({ request: reqCtx, error: netErr, durationMs }),
					);
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
				if (
					err instanceof CloudPaymentsHttpError ||
					err instanceof CloudPaymentsSdkError ||
					err instanceof CloudPaymentsUnknownOutcomeError
				) {
					await this.#invokeHook("onError", () =>
						this.#hooks.onError?.({ request: reqCtx, error: err, durationMs }),
					);
					throw err;
				}
				// fetch throw (network, DNS, …)
				const netErr = this.#networkError("Network error", err, absoluteUrl, opts);
				await this.#invokeHook("onError", () =>
					this.#hooks.onError?.({ request: reqCtx, error: netErr, durationMs }),
				);
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
				stopAttempt();
			}
		}
		throw lastError ?? new CloudPaymentsNetworkError("Retry limit exhausted", null);
	}

	#resolveUrl(url: string): string {
		const resolved = new URL(url, this.#baseUrl);
		if (resolved.origin !== this.#baseUrl.origin) {
			throw new CloudPaymentsSdkError(
				`Refusing to send CloudPayments credentials to external origin: ${resolved.origin}`,
			);
		}
		return resolved.toString();
	}

	#networkError(
		message: string,
		cause: unknown,
		endpoint: string,
		opts: PostOptions,
	): CloudPaymentsNetworkError | CloudPaymentsUnknownOutcomeError {
		if (this.#isUnprotectedMutation(opts))
			return new CloudPaymentsUnknownOutcomeError(endpoint, cause);
		return new CloudPaymentsNetworkError(message, cause);
	}

	#ambiguousOutcomeError<T extends CloudPaymentsHttpError | CloudPaymentsSdkError>(
		error: T,
		endpoint: string,
		opts: PostOptions,
	): T | CloudPaymentsUnknownOutcomeError {
		return this.#isUnprotectedMutation(opts)
			? new CloudPaymentsUnknownOutcomeError(endpoint, error)
			: error;
	}

	#isUnprotectedMutation(opts: PostOptions): boolean {
		return opts.replaySafety !== "safe" && !opts.idempotencyKey;
	}

	async #invokeHook(
		name: "onRequest" | "onResponse" | "onError",
		invoke: () => void | Promise<void> | undefined,
	): Promise<void> {
		try {
			await invoke();
		} catch (error) {
			try {
				await this.#hooks.onHookError?.(name, error);
			} catch {
				// Telemetry не является частью платёжного результата.
			}
		}
	}
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}
