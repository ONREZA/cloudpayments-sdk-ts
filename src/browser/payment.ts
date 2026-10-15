import type { WidgetResult } from "./types.js";

export interface WidgetWaitOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
}

export type WidgetWaitResult =
	| { status: "reported"; result: WidgetResult }
	| { status: "pending"; reason: "timeout" | "aborted" }
	| { status: "pending"; reason: "error"; error: unknown };

/** Observes an existing attempt; browser reports do not confirm payment settlement. */
export function waitForWidgetResult(
	result: PromiseLike<WidgetResult>,
	options?: WidgetWaitOptions,
): Promise<WidgetWaitResult> {
	const attempt = Promise.resolve(result);
	const timeoutMs = options?.timeoutMs ?? 30_000;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
		void attempt.catch(() => {});
		return Promise.reject(new RangeError("timeoutMs must be finite, positive and <= 2147483647"));
	}
	const signal = options?.signal;

	return new Promise((resolve) => {
		let settled = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const finish = (observation: WidgetWaitResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			signal?.removeEventListener("abort", onAbort);
			resolve(observation);
		};
		const onAbort = () => finish({ status: "pending", reason: "aborted" });

		// Keep consuming the original attempt after this observation ends.
		void attempt.then(
			(reported) => finish({ status: "reported", result: reported }),
			(error: unknown) => finish({ status: "pending", reason: "error", error }),
		);
		if (signal?.aborted) {
			onAbort();
			return;
		}
		timeout = setTimeout(() => finish({ status: "pending", reason: "timeout" }), timeoutMs);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
