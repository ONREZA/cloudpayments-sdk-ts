/**
 * Bun.serve-based listener для реальных webhook-уведомлений CloudPayments.
 *
 * CP отправляет разные типы уведомлений на разные URL (ТСП настраивает
 * каждый в ЛК). Мы принимаем на любом path, тип определяем по path —
 * `/check` → Check, `/pay` → Pay и т.д. Если настроен ровно один URL —
 * тип будет "unknown", но payload всё равно отверифицируется.
 *
 * Каждое входящее уведомление:
 *  - достаём сырое тело (нужно до JSON.parse — иначе сломается подпись)
 *  - читаем Content-HMAC или X-Content-HMAC
 *  - определяем формат по Content-Type (json / form-urlencoded)
 *  - гоним через verifyWebhook — тот же код, что в публичном SDK
 *  - складываем в очередь для ожидающих waiter-ов
 *
 * На любой запрос отвечаем `{code: 0}` — стандартный «success» для Check.
 * Для остальных типов CP ответ не проверяет, но отдавать что-то валидное
 * обязательно, чтобы CP не пометил уведомление как неуспешное.
 */
import {
	type VerifyWebhookInput,
	verifyWebhook,
	WebhookVerificationError,
} from "../../../src/webhooks/index.js";

type BunServerHandle = ReturnType<typeof Bun.serve>;

export interface ReceivedWebhook {
	/** check | pay | fail | confirm | refund | recurrent | cancel | unknown */
	type: string;
	/** Распарсенный payload (если verify прошёл) или null. */
	payload: unknown;
	rawBody: string;
	signature: string | null;
	verified: boolean;
	verificationError: string | undefined;
	headers: Record<string, string>;
	contentType: "application/json" | "application/x-www-form-urlencoded";
	receivedAt: Date;
}

export interface WebhookListenerOptions {
	port: number;
	apiSecret: string;
}

export class WebhookListener {
	readonly #events: ReceivedWebhook[] = [];
	#waiters: Array<{
		predicate: (e: ReceivedWebhook) => boolean;
		resolve: (e: ReceivedWebhook) => void;
	}> = [];
	#server: BunServerHandle | null = null;

	constructor(private readonly opts: WebhookListenerOptions) {}

	start(): void {
		this.#server = Bun.serve({
			port: this.opts.port,
			hostname: "0.0.0.0",
			fetch: (req) => this.#handle(req),
		});
	}

	close(): void {
		this.#server?.stop(true);
		this.#server = null;
	}

	/** Все события, которые уже пришли (read-only snapshot). */
	get received(): readonly ReceivedWebhook[] {
		return this.#events;
	}

	/** Первое событие любого типа в пределах таймаута. */
	waitForAny(timeoutMs: number): Promise<ReceivedWebhook> {
		return this.#waitBy(() => true, timeoutMs);
	}

	/** Первое событие заданного type (по path, в нижнем регистре). */
	waitForType(type: string, timeoutMs: number): Promise<ReceivedWebhook> {
		const target = type.toLowerCase();
		return this.#waitBy((e) => e.type === target, timeoutMs);
	}

	async #handle(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const type = url.pathname.replace(/^\/+/, "").split("/")[0]?.toLowerCase() || "unknown";
		const rawBody = await req.text();
		const signature = req.headers.get("content-hmac") ?? req.headers.get("x-content-hmac") ?? null;

		const rawContentType = (req.headers.get("content-type") ?? "").toLowerCase();
		const contentType: VerifyWebhookInput["contentType"] = rawContentType.includes("json")
			? "application/json"
			: "application/x-www-form-urlencoded";

		let verified = false;
		let payload: unknown = null;
		let verificationError: string | undefined;

		try {
			payload = await verifyWebhook({
				rawBody,
				signature,
				apiSecret: this.opts.apiSecret,
				contentType,
			});
			verified = true;
		} catch (err) {
			verificationError =
				err instanceof WebhookVerificationError ? `${err.reason}: ${err.message}` : String(err);
		}

		const headers: Record<string, string> = {};
		req.headers.forEach((v, k) => {
			headers[k] = v;
		});

		const event: ReceivedWebhook = {
			type,
			payload,
			rawBody,
			signature,
			verified,
			verificationError,
			headers,
			contentType,
			receivedAt: new Date(),
		};

		this.#events.push(event);
		// Разбудить первого подходящего waiter-а.
		const idx = this.#waiters.findIndex((w) => w.predicate(event));
		if (idx >= 0) {
			const [w] = this.#waiters.splice(idx, 1);
			w?.resolve(event);
		}

		return Response.json({ code: 0 });
	}

	#waitBy(predicate: (e: ReceivedWebhook) => boolean, timeoutMs: number): Promise<ReceivedWebhook> {
		// Сначала смотрим в уже полученные.
		const existing = this.#events.find(predicate);
		if (existing) return Promise.resolve(existing);

		return new Promise((resolve, reject) => {
			const waiter = {
				predicate,
				resolve: (e: ReceivedWebhook) => {
					clearTimeout(t);
					resolve(e);
				},
			};
			const t = setTimeout(() => {
				this.#waiters = this.#waiters.filter((w) => w !== waiter);
				reject(new Error(`No matching webhook received within ${timeoutMs}ms`));
			}, timeoutMs);
			this.#waiters.push(waiter);
		});
	}
}
