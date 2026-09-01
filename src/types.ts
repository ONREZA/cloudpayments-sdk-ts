/**
 * Ручные Response-типы для CloudPayments API.
 *
 * CloudPayments не документирует response shapes табличкой — только через
 * JSON-примеры в доке. Эти типы выписаны руками по «approved» примерам и
 * сгруппированы по доменам. Если CP добавит новое поле в ответ — его можно
 * безопасно дополнить сюда, не перегенерируя остальное.
 */

import type {
	CultureName,
	Currency,
	ReasonCode,
	SubscriptionStatus,
	TransactionStatus,
} from "./_generated/handbooks.js";
import type { Payer, Receipt, SubscriptionInterval } from "./models.js";

/** Стандартная обёртка всех ответов CP API. */
export interface ApiEnvelope<T = unknown> {
	/** true при успешной операции. false — бизнес-ошибка или требуется 3DS. */
	Success: boolean;
	/** Человеко-читаемое сообщение об ошибке или null. */
	Message?: string | null;
	/** Полезная нагрузка ответа. Отсутствует для некоторых методов (напр. test). */
	Model?: T;
	/** Дополнительный код ошибки, который присутствует в части ответов API. */
	ErrorCode?: string | number | null;
}

/**
 * Транзакция — объект, возвращаемый большинством методов оплат:
 * charge/auth/confirm/void/refund/payout/get/list.
 * Поля шириной покрывают «транзакция принята» пример из доки.
 */
export interface Transaction {
	TransactionId: number;
	PublicId?: string;
	TerminalUrl?: string;
	ReasonCode: ReasonCode | 0;
	Reason: string;
	Status: TransactionStatus;
	StatusCode: number;
	Amount: number;
	Currency: Currency;
	CurrencyCode: number;
	PaymentAmount: number;
	PaymentCurrency: Currency;
	PaymentCurrencyCode: number;
	InvoiceId: string | number | null;
	AccountId: string | null;
	Email: string | null;
	Description: string | null;
	JsonData: string | null;
	/** MS-style `/Date(epoch)/`. Предпочитайте `*DateIso`. */
	CreatedDate: string;
	CreatedDateIso: string;
	AuthDate: string | null;
	AuthDateIso: string | null;
	ConfirmDate: string | null;
	ConfirmDateIso: string | null;
	PayoutDate: string | null;
	PayoutDateIso: string | null;
	PayoutAmount: number | null;
	AuthCode: string | null;
	TestMode: boolean;
	Rrn: string | null;
	OriginalTransactionId: number | null;
	FallBackScenarioDeclinedTransactionId: number | null;
	IpAddress: string;
	IpCountry: string | null;
	IpCity: string | null;
	IpRegion: string | null;
	IpDistrict: string | null;
	IpLatitude: number | null;
	IpLongitude: number | null;
	CardFirstSix: string;
	CardLastFour: string;
	CardExpDate: string;
	CardType: string;
	CardProduct: string | null;
	CardCategory: string | null;
	CardTypeCode: number;
	Issuer: string | null;
	IssuerBankCountry: string | null;
	EscrowAccumulationId: string | null;
	CultureName: CultureName | "ru" | "en" | "kk";
	CardHolderMessage: string;
	Type: number;
	Refunded: boolean;
	Name: string | null;
	Token: string | null;
	SubscriptionId: string | null;
	GatewayName: string;
	AndroidPay: boolean;
	WalletType: string;
	TotalFee: number;
	IsLocalOrder?: boolean;
	HideInvoiceId?: boolean;
	Gateway?: number | string;
	MasterPass?: boolean;
	InfoShopData?: unknown;
	Receiver?: Payer | null;
	TransactionIsInProcess?: boolean;
	/** Расчётная сумма НДС, начисленного на комиссию Системы. */
	VatAboveTotalFee?: number | null;
	/** Сумма вознаграждения агента ТСП. Заполняется для СБП-платежей. */
	ProcessorAndPartnerFee?: number | null;
	/** Расчётная сумма НДС с вознаграждения платёжного агента. Заполняется для СБП-платежей. */
	VatWithinProcessorFee?: number | null;
}

/**
 * Когда эквайер запрашивает 3-D Secure аутентификацию: Success=false, Message=null,
 * Model содержит эти поля. После аутентификации — вызов {@link post3ds}.
 */
export interface ThreeDsChallenge {
	TransactionId: number;
	PaReq: string;
	AcsUrl: string;
	GoReq: string | null;
	ThreeDsSessionData: string | null;
	IFrameIsAllowed: boolean;
	FrameWidth: number | null;
	FrameHeight: number | null;
	ThreeDsCallbackId: string | null;
	EscrowAccumulationId: string | null;
}

/** Подписка на рекуррентные платежи. */
export interface Subscription {
	Id: string;
	AccountId: string;
	Description: string | null;
	Email: string | null;
	Amount: number;
	Currency: Currency;
	CurrencyCode: number;
	RequireConfirmation: boolean;
	StartDate: string;
	StartDateIso: string;
	Interval: SubscriptionInterval;
	IntervalCode: number;
	Period: number;
	MaxPeriods: number | null;
	CultureName: CultureName;
	Status: SubscriptionStatus;
	StatusCode: number;
	SuccessfulTransactionsNumber: number;
	FailedTransactionsNumber: number;
	LastTransactionDate: string | null;
	LastTransactionDateIso: string | null;
	NextTransactionDate: string | null;
	NextTransactionDateIso: string | null;
	Receipt: Receipt | null;
	FailoverSchemeId: string | null;
}

export type OrderStatus = "Created" | "Paid" | "Cancelled" | "Expired";

/** Счёт, созданный через /orders/create. */
export interface Order {
	Id: string;
	Number: number;
	Amount: number;
	Currency: Currency;
	CurrencyCode: number;
	Email: string | null;
	Phone: string | null;
	Description: string;
	RequireConfirmation: boolean;
	Url: string;
	CultureName: CultureName;
	CreatedDate: string;
	CreatedDateIso: string;
	PaymentDate: string | null;
	PaymentDateIso: string | null;
	Status: OrderStatus;
	StatusCode: number;
	InternalId: number;
}

/** Запись в списке сохранённых токенов карт. */
export interface TokenRecord {
	Token: string;
	AccountId: string;
	CardMask: string;
	ExpirationDateMonth: number;
	ExpirationDateYear: number;
}

/** Претензия или штраф из `/chargebacks/list`. */
export interface Chargeback {
	ChargeBackId: string;
	TransactionId: number;
	TerminalUrl: string;
	Gateway: string;
	Operation: "Presentment" | "Representment";
	Type: "Chargeback" | "Fee";
	Card: string;
	Date: string;
	Amount: number;
	Currency: Currency;
}

export interface EscrowTransaction {
	Id: number;
	Status: TransactionStatus;
	Amount: number;
}

export interface EscrowPayoutTransaction extends EscrowTransaction {
	IsFinalPayout: boolean;
}

export interface EscrowInfo {
	Status: "Open" | "Closed";
	PaidoutTransactions: EscrowTransaction[] | null;
	NotPaidoutTransactions: EscrowTransaction[] | null;
	PayoutTransactions: EscrowPayoutTransaction[] | null;
	RefundedTransactions: EscrowTransaction[] | null;
	EscrowAccumulationId: string;
	Balance: number;
}

export interface AlternativePaymentIntent {
	QrUrl: string | null;
	QrImage: string | null;
	TransactionId: number;
	MerchantOrderId?: string | null;
	ProviderQrId?: string | null;
	Amount: number;
	Message?: string | null;
	IsTest?: boolean;
}

export interface DolyameExtensionData {
	Link: string;
}

/** Данные созданной транзакции Долями до перехода покупателя по ссылке. */
export interface DolyamePaymentModel {
	TransactionId: number;
	Amount: number;
	IsTest?: boolean;
	Status?: TransactionStatus;
}

/** Нормализованный результат публичного метода Долями. */
export interface DolyamePayment extends DolyamePaymentModel {
	Link: string;
}

export interface SbpBank {
	id: string;
	name: string;
	logo: string;
	url: string;
}

export interface SbpBankList {
	Source: string;
	Version: string;
	Members: SbpBank[];
}

/** Возможные значения кода ответа ТСП на Check-уведомление. */
export type CheckCallbackCode = 0 | 10 | 11 | 12 | 13 | 20;
