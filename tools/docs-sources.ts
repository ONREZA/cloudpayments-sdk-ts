import { resolve } from "node:path";

export type DocsSourceName = "cloudpayments" | "cloudkassir";

export interface DocsSource {
	name: DocsSourceName;
	label: string;
	url: string;
	rawPath: string;
	previousRawPath: string;
	irPath: string;
	previousIrPath: string;
	contentPattern: RegExp;
}

const ROOT = resolve(import.meta.dir, "..");

export const DOCS_SOURCES: Record<DocsSourceName, DocsSource> = {
	cloudpayments: {
		name: "cloudpayments",
		label: "CloudPayments",
		url: "https://developers.cloudpayments.ru/",
		rawPath: resolve(ROOT, "specs", "raw.html"),
		previousRawPath: resolve(ROOT, "specs", "raw.prev.html"),
		irPath: resolve(ROOT, "specs", "ir.json"),
		previousIrPath: resolve(ROOT, "specs", "ir.prev.json"),
		contentPattern: /developers\.cloudpayments|CloudPayments/i,
	},
	cloudkassir: {
		name: "cloudkassir",
		label: "CloudKassir",
		url: "https://developers.cloudkassir.ru/",
		rawPath: resolve(ROOT, "specs", "cloudkassir", "raw.html"),
		previousRawPath: resolve(ROOT, "specs", "cloudkassir", "raw.prev.html"),
		irPath: resolve(ROOT, "specs", "cloudkassir", "ir.json"),
		previousIrPath: resolve(ROOT, "specs", "cloudkassir", "ir.prev.json"),
		contentPattern: /developers\.cloudkassir|CloudKassir/i,
	},
};

export function getDocsSource(rawName: string | undefined): DocsSource {
	const name = rawName ?? "cloudpayments";
	if (name !== "cloudpayments" && name !== "cloudkassir") {
		throw new Error(`Unknown docs source: ${name}`);
	}
	return DOCS_SOURCES[name];
}
