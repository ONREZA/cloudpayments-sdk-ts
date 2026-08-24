/** Вложенные request-модели CloudPayments и CloudKassir. */

/** Плательщик (Payer object в charge/auth/payout/...). */
export interface Payer {
	FirstName?: string;
	LastName?: string;
	MiddleName?: string;
	/** Дата рождения, YYYY-MM-DD. */
	Birth?: string;
	Address?: string;
	Street?: string;
	City?: string;
	Country?: string;
	/** Телефон в формате `+71234567890`. */
	Phone?: string;
	Postcode?: string;
}

export type KktReceiptType = "Income" | "IncomeReturn" | "Expense" | "ExpenseReturn";
export type KktTaxationSystem = 0 | 1 | 2 | 3 | 4 | 5;
export type KktVatRate = null | 0 | 5 | 7 | 10 | 20 | 22 | 105 | 107 | 110 | 120 | 122;
export type KktRussiaTimeZone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
/** `0` — историческое значение по умолчанию, которое по-прежнему принимает API. */
export type KktPaymentMethod = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type KktPaymentObject =
	| 0
	| 1
	| 2
	| 3
	| 4
	| 5
	| 6
	| 7
	| 8
	| 9
	| 10
	| 11
	| 12
	| 13
	| 14
	| 15
	| 16
	| 17
	| 18
	| 19
	| 20
	| 21
	| 22
	| 23
	| 24
	| 25
	| 26
	| 27
	| 30
	| 31
	| 32
	| 33;
export type KktAgentSign = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type KktUnitCode =
	| 0
	| 10
	| 11
	| 12
	| 20
	| 21
	| 22
	| 30
	| 31
	| 32
	| 40
	| 41
	| 42
	| 50
	| 51
	| 70
	| 71
	| 72
	| 73
	| 80
	| 81
	| 82
	| 83
	| 255;

export type SubscriptionInterval = "Day" | "Week" | "Month";
export type OrderSubscriptionBehavior = "CreateWeekly" | "CreateMonthly";
export type TransactionListStatus = "Authorized" | "Completed" | "Cancelled" | "Declined";
export type NotificationHttpMethod = "GET" | "POST";
export type NotificationEncoding = "UTF8" | "Windows1251";
export type NotificationFormat = "CloudPayments" | "QIWI" | "RT";

export interface KktAgentData {
	agentOperationName?: string | null;
	paymentAgentPhone?: string | null;
	paymentReceiverOperatorPhone?: string | null;
	transferOperatorPhone?: string | null;
	transferOperatorName?: string | null;
	transferOperatorAddress?: string | null;
	transferOperatorInn?: string | null;
}

export interface KktPurveyorData {
	name: string;
	inn: string;
	phone?: string;
}

export interface KktIndustryRequisite {
	code: string;
	documentDate: string;
	documentNumber: string;
	requisiteValue: string;
}

export interface KktMarkPartQuantity {
	numerator: number;
	denominator: number;
}

export interface KktProductCodeData {
	CodeProductNomenclature?: string;
}

export interface KktUserRequisiteData {
	requisiteKey: string;
	requisiteValue: string;
}

export interface KktOperationReceiptRequisite {
	operationIdentifier: number;
	operationDate: string;
	operationData: string;
}

export interface KktNonCashPayment {
	amount: number;
	paymentMethod: number;
	paymentId: string;
	additionalInfo?: string;
}

export interface ReceiptItem {
	label: string;
	price: number;
	quantity: number;
	amount: number;
	vat?: KktVatRate;
	method?: KktPaymentMethod;
	object?: KktPaymentObject;
	measurementUnit?: string;
	excise?: number;
	countryOriginCode?: string;
	customsDeclarationNumber?: string;
	agentSign?: KktAgentSign | null;
	agentData?: KktAgentData;
	purveyorData?: KktPurveyorData;
	additionalPositionInfo?: string;
	saleObjectData?: string;
	industryRequisiteCollection?: KktIndustryRequisite[];
	productCodeData?: KktProductCodeData;
	markPartQuantity?: KktMarkPartQuantity;
	rawMarkCode?: string;
	groupSeparator?: string;
	unitCode?: KktUnitCode;
	expectedMarkItemStatus?: 1 | 2 | 3 | 4 | 5 | 6 | 255;
}

export interface ReceiptAmounts {
	electronic?: number;
	cash?: number;
	advancePayment?: number;
	credit?: number;
	provision?: number;
}

interface ReceiptFields {
	taxationSystem?: KktTaxationSystem;
	calculationPlace?: string;
	email?: string;
	phone?: string;
	customerInfo?: string;
	customerInn?: string;
	isBso?: boolean;
	AgentSign?: KktAgentSign | null;
	agentSign?: KktAgentSign | null;
	cashierName?: string;
	cashierInn?: string;
	additionalReceiptInfos?: string[];
	additionalReceiptRequisite?: string;
	customerBirthday?: string;
	customerStateCode?: string;
	customerDocType?: string;
	customerDoc?: string;
	customerPlace?: string;
	userRequisiteData?: KktUserRequisiteData;
	operationReceiptRequisite?: KktOperationReceiptRequisite;
	industryRequisiteCollection?: KktIndustryRequisite[];
	isInternetPayment?: boolean;
	russiaTimeZone?: KktRussiaTimeZone;
	nonCashPayments?: KktNonCashPayment[];
	amounts?: ReceiptAmounts;
}

/** Онлайн-чек в CloudPayments CustomerReceipt с историческим `Items`. */
export interface Receipt extends ReceiptFields {
	Items: ReceiptItem[];
}

/** Онлайн-чек CloudKassir; API принимает документированный camelCase и legacy `Items`. */
export type KktReceipt =
	| Receipt
	| (ReceiptFields & {
			items: ReceiptItem[];
			Items?: never;
	  });

export interface KktCorrectionCause {
	CorrectionDate: string;
	CorrectionNumber: string | null;
}

export interface KktCorrectionReceiptData {
	OrganizationInn: string;
	VatRate?: KktVatRate;
	TaxationSystem: KktTaxationSystem;
	CorrectionReceiptType: 1 | 2 | 3 | 4;
	CauseCorrection: KktCorrectionCause;
	Amounts: ReceiptAmounts;
	Items?: ReceiptItem[];
	IndustryRequisites?: KktIndustryRequisite[];
	UserRequisiteData?: KktUserRequisiteData;
	OperationReceiptRequisite?: KktOperationReceiptRequisite;
	CustomerInfo?: string;
	CustomerInn?: string;
	CustomerBirthday?: string;
	CustomerStateCode?: string;
	CustomerDocType?: string;
	CustomerDoc?: string;
	CustomerPlace?: string;
	IsBso?: boolean;
	CustomerContactAddress?: string;
	CashierName?: string;
	CashierInn?: string;
	PaymentPlace?: string;
	PaymentAddress?: string;
	CorrectionType?: 0 | 1;
	AdditionalReceiptRequisite?: string;
	IsInternetPayment?: boolean;
	RussiaTimeZone?: KktRussiaTimeZone;
}

/** cloudpayments namespace внутри JsonData. */
export interface CloudPaymentsMeta {
	CustomerReceipt?: Receipt;
	recurrent?: {
		interval: SubscriptionInterval;
		period: number;
		customerReceipt?: Receipt;
		amount?: number;
		startDate?: string;
		maxPeriods?: number | null;
	};
	ShouldAuthenticate3DS?: boolean;
}

/** Произвольные JsonData с типизированным служебным namespace CloudPayments. */
export type CloudPaymentsJsonData = Record<string, unknown> & {
	cloudpayments?: CloudPaymentsMeta;
};
