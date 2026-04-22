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
