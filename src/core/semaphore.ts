/**
 * Простая FIFO-semaphore. Используется для ограничения concurrency-запросов
 * к CloudPayments API (CP лимитит 5 одновременных для тестовых терминалов,
 * 30 для боевых — если упереться, возвращает 429).
 */
export class Semaphore {
	#available: number;
	readonly #queue: Array<() => void> = [];

	constructor(concurrency: number) {
		if (concurrency < 1) throw new RangeError("concurrency must be >= 1");
		this.#available = concurrency;
	}

	async acquire(): Promise<() => void> {
		if (this.#available > 0) {
			this.#available--;
			return () => this.#release();
		}
		return new Promise<() => void>((resolve) => {
			this.#queue.push(() => {
				this.#available--;
				resolve(() => this.#release());
			});
		});
	}

	#release(): void {
		this.#available++;
		const next = this.#queue.shift();
		if (next) next();
	}

	/** Обёртка — выполняет fn внутри семафора. */
	async run<T>(fn: () => Promise<T>): Promise<T> {
		const release = await this.acquire();
		try {
			return await fn();
		} finally {
			release();
		}
	}
}
