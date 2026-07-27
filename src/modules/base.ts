import type { CloudPaymentsHttpClient, PostOptions, RequestReplaySafety } from "../core/http.js";
import { CloudPayments3DsRequiredError, CloudPaymentsBusinessError } from "../errors/index.js";
import type { ApiEnvelope } from "../types.js";

export type ExecOptions = Omit<PostOptions, "replaySafety">;

interface ExecBehavior {
	detect3ds?: boolean;
	replaySafety?: RequestReplaySafety;
}

export abstract class BaseModule {
	constructor(protected readonly http: CloudPaymentsHttpClient) {}

	/**
	 * Вызвать endpoint и распаковать envelope. Если Success=true — вернуть Model.
	 * Если Success=false — бросить {@link CloudPaymentsBusinessError} или, при
	 * detect3ds, {@link CloudPayments3DsRequiredError}.
	 */
	protected async exec<TReq, TRes>(
		url: string,
		body: TReq,
		opts: ExecOptions = {},
		behavior: ExecBehavior = {},
	): Promise<TRes> {
		const env = await this.http.post<ApiEnvelope<TRes>>(url, body, {
			...opts,
			replaySafety: behavior.replaySafety ?? "requires-idempotency",
		});
		return this.unwrap(env, behavior.detect3ds ?? false);
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
				m.ThreeDsCallbackId ?? null,
				m,
			);
		}
		const model = env.Model;
		const reasonCode = extractReasonCode(model);
		throw new CloudPaymentsBusinessError(env.Message ?? "", model, reasonCode);
	}
}

interface ThreeDsErrorPayload {
	TransactionId: number;
	PaReq: string;
	AcsUrl: string;
	ThreeDsCallbackId?: string | null;
}

function is3DsChallenge(model: unknown): model is ThreeDsErrorPayload {
	if (!model || typeof model !== "object") return false;
	const m = model as Record<string, unknown>;
	return (
		typeof m.TransactionId === "number" &&
		typeof m.AcsUrl === "string" &&
		typeof m.PaReq === "string" &&
		(m.ThreeDsCallbackId === undefined ||
			m.ThreeDsCallbackId === null ||
			typeof m.ThreeDsCallbackId === "string")
	);
}

function extractReasonCode(model: unknown): number | undefined {
	if (!model || typeof model !== "object") return undefined;
	const rc = (model as { ReasonCode?: unknown }).ReasonCode;
	return typeof rc === "number" ? rc : undefined;
}
