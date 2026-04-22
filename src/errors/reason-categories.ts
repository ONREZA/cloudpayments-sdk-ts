/**
 * Классификация ReasonCode по функциональным категориям.
 * Коды из справочника `#kody-oshibok` документации CloudPayments.
 *
 * Источник группировки — описания в доке + исторические коды ISO 8583:
 *  https://developers.cloudpayments.ru/#kody-oshibok
 */

export type ReasonCategory =
	/** Недостаточно средств / превышены лимиты счёта */
	| "insufficientFunds"
	/** Эмитент отклонил операцию (без указания конкретной причины) */
	| "declineByIssuer"
	/** Антифрод / подозрение на мошенничество */
	| "fraudSuspected"
	/** Проблема с самой картой (просрочена, украдена, невалидный CVV/PIN) */
	| "cardProblem"
	/** Сетевая ошибка платёжной системы */
	| "networkError"
	/** Ошибка 3-D Secure аутентификации */
	| "authenticationFailed"
	/** Некорректные параметры запроса */
	| "invalidRequest"
	/** Внутренняя ошибка CloudPayments (validation отказы, 6xxx коды) */
	| "serviceError"
	/** Неклассифицирован */
	| "unknown";

const INSUFFICIENT_FUNDS = new Set([5051, 5061, 5065, 5303]);
const DECLINE_BY_ISSUER = new Set([5001, 5005, 5012, 5057, 5058, 5113]);
const FRAUD_SUSPECTED = new Set([5034, 5059, 5063, 5204, 5300]);
const CARD_PROBLEM = new Set([5014, 5033, 5036, 5041, 5043, 5054, 5055, 5062, 5082]);
const NETWORK_ERROR = new Set([5091, 5092, 5096]);
const AUTHENTICATION_FAILED = new Set([5206, 5207]);
const INVALID_REQUEST = new Set([
	5003, 5006, 5007, 5013, 5015, 5017, 5019, 5030, 5031, 5761, 5762, 5763,
]);

export function categorizeReasonCode(code: number | undefined): ReasonCategory {
	if (code === undefined || code === 0) return "unknown";
	if (INSUFFICIENT_FUNDS.has(code)) return "insufficientFunds";
	if (DECLINE_BY_ISSUER.has(code)) return "declineByIssuer";
	if (FRAUD_SUSPECTED.has(code)) return "fraudSuspected";
	if (CARD_PROBLEM.has(code)) return "cardProblem";
	if (NETWORK_ERROR.has(code)) return "networkError";
	if (AUTHENTICATION_FAILED.has(code)) return "authenticationFailed";
	if (INVALID_REQUEST.has(code)) return "invalidRequest";
	// 6xxx — все validation-ошибки CP уровня сервиса
	if (code >= 6000 && code < 7000) return "serviceError";
	return "unknown";
}
