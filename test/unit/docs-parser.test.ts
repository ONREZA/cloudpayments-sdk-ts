import { describe, expect, test } from "bun:test";
import { parseHtml } from "../../tools/parse.js";

describe("documentation parser", () => {
	test("preserves old and new endpoint addresses", () => {
		const ir = parseHtml(
			`<main class="content">
				<h1 id="api">API</h1>
				<h2 id="find">Поиск платежа</h2>
				<p>Адрес старого метода:</p>
				<p>https://api.cloudpayments.ru/payments/find</p>
				<p>Адрес нового метода:</p>
				<p>https://api.cloudpayments.ru/v2/payments/find</p>
			</main>`,
			"https://developers.cloudpayments.ru",
		);

		expect(ir.sections[0]?.groups[0]?.urls).toEqual([
			{
				url: "https://api.cloudpayments.ru/payments/find",
				label: "Адрес старого метода:",
			},
			{
				url: "https://api.cloudpayments.ru/v2/payments/find",
				label: "Адрес нового метода:",
			},
		]);
	});

	test("extracts an endpoint from a nested address heading", () => {
		const ir = parseHtml(
			`<main class="content">
				<h1 id="payments">Платежи</h1>
				<h2 id="sbp">СБП</h2>
				<h3 id="address">Адрес метода</h3>
				<p>https://api.cloudpayments.ru/payments/qr/sbp/link</p>
			</main>`,
			"https://developers.cloudpayments.ru",
		);

		expect(ir.sections[0]?.groups[0]?.subgroups[0]?.urls).toEqual([
			{
				url: "https://api.cloudpayments.ru/payments/qr/sbp/link",
				label: "Адрес метода",
			},
		]);
	});
});
