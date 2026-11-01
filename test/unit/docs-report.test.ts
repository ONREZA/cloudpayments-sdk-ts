import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DOCS_SOURCES } from "../../tools/docs-sources.js";
import { parseHtml } from "../../tools/parse.js";
import { makeSourceReport } from "../../tools/sync.js";

function html(includeQr: boolean, includePhone: boolean): string {
	const address = (path: string) =>
		`<h3 id="adres-metoda">Адрес метода</h3><p>https://api.cloudpayments.ru/${path}</p>`;
	return `<main class="content">
		<h1 id="t-pay">T-Pay</h1><h2 id="link">Link</h2>${address("tpay/link")}
		${includeQr ? `<h2 id="qr">QR</h2>${address("tpay/image")}` : ""}
		<h1 id="sberpay">SberPay</h1><h2 id="link">Link</h2>${address("sberpay/link")}
		<h3 id="params">Параметры запроса</h3>
		<table><thead><tr><th>Параметр</th><th>Формат</th><th>Применение</th><th>Описание</th></tr></thead>
		<tbody><tr><td>Amount</td><td>Decimal</td><td>Обязательный</td><td>Amount</td></tr>
		${includePhone ? "<tr><td>Phone</td><td>String</td><td>Необязательный</td><td>Required on DesktopWeb</td></tr>" : ""}</tbody></table>
		${includeQr ? `<h2 id="qr">QR</h2>${address("sberpay/image")}` : ""}
	</main>`;
}

test("docs report identifies endpoints by their full section path and includes nested request parameters", async () => {
	const directory = await mkdtemp("/var/tmp/cloudpayments-report-test-");
	const source = {
		...DOCS_SOURCES.cloudpayments,
		irPath: resolve(directory, "ir.json"),
		previousIrPath: resolve(directory, "ir.prev.json"),
	};
	try {
		await writeFile(
			source.previousIrPath,
			JSON.stringify(parseHtml(html(true, false), source.url)),
		);
		await writeFile(source.irPath, JSON.stringify(parseHtml(html(false, true), source.url)));
		const report = (await makeSourceReport(source)).join("\n");
		expect(report).toContain("`t-pay/qr/adres-metoda`");
		expect(report).toContain("`sberpay/qr/adres-metoda`");
		expect(report).toContain(
			"`sberpay/link/adres-metoda` — SberPay → Link → Адрес метода (2 params)",
		);
		expect(report).not.toContain("`t-pay/link/adres-metoda`");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
