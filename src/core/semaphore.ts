/**
 * Простая FIFO-semaphore. Используется для ограничения concurrency-запросов
 * к CloudPayments API (CP лимитит 5 одновременных для тестовых терминалов,
 * 30 для боевых — если упереться, возвращает 429).
 */
export class Semaphore {
	#available: number;
	readonly #queue: Array<{
		resolve: (release: () => void) => void;
		reject: (reason: unknown) => void;
		signal: AbortSignal | undefined;
		onAbort: () => void;
	}> = [];

	constructor(concurrency: number) {
		if (concurrency < 1) throw new RangeError("concurrency must be >= 1");
		this.#available = concurrency;
	}

	async acquire(signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted) {
			throw signal.reason ?? new DOMException("Aborted", "AbortError");
		}
		if (this.#available > 0) {
			this.#available--;
			return () => this.#release();
		}
		return new Promise<() => void>((resolve, reject) => {
			const waiter = {
				resolve,
				reject,
				signal,
				onAbort: () => {
					const index = this.#queue.indexOf(waiter);
					if (index < 0) return;
					this.#queue.splice(index, 1);
					reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
				},
			};
			this.#queue.push(waiter);
			signal?.addEventListener("abort", waiter.onAbort, { once: true });
		});
	}

	#release(): void {
		const next = this.#queue.shift();
		if (next) {
			next.signal?.removeEventListener("abort", next.onAbort);
			next.resolve(() => this.#release());
		} else {
			this.#available++;
		}
	}

	/** Обёртка — выполняет fn внутри семафора. */
	async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		const release = await this.acquire(signal);
		try {
			return await fn();
		} finally {
			release();
		}
	}
}
