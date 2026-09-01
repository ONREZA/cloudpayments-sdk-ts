/**
 * Иерархия ошибок CloudPayments SDK.
 *
 * Все ошибки, которые бросает SDK, наследуются от CloudPaymentsError. Они
 * структурированные — status, ReasonCode, Message, Model, etc. Никогда не
 * разбирайте строковое .message — используйте instanceof и поля.
 */

import { categorizeReasonCode, type ReasonCategory } from "./reason-categories.js";

export type { ReasonCategory } from "./reason-categories.js";
export { categorizeReasonCode } from "./reason-categories.js";

export class CloudPaymentsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CloudPaymentsError";
	}
}

/** Сбой транспорта: DNS, connection, timeout или другой fetch throw. */
export class CloudPaymentsNetworkError extends CloudPaymentsError {
	constructor(message: string, cause: unknown) {
		super(message);
		this.name = "CloudPaymentsNetworkError";
		if (cause !== undefined) this.cause = cause;
	}
}

/**
 * Неоднозначный результат mutation-запроса без ключа идемпотентности.
 * Сюда входят сетевой обрыв, transient HTTP-ошибка и некорректный успешный
 * ответ: операция могла быть обработана, поэтому её нужно сначала сверить.
 */
export class CloudPaymentsUnknownOutcomeError extends CloudPaymentsError {
	constructor(
		public readonly endpoint: string,
		cause: unknown,
	) {
		super("Request outcome is unknown; reconcile it before retrying");
		this.name = "CloudPaymentsUnknownOutcomeError";
		if (cause !== undefined) this.cause = cause;
	}
}

/** HTTP-ответ с non-2xx статусом (до разбора тела). */
export class CloudPaymentsHttpError extends CloudPaymentsError {
	constructor(
		public readonly status: number,
		public readonly statusText: string,
		public readonly body: string,
	) {
		super(`HTTP ${status} ${statusText}`);
		this.name = "CloudPaymentsHttpError";
	}
}

/** 401 — неверные или отсутствующие Public ID / API Secret. */
export class CloudPaymentsAuthError extends CloudPaymentsHttpError {
	constructor(statusText: string, body: string) {
		super(401, statusText, body);
		this.name = "CloudPaymentsAuthError";
		this.message = "Unauthorized: проверьте Public ID и API Secret";
	}
}

/** 429 — слишком много запросов. */
export class CloudPaymentsRateLimitError extends CloudPaymentsHttpError {
	constructor(
		statusText: string,
		body: string,
		public readonly retryAfterMs: number | null,
	) {
		super(429, statusText, body);
		this.name = "CloudPaymentsRateLimitError";
	}
}

/**
 * API вернул { Success: false, Message: "..." }. Бизнес-ошибка: неверный
 * параметр, операция невозможна и т.п. Model может содержать доп. контекст
 * (например, код ошибки в поле ReasonCode), а верхнеуровневый ErrorCode
 * сохраняется отдельно и не участвует в категоризации карточных отказов.
 */
export class CloudPaymentsBusinessError extends CloudPaymentsError {
	constructor(
		public readonly apiMessage: string,
		public readonly model: unknown,
		public readonly reasonCode: number | undefined,
		/** Верхнеуровневый ErrorCode ответа API; это не обязательно карточный ReasonCode. */
		public readonly apiErrorCode?: string | number | null,
	) {
		super(apiMessage || "CloudPayments business error");
		this.name = "CloudPaymentsBusinessError";
	}

	/** Классификация по ReasonCode (см. reason-categories.ts). */
	category(): ReasonCategory {
		return categorizeReasonCode(this.reasonCode);
	}

	/** Недостаточно средств / превышены лимиты счёта. */
	isInsufficientFunds(): boolean {
		return this.category() === "insufficientFunds";
	}

	/** Эмитент отклонил операцию. */
	isDeclineByIssuer(): boolean {
		return this.category() === "declineByIssuer";
	}

	/** Заподозрено мошенничество (антифрод/issuer-fraud). */
	isFraudSuspected(): boolean {
		return this.category() === "fraudSuspected";
	}

	/** Проблема с самой картой: просрочена, украдена, невалидный CVV/PIN. */
	isCardProblem(): boolean {
		return this.category() === "cardProblem";
	}

	/** Ошибка 3-D Secure аутентификации. */
	isAuthenticationFailed(): boolean {
		return this.category() === "authenticationFailed";
	}

	/** Transient-сетевая ошибка на стороне платёжной системы. */
	isNetworkError(): boolean {
		return this.category() === "networkError";
	}

	/** Ошибка валидации параметров запроса. */
	isInvalidRequest(): boolean {
		return this.category() === "invalidRequest";
	}

	/**
	 * Provider указал временную сетевую ошибку. Для mutation повтор допустим
	 * только с тем же ключом идемпотентности.
	 */
	isRetriable(): boolean {
		return this.category() === "networkError";
	}
}

/**
 * Специальная форма бизнес-ошибки: эквайер требует 3-D Secure аутентификацию
 * держателя карты. В Model — AcsUrl / PaReq / TransactionId, по которым клиент
 * обязан отправить плательщика на сайт эмитента и после вернуть PaRes через
 * {@link POST /payments/cards/post3ds}.
 */
export class CloudPayments3DsRequiredError extends CloudPaymentsError {
	constructor(
		public readonly transactionId: number,
		public readonly paReq: string,
		public readonly acsUrl: string,
		public readonly threeDsCallbackId: string | null,
		public readonly raw: unknown,
	) {
		super("3-D Secure authentication required");
		this.name = "CloudPayments3DsRequiredError";
	}
}

/** SDK-инварианты: некорректное использование, неконсистентный ответ API и т.п. */
export class CloudPaymentsSdkError extends CloudPaymentsError {
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "CloudPaymentsSdkError";
		if (cause !== undefined) this.cause = cause;
	}
}
