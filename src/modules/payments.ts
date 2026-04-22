/**
 * Модуль payments — платежи, выплаты, 3DS, получение/выгрузка транзакций.
 * Соответствует разделу «API» из документации CloudPayments.
 */

import type {
	PaymentsAuthCryptogramRequest,
	PaymentsAuthTokenRequest,
	PaymentsChargeCryptogramRequest,
	PaymentsChargeTokenRequest,
	PaymentsConfirmRequest,
	PaymentsGetRequest,
	PaymentsListByDayRequest,
	PaymentsListByPeriodRequest,
	PaymentsListClaimsByPeriodRequest,
	PaymentsListTokensRequest,
	PaymentsPayoutCryptogramRequest,
	PaymentsPayoutSbpRequest,
	PaymentsPayoutTokenRequest,
	PaymentsPost3dsRequest,
	PaymentsRefundRequest,
	PaymentsTestRequest,
	PaymentsVoidRequest,
} from "../_generated/endpoints.js";
import {
	PAYMENTS_AUTH_CRYPTOGRAM_URL,
	PAYMENTS_AUTH_TOKEN_URL,
	PAYMENTS_CHARGE_CRYPTOGRAM_URL,
	PAYMENTS_CHARGE_TOKEN_URL,
	PAYMENTS_CONFIRM_URL,
	PAYMENTS_GET_URL,
	PAYMENTS_LIST_BY_DAY_URL,
	PAYMENTS_LIST_BY_PERIOD_URL,
	PAYMENTS_LIST_CLAIMS_BY_PERIOD_URL,
	PAYMENTS_LIST_TOKENS_URL,
	PAYMENTS_PAYOUT_CRYPTOGRAM_URL,
	PAYMENTS_PAYOUT_SBP_URL,
	PAYMENTS_PAYOUT_TOKEN_URL,
	PAYMENTS_POST3DS_URL,
	PAYMENTS_REFUND_URL,
	PAYMENTS_TEST_URL,
	PAYMENTS_VOID_URL,
} from "../_generated/endpoints.js";
import { CloudPaymentsBusinessError } from "../errors/index.js";
import type { TokenRecord, Transaction } from "../types.js";
import { BaseModule, type ExecOptions } from "./base.js";

export class PaymentsModule extends BaseModule {
	/**
	 * Тестовый пинг. Возвращает GUID сервера, лежащий в поле Message (редкий
	 * случай — у CP только /test кладёт ответ туда, без Model). Бросает
	 * {@link CloudPaymentsBusinessError} если Success=false.
	 */
	async test(body: PaymentsTestRequest = {}, opts?: ExecOptions): Promise<string> {
		const env = await this.http.post<{ Success: boolean; Message: string | null }>(
			PAYMENTS_TEST_URL,
			body,
			opts,
		);
		if (!env.Success) throw new CloudPaymentsBusinessError(env.Message ?? "", null, undefined);
		return env.Message ?? "";
	}

	/** Одностадийная оплата по криптограмме. Бросает 3DsRequiredError при необходимости 3DS. */
	chargeCryptogram(
		body: PaymentsChargeCryptogramRequest,
		opts?: ExecOptions,
	): Promise<Transaction> {
		return this.exec<PaymentsChargeCryptogramRequest, Transaction>(
			PAYMENTS_CHARGE_CRYPTOGRAM_URL,
			body,
			{ detect3ds: true, ...opts },
		);
	}

	/** Двухстадийная оплата по криптограмме (auth). Требует последующего {@link confirm}. */
	authCryptogram(body: PaymentsAuthCryptogramRequest, opts?: ExecOptions): Promise<Transaction> {
		return this.exec<PaymentsAuthCryptogramRequest, Transaction>(
			PAYMENTS_AUTH_CRYPTOGRAM_URL,
			body,
			{ detect3ds: true, ...opts },
		);
	}

	/** Завершить 3DS: после того как плательщик вернулся с TermUrl с PaRes. */
	post3ds(body: PaymentsPost3dsRequest, opts?: ExecOptions): Promise<Transaction> {
		return this.exec<PaymentsPost3dsRequest, Transaction>(PAYMENTS_POST3DS_URL, body, opts);
	}

	/** Одностадийная оплата по сохранённому токену (рекарринг). */
	chargeToken(body: PaymentsChargeTokenRequest, opts?: ExecOptions): Promise<Transaction> {
		return this.exec<PaymentsChargeTokenRequest, Transaction>(PAYMENTS_CHARGE_TOKEN_URL, body, {
			detect3ds: true,
			...opts,
		});
	}

	/** Двухстадийная оплата по сохранённому токену. */
	authToken(body: PaymentsAuthTokenRequest, opts?: ExecOptions): Promise<Transaction> {
		return this.exec<PaymentsAuthTokenRequest, Transaction>(PAYMENTS_AUTH_TOKEN_URL, body, {
			detect3ds: true,
			...opts,
		});
	}

	/** Подтверждение двухстадийного платежа (списание после auth). */
	confirm(body: PaymentsConfirmRequest, opts?: ExecOptions): Promise<void> {
		return this.exec<PaymentsConfirmRequest, void>(PAYMENTS_CONFIRM_URL, body, opts);
	}

	/** Отмена авторизации (до confirm). */
	void(body: PaymentsVoidRequest, opts?: ExecOptions): Promise<void> {
		return this.exec<PaymentsVoidRequest, void>(PAYMENTS_VOID_URL, body, opts);
	}

	/** Возврат денег по завершённой транзакции. */
	refund(body: PaymentsRefundRequest, opts?: ExecOptions): Promise<{ TransactionId: number }> {
		return this.exec<PaymentsRefundRequest, { TransactionId: number }>(
			PAYMENTS_REFUND_URL,
			body,
			opts,
		);
	}

	/** Выплата на карту по криптограмме. */
	payoutCryptogram(
		body: PaymentsPayoutCryptogramRequest,
		opts?: ExecOptions,
	): Promise<Transaction> {
		return this.exec<PaymentsPayoutCryptogramRequest, Transaction>(
			PAYMENTS_PAYOUT_CRYPTOGRAM_URL,
			body,
			opts,
		);
	}

	/** Выплата на карту по сохранённому токену. */
	payoutToken(body: PaymentsPayoutTokenRequest, opts?: ExecOptions): Promise<Transaction> {
		return this.exec<PaymentsPayoutTokenRequest, Transaction>(
			PAYMENTS_PAYOUT_TOKEN_URL,
			body,
			opts,
		);
	}

	/** Выплата по СБП. */
	payoutSbp(body: PaymentsPayoutSbpRequest, opts?: ExecOptions): Promise<Transaction> {
		return this.exec<PaymentsPayoutSbpRequest, Transaction>(PAYMENTS_PAYOUT_SBP_URL, body, opts);
	}

	/**
	 * Получить одну транзакцию по ID. Возвращает Transaction независимо от
	 * того в каком она статусе (Completed/Authorized/Cancelled/Declined). CP
	 * для read-запросов возвращает Success=false если транзакция не в
	 * «успешном» статусе, но в Model всё равно лежит полноценный Transaction —
	 * мы его и отдаём. Бросаем {@link CloudPaymentsBusinessError} только если
	 * Model пуст (транзакция не найдена, неверный ID и т.п.).
	 */
	async get(body: PaymentsGetRequest, opts?: ExecOptions): Promise<Transaction> {
		const env = await this.http.post<{
			Success: boolean;
			Message: string | null;
			Model?: Transaction;
		}>(PAYMENTS_GET_URL, body, opts);
		if (env.Model && typeof env.Model === "object" && "TransactionId" in env.Model) {
			return env.Model as Transaction;
		}
		throw new CloudPaymentsBusinessError(
			env.Message ?? "Transaction not found",
			env.Model,
			undefined,
		);
	}

	/** Список транзакций за сутки. */
	listByDay(body: PaymentsListByDayRequest, opts?: ExecOptions): Promise<Transaction[]> {
		return this.exec<PaymentsListByDayRequest, Transaction[]>(PAYMENTS_LIST_BY_DAY_URL, body, opts);
	}

	/** Список транзакций за произвольный период. */
	listByPeriod(body: PaymentsListByPeriodRequest, opts?: ExecOptions): Promise<Transaction[]> {
		return this.exec<PaymentsListByPeriodRequest, Transaction[]>(
			PAYMENTS_LIST_BY_PERIOD_URL,
			body,
			opts,
		);
	}

	/**
	 * Async-iterator по всем страницам `listByPeriod`. Останавливается когда
	 * очередная страница приходит пустой. Каждая итерация — один батч Transaction[],
	 * чтобы caller сам решил collect в array или stream-process.
	 *
	 * @example
	 * for await (const batch of cp.payments.iterateByPeriod({
	 *   CreatedDateGte: "2026-04-01",
	 *   CreatedDateLte: "2026-04-30",
	 * })) {
	 *   for (const tx of batch) { ... }
	 * }
	 */
	async *iterateByPeriod(
		body: Omit<PaymentsListByPeriodRequest, "PageNumber">,
		opts?: ExecOptions,
	): AsyncGenerator<Transaction[], void, void> {
		let page = 1;
		while (true) {
			const batch = await this.listByPeriod({ ...body, PageNumber: page }, opts);
			if (batch.length === 0) return;
			yield batch;
			page++;
		}
	}

	/** Список претензий за период. */
	listClaimsByPeriod(
		body: PaymentsListClaimsByPeriodRequest,
		opts?: ExecOptions,
	): Promise<unknown[]> {
		return this.exec<PaymentsListClaimsByPeriodRequest, unknown[]>(
			PAYMENTS_LIST_CLAIMS_BY_PERIOD_URL,
			body,
			opts,
		);
	}

	/** Выгрузка сохранённых токенов. */
	listTokens(
		body: PaymentsListTokensRequest = {} as PaymentsListTokensRequest,
		opts?: ExecOptions,
	): Promise<TokenRecord[]> {
		return this.exec<PaymentsListTokensRequest, TokenRecord[]>(
			PAYMENTS_LIST_TOKENS_URL,
			body,
			opts,
		);
	}
}
