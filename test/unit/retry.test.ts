import { describe, expect, test } from "bun:test";
import {
	computeBackoffMs,
	DEFAULT_RETRY_OPTIONS,
	isAbortError,
	mergeRetryOptions,
	parseRetryAfter,
} from "../../src/core/retry.js";

describe("mergeRetryOptions", () => {
	test("returns defaults when nothing passed", () => {
		expect(mergeRetryOptions()).toEqual(DEFAULT_RETRY_OPTIONS);
	});
	test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
		"rejects invalid maxAttempts: %s",
		(maxAttempts) => {
			expect(() => mergeRetryOptions({ maxAttempts })).toThrow(RangeError);
		},
	);
	test.each(["baseDelayMs", "maxDelayMs"] as const)("validates %s", (option) => {
		for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
			expect(() => mergeRetryOptions({ [option]: value })).toThrow(RangeError);
		}
		expect(mergeRetryOptions({ [option]: 0 })[option]).toBe(0);
	});
	test.each([99, 600, 429.5, Number.NaN])("rejects invalid status: %s", (status) => {
		expect(() => mergeRetryOptions({ retryableStatuses: [status] })).toThrow(RangeError);
	});
	test("overrides selected fields", () => {
		const merged = mergeRetryOptions({ maxAttempts: 5 });
		expect(merged.maxAttempts).toBe(5);
		expect(merged.baseDelayMs).toBe(DEFAULT_RETRY_OPTIONS.baseDelayMs);
	});
});

describe("computeBackoffMs", () => {
	test("does not exceed maxDelayMs", () => {
		for (let i = 0; i < 100; i++) {
			expect(computeBackoffMs(10, 100, 1000)).toBeLessThanOrEqual(1000);
		}
	});
	test("is non-negative", () => {
		for (let i = 0; i < 50; i++) {
			expect(computeBackoffMs(3, 100, 10_000)).toBeGreaterThanOrEqual(0);
		}
	});
});

describe("parseRetryAfter", () => {
	test("preserves an overflowing positive delay so callers stop retrying", () => {
		expect(parseRetryAfter("9".repeat(400))).toBe(Number.POSITIVE_INFINITY);
	});
	test("null/empty returns null", () => {
		expect(parseRetryAfter(null)).toBeNull();
		expect(parseRetryAfter("")).toBeNull();
	});
	test("numeric seconds", () => {
		expect(parseRetryAfter("5")).toBe(5000);
	});
	test("HTTP-date form", () => {
		const future = new Date(Date.now() + 10_000).toUTCString();
		const ms = parseRetryAfter(future);
		expect(ms).toBeGreaterThan(5000);
		expect(ms).toBeLessThan(15_000);
	});
	test("invalid returns null", () => {
		expect(parseRetryAfter("not-a-date-not-a-number")).toBeNull();
	});
});

describe("isAbortError", () => {
	test("true for DOMException AbortError", () => {
		const err = new DOMException("aborted", "AbortError");
		expect(isAbortError(err)).toBe(true);
	});
	test("false for plain errors", () => {
		expect(isAbortError(new Error("boom"))).toBe(false);
		expect(isAbortError(null)).toBe(false);
	});
});
