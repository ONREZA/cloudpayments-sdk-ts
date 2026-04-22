import type { CloudPaymentsHttpClient, PostOptions } from "../core/http.js";
import { CloudPayments3DsRequiredError, CloudPaymentsBusinessError } from "../errors/index.js";
import type { ApiEnvelope, ThreeDsChallenge } from "../types.js";

export interface ExecOptions extends PostOptions {
	/**
	 * Если true — при Success=false проверим Model на форму ThreeDsChallenge
	 * и бросим {@link CloudPayments3DsRequiredError}. По-умолчанию включено
	 * для платёжных методов (charge/auth/chargeToken/authToken).
	 */
	detect3ds?: boolean;
}

export abstract class BaseModule {
	constructor(protected readonly http: CloudPaymentsHttpClient) {}

	/**
	 * Вызвать endpoint и распаковать envelope. Если Success=true — вернуть Model.
	 * Если Success=false — бросить {@link CloudPaymentsBusinessError} или, при
	 * detect3ds, {@link CloudPayments3DsRequiredError}.
	 */
	protected async exec<TReq, TRes>(url: string, body: TReq, opts: ExecOptions = {}): Promise<TRes> {
		const env = await this.http.post<ApiEnvelope<TRes>>(url, body, opts);
		return this.unwrap(env, opts.detect3ds ?? false);
	}

	/** Универсальная распаковка envelope. */
	protected unwrap<T>(env: ApiEnvelope<T>, detect3ds: boolean): T {
		if (env.Success) {
			// Model может отсутствовать у void-методов — возвращаем undefined as T.
			return (env.Model ?? (undefined as T)) as T;
		}
		if (detect3ds && is3DsChallenge(env.Model)) {
			const m = env.Model;
			throw new CloudPayments3DsRequiredError(
				m.TransactionId,
				m.PaReq,
				m.AcsUrl,
				m.ThreeDsCallbackId,
				m,
			);
		}
		const model = env.Model;
		const reasonCode = extractReasonCode(model);
		throw new CloudPaymentsBusinessError(env.Message ?? "", model, reasonCode);
	}
}

function is3DsChallenge(model: unknown): model is ThreeDsChallenge {
	if (!model || typeof model !== "object") return false;
	const m = model as Record<string, unknown>;
	return typeof m.AcsUrl === "string" && typeof m.PaReq === "string";
}

function extractReasonCode(model: unknown): number | undefined {
	if (!model || typeof model !== "object") return undefined;
	const rc = (model as { ReasonCode?: unknown }).ReasonCode;
	return typeof rc === "number" ? rc : undefined;
}
