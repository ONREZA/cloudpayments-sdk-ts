/** @onreza/cloudpayments-sdk — публичные exports */

// Сгенерированное — request типы, enum'ы справочников, константы URL
export * from "./_generated/endpoints.js";
export * from "./_generated/handbooks.js";
export * from "./_generated/meta.js";
// Аутентификация
export type { CloudPaymentsCredentials } from "./auth/basic.js";
export { buildBasicAuthHeader } from "./auth/basic.js";
export { CloudPaymentsClient, type CloudPaymentsClientOptions } from "./client.js";
export type {
	ErrorContext,
	HttpClientOptions,
	PostOptions,
	RequestContext,
	RequestReplaySafety,
	ResponseContext,
	TelemetryHooks,
} from "./core/http.js";
// Транспорт и опции
export { CloudPaymentsHttpClient } from "./core/http.js";
export type { RetryOptions } from "./core/retry.js";
export { DEFAULT_RETRY_OPTIONS } from "./core/retry.js";
export { Semaphore } from "./core/semaphore.js";
export type { ReasonCategory } from "./errors/index.js";
// Ошибки (доступны также через subpath "@onreza/cloudpayments-sdk/errors")
export {
	CloudPayments3DsRequiredError,
	CloudPaymentsAuthError,
	CloudPaymentsBusinessError,
	CloudPaymentsError,
	CloudPaymentsHttpError,
	CloudPaymentsNetworkError,
	CloudPaymentsRateLimitError,
	CloudPaymentsSdkError,
	CloudPaymentsUnknownOutcomeError,
	categorizeReasonCode,
} from "./errors/index.js";
export * from "./kkt-types.js";
export * from "./models.js";
export { SberPayModule, SbpModule, TPayModule } from "./modules/alternative-payments.js";
export type { ExecOptions } from "./modules/base.js";
export { EscrowModule } from "./modules/escrow.js";
export { KktModule } from "./modules/kkt.js";
export { OrdersModule } from "./modules/orders.js";
// Модули (для type inference и использования напрямую)
export { PaymentsModule } from "./modules/payments.js";
export { type NotificationSetting, SettingsModule } from "./modules/settings.js";
export { SubscriptionsModule } from "./modules/subscriptions.js";
// Response shapes
export type {
	AlternativePaymentIntent,
	ApiEnvelope,
	Chargeback,
	CheckCallbackCode,
	EscrowInfo,
	EscrowPayoutTransaction,
	EscrowTransaction,
	Order,
	OrderStatus,
	SbpBank,
	SbpBankList,
	Subscription,
	ThreeDsChallenge,
	TokenRecord,
	Transaction,
} from "./types.js";
