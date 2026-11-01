#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { withRollback } from "./artifacts.js";
import { type DocsSource, getDocsSource } from "./docs-sources.js";

const MIN_SIZE = 100_000;
const FETCH_TIMEOUT_MS = 30_000;

export async function fetchDocs(source: DocsSource): Promise<string> {
	console.log(`→ Fetching ${source.label}: ${source.url}`);
	const response = await fetch(source.url, {
		headers: { "User-Agent": "onreza/cloudpayments-sdk scrape" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`Failed to fetch ${source.label}: HTTP ${response.status}`);
	const html = await response.text();
	if (html.length < MIN_SIZE)
		throw new Error(`${source.label} response too small (${html.length} characters)`);
	if (!source.contentPattern.test(html))
		throw new Error(`Response does not look like ${source.label} docs`);
	return html;
}

export async function saveRaw(source: DocsSource, html: string): Promise<void> {
	const current = existsSync(source.rawPath) ? await readFile(source.rawPath, "utf8") : null;
	if (current === html) return;
	await mkdir(dirname(source.rawPath), { recursive: true });
	if (current !== null) await copyFile(source.rawPath, source.previousRawPath);
	await writeFile(source.rawPath, html);
	console.log(`✓ Updated ${source.rawPath}`);
}

if (import.meta.main) {
	const source = getDocsSource(process.argv[2]);
	const html = await fetchDocs(source);
	await withRollback([source.rawPath, source.previousRawPath], () => saveRaw(source, html));
}
