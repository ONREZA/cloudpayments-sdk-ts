/**
 * Модуль orders — счета на оплату, отправляемые по почте/ссылке.
 */

import type { OrdersCancelRequest, OrdersCreateRequest } from "../_generated/endpoints.js";
import { ORDERS_CANCEL_URL, ORDERS_CREATE_URL } from "../_generated/endpoints.js";
import type { Order } from "../types.js";
import { BaseModule, type ExecOptions } from "./base.js";

export class OrdersModule extends BaseModule {
	/** Создать счёт, получив ссылку и Id для отправки клиенту. */
	create(body: OrdersCreateRequest, opts?: ExecOptions): Promise<Order> {
		return this.exec<OrdersCreateRequest, Order>(ORDERS_CREATE_URL, body, opts);
	}

	/** Отменить созданный счёт. */
	cancel(body: OrdersCancelRequest, opts?: ExecOptions): Promise<void> {
		return this.exec<OrdersCancelRequest, void>(ORDERS_CANCEL_URL, body, opts);
	}
}
