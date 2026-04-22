import { describe, expect, test } from "bun:test";
import { Semaphore } from "../../src/core/semaphore.js";

describe("Semaphore", () => {
	test("concurrency < 1 throws", () => {
		expect(() => new Semaphore(0)).toThrow(RangeError);
	});

	test("allows up to N concurrent", async () => {
		const sem = new Semaphore(2);
		let running = 0;
		let peak = 0;
		const run = async () => {
			await sem.run(async () => {
				running++;
				if (running > peak) peak = running;
				await new Promise((r) => setTimeout(r, 30));
				running--;
			});
		};
		await Promise.all([run(), run(), run(), run()]);
		expect(peak).toBe(2);
	});

	test("releases slot even on thrown error", async () => {
		const sem = new Semaphore(1);
		await expect(
			sem.run(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		// следующий .run должен сразу получить слот
		let ran = false;
		await sem.run(async () => {
			ran = true;
		});
		expect(ran).toBe(true);
	});
});
