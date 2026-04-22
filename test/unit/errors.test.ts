import { describe, expect, test } from "bun:test";
import { CloudPaymentsBusinessError, categorizeReasonCode } from "../../src/errors/index.js";

describe("categorizeReasonCode", () => {
	test("insufficient funds family", () => {
		expect(categorizeReasonCode(5051)).toBe("insufficientFunds");
		expect(categorizeReasonCode(5061)).toBe("insufficientFunds");
	});
	test("decline by issuer", () => {
		expect(categorizeReasonCode(5005)).toBe("declineByIssuer");
		expect(categorizeReasonCode(5001)).toBe("declineByIssuer");
	});
	test("fraud", () => {
		expect(categorizeReasonCode(5034)).toBe("fraudSuspected");
		expect(categorizeReasonCode(5063)).toBe("fraudSuspected");
		expect(categorizeReasonCode(5300)).toBe("fraudSuspected");
	});
	test("card problem", () => {
		expect(categorizeReasonCode(5054)).toBe("cardProblem");
		expect(categorizeReasonCode(5082)).toBe("cardProblem");
	});
	test("3ds auth failed", () => {
		expect(categorizeReasonCode(5206)).toBe("authenticationFailed");
		expect(categorizeReasonCode(5207)).toBe("authenticationFailed");
	});
	test("6xxx → service error", () => {
		expect(categorizeReasonCode(6010)).toBe("serviceError");
		expect(categorizeReasonCode(6001)).toBe("serviceError");
	});
	test("unknown / 0 / undefined", () => {
		expect(categorizeReasonCode(undefined)).toBe("unknown");
		expect(categorizeReasonCode(0)).toBe("unknown");
		expect(categorizeReasonCode(9999)).toBe("unknown");
	});
});

describe("CloudPaymentsBusinessError helpers", () => {
	test("isInsufficientFunds true for 5051", () => {
		const err = new CloudPaymentsBusinessError("", null, 5051);
		expect(err.isInsufficientFunds()).toBe(true);
		expect(err.category()).toBe("insufficientFunds");
	});
	test("isRetriable true for networkError", () => {
		const err = new CloudPaymentsBusinessError("", null, 5091);
		expect(err.isRetriable()).toBe(true);
	});
	test("isRetriable false for cardProblem", () => {
		const err = new CloudPaymentsBusinessError("", null, 5054);
		expect(err.isRetriable()).toBe(false);
		expect(err.isCardProblem()).toBe(true);
	});
	test("undefined reasonCode → unknown", () => {
		const err = new CloudPaymentsBusinessError("no code", null, undefined);
		expect(err.category()).toBe("unknown");
		expect(err.isInsufficientFunds()).toBe(false);
	});
});
