import { describe, expect, test } from "bun:test";
import cloudkassir from "../../specs/cloudkassir/ir.json";
import compatibility from "../../specs/compatibility-endpoints.json";
import cloudpayments from "../../specs/ir.json";
import { resolveEndpoints } from "../../tools/gen.js";
import type { IR } from "../../tools/parse.js";

function withoutGroups(...anchors: string[]): IR {
	const ir = structuredClone(cloudpayments) as IR;
	for (const section of ir.sections)
		section.groups = section.groups.filter((group) => !anchors.includes(group.anchor));
	return ir;
}

describe("documentation generator", () => {
	test("preserves only the explicitly retained QR image contracts when official sections disappear", () => {
		const endpoints = resolveEndpoints({
			cloudpayments: withoutGroups(...compatibility.endpoints.map((entry) => entry.anchor)),
			cloudkassir: cloudkassir as IR,
		});
		for (const retained of compatibility.endpoints) {
			const endpoint = endpoints.find((candidate) => candidate.group.anchor === retained.anchor);
			expect(endpoint?.urls.map((url) => url.url)).toEqual(
				retained.group.urls.map((url) => url.url),
			);
			expect(endpoint?.params).toEqual(retained.group.params);
		}
	});

	test("fails closed for any other missing endpoint", () => {
		expect(() =>
			resolveEndpoints({
				cloudpayments: withoutGroups("testovyy-metod"),
				cloudkassir: cloudkassir as IR,
			}),
		).toThrow("Endpoint alias not found");
	});

	test("fails closed for new official endpoints without a public alias", () => {
		const ir = structuredClone(cloudpayments) as IR;
		const group = ir.sections[0]?.groups[0];
		if (!group) throw new Error("Expected a documentation group");
		group.urls.push({
			url: "https://api.cloudpayments.ru/future/payment",
			label: "New endpoint",
		});
		expect(() => resolveEndpoints({ cloudpayments: ir, cloudkassir: cloudkassir as IR })).toThrow(
			"Official API endpoints are not exposed",
		);
	});
});
