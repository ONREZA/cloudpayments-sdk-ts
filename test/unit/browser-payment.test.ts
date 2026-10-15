import { describe, expect, spyOn, test } from "bun:test";
import type { WidgetResult } from "../../src/browser/index.js";
import { waitForWidgetResult } from "../../src/browser/index.js";

describe("waitForWidgetResult", () => {
	test("bounds a missing browser result without ending the attempt", async () => {
		const attempt = Promise.withResolvers<WidgetResult>();
		const observation = await waitForWidgetResult(attempt.promise, { timeoutMs: 1 });
		expect(observation).toEqual({ status: "pending", reason: "timeout" });

		const next = waitForWidgetResult(attempt.promise);
		const reported: WidgetResult = { type: "payment", status: "success" };
		attempt.resolve(reported);
		expect(await next).toEqual({ status: "reported", result: reported });
		expect(observation).toEqual({ status: "pending", reason: "timeout" });
	});

	test("preserves every raw browser report without treating it as final settlement", async () => {
		const reports: WidgetResult[] = [
			{ type: "payment", status: "success", data: { transactionId: 42 } },
			{ type: "payment", status: "fail", data: { ReasonCode: 5051 } },
			{ type: "cancel", status: "cancel" },
			{ type: "sbp", status: "wait", isAwaitingResult: true },
			{ type: "cryptogram", data: { cryptogram: "card-packet" } },
		];
		for (const result of reports) {
			const observation = await waitForWidgetResult(Promise.resolve(result));
			expect(observation.status).toBe("reported");
			if (observation.status === "reported") expect(observation.result).toBe(result);
		}
	});

	test("reports rejection as pending with the original error", async () => {
		const error = new Error("widget lost its connection");
		expect(await waitForWidgetResult(Promise.reject(error))).toEqual({
			status: "pending",
			reason: "error",
			error,
		});
	});

	test("consumes a rejection after timeout and allows observing the same rejection", async () => {
		const attempt = Promise.withResolvers<WidgetResult>();
		expect(await waitForWidgetResult(attempt.promise, { timeoutMs: 1 })).toEqual({
			status: "pending",
			reason: "timeout",
		});
		const error = new Error("late provider rejection");
		attempt.reject(error);
		await Bun.sleep(1);
		expect(await waitForWidgetResult(attempt.promise)).toEqual({
			status: "pending",
			reason: "error",
			error,
		});
	});

	test("aborts only the observation and retains the same attempt", async () => {
		const controller = new AbortController();
		const attempt = Promise.withResolvers<WidgetResult>();
		const observation = waitForWidgetResult(attempt.promise, { signal: controller.signal });
		controller.abort();
		expect(await observation).toEqual({ status: "pending", reason: "aborted" });

		const result: WidgetResult = { type: "payment", status: "wait" };
		attempt.resolve(result);
		expect(await waitForWidgetResult(attempt.promise)).toEqual({ status: "reported", result });
	});

	test("pre-abort returns pending while consuming a later rejection", async () => {
		const controller = new AbortController();
		controller.abort();
		const attempt = Promise.withResolvers<WidgetResult>();
		expect(await waitForWidgetResult(attempt.promise, { signal: controller.signal })).toEqual({
			status: "pending",
			reason: "aborted",
		});
		attempt.reject(new Error("rejected after pre-abort"));
		await Bun.sleep(1);
	});

	test("accepts a PromiseLike and captures a throwing then accessor", async () => {
		const result: WidgetResult = { type: "payment", status: "success" };
		const promise = Promise.resolve(result);
		// biome-ignore lint/suspicious/noThenProperty: Exercise the public PromiseLike contract.
		const promiseLike: PromiseLike<WidgetResult> = { then: promise.then.bind(promise) };
		expect(await waitForWidgetResult(promiseLike)).toEqual({ status: "reported", result });
		const error = new Error("invalid provider thenable");
		const throwing: PromiseLike<WidgetResult> = {
			// biome-ignore lint/suspicious/noThenProperty: Exercise promise assimilation failures.
			get then(): PromiseLike<WidgetResult>["then"] {
				throw error;
			},
		};
		expect(await waitForWidgetResult(throwing)).toEqual({
			status: "pending",
			reason: "error",
			error,
		});
	});

	test("uses a 30 second default and cleans timers and abort listeners on every outcome", async () => {
		for (const outcome of ["reported", "error", "timeout", "aborted"] as const) {
			const controller = new AbortController();
			const attempt = Promise.withResolvers<WidgetResult>();
			const timer = spyOn(globalThis, "setTimeout");
			const clear = spyOn(globalThis, "clearTimeout");
			const remove = spyOn(controller.signal, "removeEventListener");
			try {
				const observation = waitForWidgetResult(attempt.promise, {
					signal: controller.signal,
					...(outcome === "timeout" ? { timeoutMs: 1 } : {}),
				});
				expect(timer.mock.calls[0]?.[1]).toBe(outcome === "timeout" ? 1 : 30_000);
				if (outcome === "reported") attempt.resolve({ type: "payment", status: "success" });
				if (outcome === "error") attempt.reject(new Error("provider error"));
				if (outcome === "aborted") controller.abort();
				await observation;
				expect(clear).toHaveBeenCalledTimes(1);
				expect(remove).toHaveBeenCalledTimes(1);
				expect(remove.mock.calls[0]?.[0]).toBe("abort");
			} finally {
				timer.mockRestore();
				clear.mockRestore();
				remove.mockRestore();
			}
		}
	});

	test("rejects invalid timer values before scheduling a timer", async () => {
		const timer = spyOn(globalThis, "setTimeout");
		try {
			for (const timeoutMs of [0, -1, NaN, Infinity, -Infinity, 2_147_483_648]) {
				await expect(
					waitForWidgetResult(new Promise<WidgetResult>(() => {}), { timeoutMs }),
				).rejects.toBeInstanceOf(RangeError);
			}
			expect(timer).not.toHaveBeenCalled();
		} finally {
			timer.mockRestore();
		}
	});

	test("consumes a rejected source even when the timeout option is invalid", () => {
		const entrypoint = new URL("../../src/browser/index.ts", import.meta.url).href;
		const run = Bun.spawnSync([
			process.execPath,
			"-e",
			`const { waitForWidgetResult } = await import(${JSON.stringify(entrypoint)});
const unhandled = [];
process.on("unhandledRejection", (error) => unhandled.push(error));
try {
	await waitForWidgetResult(Promise.reject(new Error("provider rejection")), { timeoutMs: 0 });
	throw new Error("invalid timeout was accepted");
} catch (error) {
	if (!(error instanceof RangeError)) throw error;
}
await Bun.sleep(5);
console.log(unhandled.length);`,
		]);
		expect(run.stderr.toString()).toBe("");
		expect(run.exitCode).toBe(0);
		expect(run.stdout.toString().trim()).toBe("0");
	});

	test("imports the browser entrypoint without accessing document", () => {
		const entrypoint = new URL("../../src/browser/index.ts", import.meta.url).href;
		const run = Bun.spawnSync([
			process.execPath,
			"-e",
			`Object.defineProperty(globalThis, "document", { get() { throw new Error("DOM accessed"); } }); await import(${JSON.stringify(entrypoint)});`,
		]);
		expect(run.stderr.toString()).toBe("");
		expect(run.exitCode).toBe(0);
	});
});
