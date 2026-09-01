import type { DolyameCreatePaymentLinkRequest } from "../_generated/endpoints.js";
import { DOLYAME_CREATE_PAYMENT_LINK_URL } from "../_generated/endpoints.js";
import type { CloudPaymentsPublicHttpClient } from "../core/http.js";
import { CloudPaymentsSdkError } from "../errors/index.js";
import type {
	ApiEnvelope,
	DolyameExtensionData,
	DolyamePayment,
	DolyamePaymentModel,
} from "../types.js";
import type { ExecOptions } from "./base.js";
import { BaseModule } from "./base.js";

interface DolyameWireModel extends DolyamePaymentModel {
	/** Защитная совместимость с вариантом ответа, где ExtensionData вложен в Model. */
	ExtensionData?: DolyameExtensionData;
}

interface DolyameApiEnvelope extends ApiEnvelope<DolyameWireModel> {
	/** В примере ответа документации ExtensionData находится рядом с Model. */
	ExtensionData?: DolyameExtensionData;
}

/** Публичный API Долями. Запросы намеренно отправляются без Basic Auth. */
export class DolyameModule extends BaseModule {
	// biome-ignore lint/complexity/noUselessConstructor: публичная сигнатура не должна раскрывать внутренний ModuleHttpClient.
	constructor(http: CloudPaymentsPublicHttpClient) {
		super(http);
	}

	async createPaymentLink(
		body: DolyameCreatePaymentLinkRequest,
		opts: ExecOptions = {},
	): Promise<DolyamePayment> {
		const env = await this.http.post<DolyameApiEnvelope>(DOLYAME_CREATE_PAYMENT_LINK_URL, body, {
			...opts,
			replaySafety: "requires-idempotency",
		});
		let model: DolyameWireModel;
		try {
			model = this.unwrap(env, false);
		} catch (error) {
			if (error instanceof CloudPaymentsSdkError) {
				this.throwContractError(error, DOLYAME_CREATE_PAYMENT_LINK_URL, opts);
			}
			throw error;
		}
		const link = env.ExtensionData?.Link ?? model.ExtensionData?.Link;
		if (!link) {
			this.throwContractError(
				new CloudPaymentsSdkError("CloudPayments Dolyame response has no payment Link"),
				DOLYAME_CREATE_PAYMENT_LINK_URL,
				opts,
			);
		}
		const { ExtensionData: _extensionData, ...payment } = model;
		return { ...payment, Link: link };
	}
}
