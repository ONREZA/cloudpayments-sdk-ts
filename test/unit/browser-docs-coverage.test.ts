import { describe, expect, test } from "bun:test";
import ir from "../../specs/ir.json";
import {
	CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL,
	CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL,
	CLOUDPAYMENTS_WIDGET_SCRIPT_URL,
} from "../../src/browser/index.js";

function section(anchor: string) {
	return ir.sections.find((candidate) => candidate.anchor === anchor);
}

function serializedSection(anchor: string): string {
	return JSON.stringify(section(anchor));
}

describe("browser documentation coverage", () => {
	test("tracks all three browser integration surfaces and their official scripts", () => {
		expect(serializedSection("platezhnyy-vidzhet")).toContain(CLOUDPAYMENTS_WIDGET_SCRIPT_URL);
		expect(serializedSection("platezhnyy-konstruktor")).toContain(
			CLOUDPAYMENTS_PAYMENT_BLOCKS_SCRIPT_URL,
		);
		expect(serializedSection("skript-checkout")).toContain(CLOUDPAYMENTS_CHECKOUT_SCRIPT_URL);
	});

	test("tracks the documented modern browser methods", () => {
		expect(serializedSection("platezhnyy-vidzhet")).toContain("widget.start(intentParams)");
		const blocks = serializedSection("platezhnyy-konstruktor");
		for (const method of ["blocksApp.mount", "blocksApp.update", "blocksApp.on", "blocksApp.off"])
			expect(blocks).toContain(method);
		expect(serializedSection("skript-checkout")).toContain("createPaymentCryptogram");
	});
});
