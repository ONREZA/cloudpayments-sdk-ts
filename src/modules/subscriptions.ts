/**
 * Модуль subscriptions — рекуррентные платежи (создание, просмотр, поиск,
 * изменение, отмена подписки).
 */

import type {
	SubscriptionsCancelRequest,
	SubscriptionsCreateRequest,
	SubscriptionsFindByAccountRequest,
	SubscriptionsGetRequest,
	SubscriptionsUpdateRequest,
} from "../_generated/endpoints.js";
import {
	SUBSCRIPTIONS_CANCEL_URL,
	SUBSCRIPTIONS_CREATE_URL,
	SUBSCRIPTIONS_FIND_BY_ACCOUNT_URL,
	SUBSCRIPTIONS_GET_URL,
	SUBSCRIPTIONS_UPDATE_URL,
} from "../_generated/endpoints.js";
import type { Subscription } from "../types.js";
import { BaseModule, type ExecOptions } from "./base.js";

export class SubscriptionsModule extends BaseModule {
	/** Создать подписку. Требует уже проведённой транзакции с SaveCard=true (для Token). */
	create(body: SubscriptionsCreateRequest, opts?: ExecOptions): Promise<Subscription> {
		return this.exec<SubscriptionsCreateRequest, Subscription>(
			SUBSCRIPTIONS_CREATE_URL,
			body,
			opts,
		);
	}

	/** Получить одну подписку по Id. */
	get(body: SubscriptionsGetRequest, opts?: ExecOptions): Promise<Subscription> {
		return this.exec<SubscriptionsGetRequest, Subscription>(SUBSCRIPTIONS_GET_URL, body, opts);
	}

	/** Поиск подписок по AccountId. */
	findByAccount(
		body: SubscriptionsFindByAccountRequest,
		opts?: ExecOptions,
	): Promise<Subscription[]> {
		return this.exec<SubscriptionsFindByAccountRequest, Subscription[]>(
			SUBSCRIPTIONS_FIND_BY_ACCOUNT_URL,
			body,
			opts,
		);
	}

	/** Изменить существующую подписку. */
	update(body: SubscriptionsUpdateRequest, opts?: ExecOptions): Promise<Subscription> {
		return this.exec<SubscriptionsUpdateRequest, Subscription>(
			SUBSCRIPTIONS_UPDATE_URL,
			body,
			opts,
		);
	}

	/** Отменить подписку. */
	cancel(body: SubscriptionsCancelRequest, opts?: ExecOptions): Promise<void> {
		return this.exec<SubscriptionsCancelRequest, void>(SUBSCRIPTIONS_CANCEL_URL, body, opts);
	}
}
