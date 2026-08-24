import type {
	KktFiscalizeRequest,
	KktGetCashRegisterStateRequest,
	KktGetCorrectionReceiptRequest,
	KktGetCorrectionReceiptStatusRequest,
	KktGetReceiptRequest,
	KktGetReceiptStatusRequest,
	KktListCashRegisterWarningsRequest,
	KktSubmitCorrectionReceiptRequest,
	KktSubmitReceiptRequest,
	KktUpdateCashRegisterStateRequest,
	KktValidateMarkCodeRequest,
	KktValidateMarkCodesRequest,
} from "../_generated/endpoints.js";
import {
	KKT_FISCALIZE_URL,
	KKT_GET_CASH_REGISTER_STATE_URL,
	KKT_GET_CORRECTION_RECEIPT_STATUS_URL,
	KKT_GET_CORRECTION_RECEIPT_URL,
	KKT_GET_RECEIPT_STATUS_URL,
	KKT_GET_RECEIPT_URL,
	KKT_LIST_CASH_REGISTER_WARNINGS_URL,
	KKT_SUBMIT_CORRECTION_RECEIPT_URL,
	KKT_SUBMIT_RECEIPT_URL,
	KKT_UPDATE_CASH_REGISTER_STATE_URL,
	KKT_VALIDATE_MARK_CODE_URL,
	KKT_VALIDATE_MARK_CODES_URL,
} from "../_generated/endpoints.js";
import { CloudPaymentsSdkError } from "../errors/index.js";
import type {
	KktCashRegisterState,
	KktCashRegisterWarnings,
	KktCorrectionReceiptDetails,
	KktIndustryRequisiteResult,
	KktMarkCodeBatchResult,
	KktMarkCodeValidationResult,
	KktReceiptDetails,
	KktReceiptStatus,
	KktReceiptStatusResult,
	KktReceiptSubmissionResult,
	KktWarning,
} from "../kkt-types.js";
import type { ApiEnvelope } from "../types.js";
import { BaseModule, type ExecOptions } from "./base.js";

interface KktEnvelope<T> extends ApiEnvelope<T> {
	InnerResult?: unknown;
	Warning?: string | null;
	WarningCodes?: Array<string | number> | null;
	Warnings?: KktWarning[] | null;
}

interface ReceiptSubmissionModel {
	Id?: string | null;
	ErrorCode?: string | number | null;
	ReceiptLocalUrl?: string | null;
}

interface MarkCodeValidationEnvelope extends ApiEnvelope<never> {
	IsValid?: boolean;
	IndustryRequisite?: KktIndustryRequisiteResult | null;
}

interface MarkCodesValidationEnvelope extends ApiEnvelope<never> {
	Results?: KktMarkCodeBatchResult[];
}

const RECEIPT_STATUSES = new Set<KktReceiptStatus>(["Processed", "Error", "Queued", "NotFound"]);

export class KktModule extends BaseModule {
	async fiscalize(body: KktFiscalizeRequest, opts?: ExecOptions): Promise<string> {
		const env = await this.postEnvelope<undefined>(KKT_FISCALIZE_URL, body, opts);
		return env.Message ?? "";
	}

	async submitReceipt(
		body: KktSubmitReceiptRequest,
		opts?: ExecOptions,
	): Promise<KktReceiptSubmissionResult> {
		return this.submit(KKT_SUBMIT_RECEIPT_URL, body, opts);
	}

	getReceiptStatus(
		body: KktGetReceiptStatusRequest,
		opts?: ExecOptions,
	): Promise<KktReceiptStatusResult> {
		return this.getStatus(KKT_GET_RECEIPT_STATUS_URL, body, opts);
	}

	async getReceipt(body: KktGetReceiptRequest, opts?: ExecOptions): Promise<KktReceiptDetails> {
		const env = await this.postEnvelope<KktReceiptDetails>(KKT_GET_RECEIPT_URL, body, opts, true);
		return requireModel(env, "CloudKassir receipt details");
	}

	async validateMarkCode(
		body: KktValidateMarkCodeRequest,
		opts?: ExecOptions,
	): Promise<KktMarkCodeValidationResult> {
		const env = await this.http.post<MarkCodeValidationEnvelope>(KKT_VALIDATE_MARK_CODE_URL, body, {
			...opts,
			replaySafety: "safe",
		});
		this.unwrap(env, false);
		if (typeof env.IsValid !== "boolean") {
			throw new CloudPaymentsSdkError("CloudKassir mark-code response has no IsValid flag");
		}
		return {
			IsValid: env.IsValid,
			Message: env.Message ?? null,
			IndustryRequisite: env.IndustryRequisite ?? null,
		};
	}

	async validateMarkCodes(
		body: KktValidateMarkCodesRequest,
		opts?: ExecOptions,
	): Promise<KktMarkCodeBatchResult[]> {
		const env = await this.http.post<MarkCodesValidationEnvelope>(
			KKT_VALIDATE_MARK_CODES_URL,
			body,
			{
				...opts,
				replaySafety: "safe",
			},
		);
		this.unwrap(env, false);
		if (!Array.isArray(env.Results)) {
			throw new CloudPaymentsSdkError("CloudKassir mark-codes response has no Results array");
		}
		return env.Results;
	}

	async submitCorrectionReceipt(
		body: KktSubmitCorrectionReceiptRequest,
		opts?: ExecOptions,
	): Promise<KktReceiptSubmissionResult> {
		return this.submit(KKT_SUBMIT_CORRECTION_RECEIPT_URL, body, opts);
	}

	getCorrectionReceiptStatus(
		body: KktGetCorrectionReceiptStatusRequest,
		opts?: ExecOptions,
	): Promise<KktReceiptStatusResult> {
		return this.getStatus(KKT_GET_CORRECTION_RECEIPT_STATUS_URL, body, opts);
	}

	async getCorrectionReceipt(
		body: KktGetCorrectionReceiptRequest,
		opts?: ExecOptions,
	): Promise<KktCorrectionReceiptDetails> {
		const env = await this.postEnvelope<KktCorrectionReceiptDetails>(
			KKT_GET_CORRECTION_RECEIPT_URL,
			body,
			opts,
			true,
		);
		return requireModel(env, "CloudKassir correction receipt details");
	}

	async updateCashRegisterState(
		body: KktUpdateCashRegisterStateRequest,
		opts?: ExecOptions,
	): Promise<string> {
		const env = await this.postEnvelope<undefined>(KKT_UPDATE_CASH_REGISTER_STATE_URL, body, opts);
		return env.Message ?? "";
	}

	async getCashRegisterState(
		body: KktGetCashRegisterStateRequest,
		opts?: ExecOptions,
	): Promise<KktCashRegisterState> {
		const env = await this.postEnvelope<KktCashRegisterState>(
			KKT_GET_CASH_REGISTER_STATE_URL,
			body,
			opts,
			true,
		);
		return requireModel(env, "CloudKassir cash-register state");
	}

	async listCashRegisterWarnings(
		body: KktListCashRegisterWarningsRequest = {},
		opts?: ExecOptions,
	): Promise<KktCashRegisterWarnings[]> {
		const env = await this.postEnvelope<KktCashRegisterWarnings[]>(
			KKT_LIST_CASH_REGISTER_WARNINGS_URL,
			body,
			opts,
			true,
		);
		return requireModel(env, "CloudKassir cash-register warnings");
	}

	private async submit(
		url: string,
		body: KktSubmitReceiptRequest | KktSubmitCorrectionReceiptRequest,
		opts?: ExecOptions,
	): Promise<KktReceiptSubmissionResult> {
		const env = await this.postEnvelope<ReceiptSubmissionModel>(url, body, opts);
		const model = requireModel(env, "CloudKassir receipt submission");
		const id = model.Id?.trim();
		if (!id) throw new CloudPaymentsSdkError("CloudKassir receipt submission has no Id");
		return {
			Id: id,
			ErrorCode: model.ErrorCode ?? null,
			ReceiptLocalUrl: model.ReceiptLocalUrl ?? null,
			Message: env.Message ?? null,
			Warning: env.Warning ?? null,
			WarningCodes: env.WarningCodes ?? [],
		};
	}

	private async getStatus(
		url: string,
		body: KktGetReceiptStatusRequest | KktGetCorrectionReceiptStatusRequest,
		opts?: ExecOptions,
	): Promise<KktReceiptStatusResult> {
		const env = await this.postEnvelope<KktReceiptStatus>(url, body, opts, true);
		const status = requireModel(env, "CloudKassir receipt status");
		if (!RECEIPT_STATUSES.has(status)) {
			throw new CloudPaymentsSdkError(`Unsupported CloudKassir receipt status: ${String(status)}`);
		}
		return { Status: status, Message: env.Message ?? null, Warnings: env.Warnings ?? [] };
	}

	private async postEnvelope<T>(
		url: string,
		body: unknown,
		opts: ExecOptions | undefined,
		safe = false,
	): Promise<KktEnvelope<T>> {
		const env = await this.http.post<KktEnvelope<T>>(url, body, {
			...opts,
			...(safe ? { replaySafety: "safe" as const } : {}),
		});
		this.unwrap(env, false);
		return env;
	}
}

function requireModel<T>(env: ApiEnvelope<T>, contract: string): T {
	if (env.Model === undefined || env.Model === null) {
		throw new CloudPaymentsSdkError(`${contract} response has no Model`);
	}
	return env.Model;
}
