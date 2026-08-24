import type { CloudPaymentsCredentials } from "./auth/basic.js";
import { CloudPaymentsHttpClient, type HttpClientOptions } from "./core/http.js";
import { SberPayModule, SbpModule, TPayModule } from "./modules/alternative-payments.js";
import { EscrowModule } from "./modules/escrow.js";
import { KktModule } from "./modules/kkt.js";
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
 * const tx = await cp.payments.chargeCryptogram(
 *   { Amount: 100, CardCryptogramPacket, IpAddress },
 *   { idempotencyKey: "order-42" },
 * );
 * ```
 */
export class CloudPaymentsClient {
	readonly http: CloudPaymentsHttpClient;
	readonly payments: PaymentsModule;
	readonly subscriptions: SubscriptionsModule;
	readonly orders: OrdersModule;
	readonly settings: SettingsModule;
	readonly escrow: EscrowModule;
	readonly tPay: TPayModule;
	readonly sbp: SbpModule;
	readonly sberPay: SberPayModule;
	readonly kkt: KktModule;

	constructor(opts: CloudPaymentsClientOptions) {
		const { publicId, apiSecret, ...httpOptions } = opts;
		const credentials: CloudPaymentsCredentials = { publicId, apiSecret };
		this.http = new CloudPaymentsHttpClient({ credentials, ...httpOptions });
		this.payments = new PaymentsModule(this.http);
		this.subscriptions = new SubscriptionsModule(this.http);
		this.orders = new OrdersModule(this.http);
		this.settings = new SettingsModule(this.http);
		this.escrow = new EscrowModule(this.http);
		this.tPay = new TPayModule(this.http);
		this.sbp = new SbpModule(this.http);
		this.sberPay = new SberPayModule(this.http);
		this.kkt = new KktModule(this.http);
	}
}
