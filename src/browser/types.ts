import type { CultureName, Currency, ReasonCode } from "../_generated/handbooks.js";
import type {
	KktAgentSign,
	KktProductCodeData,
	KktReceipt,
	Receipt,
	ReceiptItem,
	SubscriptionInterval,
} from "../models.js";

export type WidgetPaymentSchema = "Single" | "Dual";
export type WidgetEmailBehavior = "Required" | "Hidden" | "Optional";
export type WidgetSkin = "classic" | "modern";
export type WidgetLanguage =
	| "ru-RU"
	| "en-US"
	| "de-DE"
	| "lv"
	| "az"
	| "kk"
	| "kk-KZ"
	| "uk"
	| "pl"
	| "pt"
	| "cs-CZ"
	| "vi-VN"
	| "tr-TR"
	| "es-ES"
	| "it";
export type WidgetPaymentMethod =
	| "Card"
	| "TcsInstallment"
	| "Sbp"
	| "TinkoffPay"
	| "MirPay"
	| "Dolyame"
	| "ForeignCard"
	| "SberPay";

export interface WidgetCustomField {
	name: string;
	value?: string;
}

export interface WidgetUserInfo {
	firstName?: string;
	lastName?: string;
	middleName?: string;
	fullName?: string;
	birth?: string;
	address?: string;
	street?: string;
	city?: string;
	country?: string;
	phone?: string;
	postCode?: string;
	accountId?: string;
	email?: string;
	customField?: WidgetCustomField;
}

export interface WidgetRecurrentOptions {
	period: number;
	interval: SubscriptionInterval;
	maxPeriods?: number;
	amount?: number;
	startDate?: string;
	receipt?: WidgetReceipt;
}

export interface WidgetEscrowOptions {
	startAccumulation?: boolean;
	accumulationId?: string | null;
	escrowType?: "NToOne" | "OneToN" | "NToN";
}

export interface WidgetItem {
	id: string;
	name: string;
	count: number;
	price: number;
}

export interface WidgetReceiptAgentData {
	AgentOperationName?: string | null;
	PaymentAgentPhone?: string | null;
	PaymentReceiverOperatorPhone?: string | null;
	TransferOperatorPhone?: string | null;
	TransferOperatorName?: string | null;
	TransferOperatorAddress?: string | null;
	TransferOperatorInn?: string | null;
}

export interface WidgetReceiptPurveyorData {
	Phone: string;
	Name: string;
	Inn: string;
}

/** Browser Widget принимает как camelCase, так и документированные PascalCase aliases. */
export interface WidgetReceiptItem extends ReceiptItem {
	ProductCodeData?: KktProductCodeData;
	AgentSign?: KktAgentSign | null;
	AgentData?: WidgetReceiptAgentData;
	PurveyorData?: WidgetReceiptPurveyorData;
}

type CamelCaseKktReceipt = Extract<KktReceipt, { items: ReceiptItem[] }>;

export type WidgetReceipt =
	| (Omit<Receipt, "Items"> & { Items: WidgetReceiptItem[] })
	| (Omit<CamelCaseKktReceipt, "items"> & { items: WidgetReceiptItem[] });

/** Параметры современного `widget.start()`. */
export interface WidgetIntentOptions {
	publicTerminalId: string;
	amount: number;
	currency: Currency;
	paymentSchema: WidgetPaymentSchema;
	culture?: CultureName;
	description?: string;
	externalId?: string;
	receiptEmail?: string;
	restrictedPaymentMethods?: WidgetPaymentMethod[];
	tokenize?: boolean;
	recurrent?: WidgetRecurrentOptions;
	escrow?: WidgetEscrowOptions;
	items?: WidgetItem[];
	receipt?: WidgetReceipt;
	userInfo?: WidgetUserInfo;
	metadata?: Record<string, unknown>;
	successRedirectUrl?: string;
	failRedirectUrl?: string;
	emailBehavior?: WidgetEmailBehavior;
	retryPayment?: boolean;
	autoClose?: number;
	skin?: WidgetSkin;
	payerServiceFee?: number;
	cryptogramMode?: boolean;
}

export interface WidgetResultData {
	transactionId?: number;
	ReasonCode?: ReasonCode | 0;
	[key: string]: unknown;
}

export type WidgetResultType =
	| "cancel"
	| "payment"
	| "installment"
	| "error"
	| "cryptogram"
	| "sbp"
	| "tinkoff"
	| "spei"
	| "som"
	| "credit"
	| "sberPay"
	| "cardInstallment"
	| "dolyame"
	| "cash";
export type WidgetResultStatus = "success" | "fail" | "appointment" | "reject" | "cancel" | "wait";

export interface WidgetResult {
	type: WidgetResultType;
	status?: WidgetResultStatus;
	data?: WidgetResultData;
	message?: string;
	isAwaitingResult?: boolean;
}

/** Общие настройки доступности методов оплаты в browser-интеграциях. */
export interface CloudPaymentsAppOptions {
	language?: WidgetLanguage;
	email?: string;
	applePaySupport?: boolean;
	googlePaySupport?: boolean;
	yandexPaySupport?: boolean;
	masterPassSupport?: boolean;
	tinkoffInstallmentSupport?: boolean;
	loanSupport?: boolean;
	tinkoffPaySupport?: boolean;
	dolyameSupport?: boolean;
	mirPaySupport?: boolean;
	speiSupport?: boolean;
	cashSupport?: boolean;
	cardInstallmentSupport?: boolean;
	foreignSupport?: boolean;
	sbpSupport?: boolean;
	sberPaySupport?: boolean;
}

/** Настройки конструктора из подробной документации Widget. */
export interface WidgetConstructorOptions extends CloudPaymentsAppOptions {
	container?: HTMLElement | string;
	showLoadingImage?: boolean;
	logoUrl?: string;
	cryptogramMode?: boolean;
	scenario?: number;
}

export interface CloudPaymentsWidget {
	start(intentParams: WidgetIntentOptions): Promise<WidgetResult>;
	close(): void;
	onclose?: (result: WidgetResult) => void;
	oncomplete?: (result: WidgetResult) => void;
	oncryptogram?: (cryptogram: string) => void;
	onpendingpayment?: () => void;
}

export interface CloudPaymentsWidgetConstructor {
	new (options?: WidgetConstructorOptions): CloudPaymentsWidget;
}

/**
 * Параметры PaymentBlocks совпадают с параметрами современного Widget.
 * `accountId` и `language` сохранены как документированные aliases конструктора.
 */
export interface PaymentBlocksInitialization extends WidgetIntentOptions, CloudPaymentsAppOptions {
	accountId?: string;
}

export type PaymentBlocksThemeColor = string | readonly [number, number, number];

export interface PaymentBlocksFont {
	url: string;
	style: string;
	weight: string;
	format: string;
	unicodeRange?: string;
}

export interface PaymentBlocksFontOptions {
	family: string;
	items: PaymentBlocksFont[];
}

export interface PaymentBlocksCustomization {
	components?: {
		paymentButton?: { text?: string; fontSize?: string };
		paymentForm?: {
			labelFontSize?: string;
			activeLabelFontSize?: string;
			fontSize?: string;
		};
	};
	appearance?: {
		colors?: {
			primaryButtonColor?: PaymentBlocksThemeColor;
			primaryButtonTextColor?: PaymentBlocksThemeColor;
			primaryHoverButtonColor?: PaymentBlocksThemeColor;
			primaryButtonHoverTextColor?: PaymentBlocksThemeColor;
			activeInputColor?: PaymentBlocksThemeColor;
			inputBackground?: PaymentBlocksThemeColor;
			inputColor?: PaymentBlocksThemeColor;
			inputBorderColor?: PaymentBlocksThemeColor;
			errorColor?: PaymentBlocksThemeColor;
			skeletonBackground?: PaymentBlocksThemeColor;
			titleColor?: PaymentBlocksThemeColor;
			textColor?: PaymentBlocksThemeColor;
		};
		borders?: { radius?: string };
		font?: PaymentBlocksFontOptions;
	};
}

export interface PaymentBlocksEventMap {
	success: WidgetResult;
	fail: WidgetResult;
	destroy: undefined;
	cryptogram: string;
	init: undefined;
}

export interface PaymentBlocks {
	mount(element: HTMLElement): void;
	update(params: PaymentBlocksInitialization): void;
	on<Event extends keyof PaymentBlocksEventMap>(
		event: Event,
		handler: (payload: PaymentBlocksEventMap[Event]) => void,
	): void;
	off<Event extends keyof PaymentBlocksEventMap>(
		event: Event,
		handler?: (payload: PaymentBlocksEventMap[Event]) => void,
	): void;
	unmount(): void;
}

export interface PaymentBlocksConstructor {
	new (
		initialization: PaymentBlocksInitialization,
		customization?: PaymentBlocksCustomization,
	): PaymentBlocks;
}

export interface CheckoutOptions {
	publicId: string;
	container?: HTMLElement;
}

export interface CheckoutCardData {
	cvv?: string;
	cardNumber?: string;
	expDateMonth?: string;
	expDateYear?: string;
	expDateMonthYear?: string;
	name?: string;
}

export type CheckoutValidationCode =
	| "CardNumber_Empty"
	| "CardNumber_Invalid"
	| "Cvv_Empty"
	| "Cvv_Invalid"
	| "ExpDateMonthYear_Empty"
	| "ExpDateMonthYear_Invalid"
	| "ExpDateMonth_Empty"
	| "ExpDateMonth_Invalid"
	| "ExpDateYear_Empty"
	| "ExpDateYear_Invalid"
	| "Name_Empty"
	| "Name_Invalid"
	| "Name_TooLong"
	| "Name_TooShort";

export type CheckoutValidationErrors = Partial<
	Record<keyof CheckoutCardData, CheckoutValidationCode>
>;

export interface Checkout {
	createPaymentCryptogram(fieldValues?: CheckoutCardData): Promise<string>;
}

export interface CheckoutConstructor {
	new (options: CheckoutOptions): Checkout;
}

export interface WidgetNamespace {
	CloudPayments: CloudPaymentsWidgetConstructor;
}

export interface PaymentBlocksNamespace {
	PaymentBlocks: PaymentBlocksConstructor;
}

export interface CheckoutNamespace {
	Checkout: CheckoutConstructor;
}

export type CloudPaymentsBrowserNamespace = Partial<
	WidgetNamespace & PaymentBlocksNamespace & CheckoutNamespace
>;

declare global {
	interface Window {
		cp?: CloudPaymentsBrowserNamespace;
	}
}
