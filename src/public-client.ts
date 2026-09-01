import { CloudPaymentsPublicHttpClient, type PublicHttpClientOptions } from "./core/http.js";
import { DolyameModule } from "./modules/dolyame.js";

export type CloudPaymentsPublicClientOptions = PublicHttpClientOptions;

/**
 * Клиент публичных CloudPayments API, которым не нужен API Secret.
 * `PublicId` передаётся в теле конкретного запроса согласно его контракту.
 */
export class CloudPaymentsPublicClient {
	readonly http: CloudPaymentsPublicHttpClient;
	readonly dolyame: DolyameModule;

	constructor(opts: CloudPaymentsPublicClientOptions = {}) {
		this.http = new CloudPaymentsPublicHttpClient(opts);
		this.dolyame = new DolyameModule(this.http);
	}
}
