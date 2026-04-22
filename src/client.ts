import type { CloudPaymentsCredentials } from "./auth/basic.js";
import { CloudPaymentsHttpClient, type HttpClientOptions } from "./core/http.js";
import { OrdersModule } from "./modules/orders.js";
import { PaymentsModule } from "./modules/payments.js";
import { SettingsModule } from "./modules/settings.js";
import { SubscriptionsModule } from "./modules/subscriptions.js";

export interface CloudPaymentsClientOptions extends Omit<HttpClientOptions, "credentials"> {
	publicId: string;
	apiSecret: string;
}

/**
 * Корневой клиент CloudPayments SDK. Модули доступны как свойства:
 *
 * ```ts
 * const cp = new CloudPaymentsClient({ publicId, apiSecret });
 * const tx = await cp.payments.chargeCryptogram({ Amount: 100, CardCryptogramPacket, IpAddress });
 * const sub = await cp.subscriptions.create({ ... });
 * ```
 */
export class CloudPaymentsClient {
	readonly http: CloudPaymentsHttpClient;
	readonly payments: PaymentsModule;
	readonly subscriptions: SubscriptionsModule;
	readonly orders: OrdersModule;
	readonly settings: SettingsModule;

	constructor(opts: CloudPaymentsClientOptions) {
		const credentials: CloudPaymentsCredentials = {
			publicId: opts.publicId,
			apiSecret: opts.apiSecret,
		};
		const { publicId: _pid, apiSecret: _sec, ...rest } = opts;
		this.http = new CloudPaymentsHttpClient({ credentials, ...rest });
		this.payments = new PaymentsModule(this.http);
		this.subscriptions = new SubscriptionsModule(this.http);
		this.orders = new OrdersModule(this.http);
		this.settings = new SettingsModule(this.http);
	}
}
