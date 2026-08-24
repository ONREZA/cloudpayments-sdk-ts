import type { KktAgentSign, KktReceiptType, KktTaxationSystem, KktVatRate } from "./models.js";

export type KktReceiptStatus = "Processed" | "Error" | "Queued" | "NotFound";

export interface KktWarning {
	Code: number;
	Description: string;
	ResolveAction?: string | null;
}

export interface KktReceiptSubmissionResult {
	Id: string;
	ErrorCode: string | number | null;
	ReceiptLocalUrl: string | null;
	Message: string | null;
	Warning: string | null;
	WarningCodes: Array<string | number>;
}

export interface KktReceiptStatusResult {
	Status: KktReceiptStatus;
	Message: string | null;
	Warnings: KktWarning[];
}

export interface KktIndustryRequisiteResult {
	Code: string;
	DocumentDate: string;
	DocumentNumber: string;
	RequisiteValue: string;
}

export interface KktMarkCodeValidationResult {
	IsValid: boolean;
	Message: string | null;
	IndustryRequisite: KktIndustryRequisiteResult | null;
}

export interface KktMarkCodeBatchResult extends KktMarkCodeValidationResult {
	MarkCode: string;
}

export interface KktReceiptDetailsItem {
	Label: string;
	Price: number;
	Quantity: number;
	Amount: number;
	Department: string | null;
	Vat: KktVatRate;
	EAN13: string | null;
	AgentSign: KktAgentSign | null;
	Method: number;
	Object: number;
	MeasurementUnit: string | null;
	AgentData: Record<string, string | null> | null;
	PurveyorData: Record<string, string | null> | null;
}

export interface KktReceiptFiscalData {
	Id: string;
	AccountId: string | null;
	Amount: number;
	CalculationPlace: string | null;
	CashierName: string | null;
	DateTime: string;
	DeviceNumber: string;
	DocumentNumber: string;
	FiscalNumber: string;
	FiscalSign: string;
	InvoiceId: string | null;
	Ofd: string;
	OfdReceiptUrl: string | null;
	OrganizationInn: string;
	QrCodeUrl: string | null;
	RegNumber: string;
	SenderEmail: string | null;
	SessionCheckNumber: string;
	SessionNumber: string;
	SettlePlace: string | null;
	TransactionId: number | null;
	Type: KktReceiptType;
}

export interface KktReceiptDetails {
	Email: string | null;
	Phone: string | null;
	Items: KktReceiptDetailsItem[];
	TaxationSystem: KktTaxationSystem;
	Amounts: KktReceiptAmounts | null;
	IsBso: boolean;
	AdditionalData: KktReceiptFiscalData;
}

export interface KktReceiptAmounts {
	Electronic?: number;
	Cash?: number;
	AdvancePayment?: number;
	Credit?: number;
	Provision?: number;
	Sum?: number;
}

export interface KktCorrectionReceiptAmounts extends KktReceiptAmounts {
	Sum: number;
}

/** CloudKassir также возвращает legacy-код `1` в документированном ответе коррекции. */
export type KktCorrectionReceiptVatRate = KktVatRate | 1;

export interface KktCorrectionReceiptDetails {
	Status: KktReceiptStatus;
	ErrorCode: string | number | null;
	ErrorMessage: string | null;
	Amounts: KktCorrectionReceiptAmounts;
	Items: KktReceiptDetailsItem[];
	TaxationSystem: KktTaxationSystem;
	CorrectionType: 0 | 1;
	CorrectionReceiptType: 1 | 2 | 3 | 4;
	VatRate: KktCorrectionReceiptVatRate;
	CorrectionDate: string;
	CorrectionNumber: string;
	Id: string;
	Amount: number;
	PaymentPlace: string | null;
	PaymentAddress: string | null;
	CashierName: string | null;
	DeviceNumber: string;
	DocumentNumber: string;
	FiscalNumber: string;
	FiscalSign: string;
	OfdName: string;
	OfdInn: string;
	OfdReceiptUrl: string | null;
	OrganizationInn: string;
	RegNumber: string;
	SessionCheckNumber: string;
	SessionNumber: string;
}

export type KktCashRegisterStatus = 1 | 2 | 3;

export interface KktCashRegisterState {
	Inn: string;
	DeviceNumber: string;
	RegNumber: string;
	FiscalNumber: string;
	Status: KktCashRegisterStatus;
	Fiscal: boolean;
	OfdName: string;
	SettlePlace: string | null;
	CalculationPlace: string | null;
	KkmModelName: string;
	FiscalDateEnd: string;
	FirmwareVersion: string;
	IsBso: boolean;
	OfdQueueDocsCount: number;
	FnOccupancy: number;
	Warnings: KktWarning[];
	IsReceiptProcessingBlocked: boolean;
}

export interface KktCashRegisterWarnings {
	DeviceNumber: string;
	Warnings: KktWarning[];
}
