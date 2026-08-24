#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getDocsSource } from "./docs-sources.js";

const source = getDocsSource(process.argv[2]);
const DOCS_URL = source.url;
const RAW_PATH = source.rawPath;
const PREV_PATH = source.previousRawPath;

const MIN_SIZE = 100_000;

async function sha256(path: string): Promise<string | null> {
	if (!existsSync(path)) return null;
	const data = await readFile(path);
	return createHash("sha256").update(data).digest("hex");
}

async function main() {
	console.log(`→ Fetching ${source.label}: ${DOCS_URL}`);
	const res = await fetch(DOCS_URL, {
		headers: { "User-Agent": "onreza/cloudpayments-sdk scrape" },
	});
	if (!res.ok) {
		console.error(`✗ Failed: HTTP ${res.status} ${res.statusText}`);
		process.exit(1);
	}

	const html = await res.text();

	if (html.length < MIN_SIZE) {
		console.error(`✗ Response too small (${html.length}B, expected ≥${MIN_SIZE}B). Aborting.`);
		process.exit(1);
	}
	if (!source.contentPattern.test(html)) {
		console.error(`✗ Response does not look like ${source.label} docs. Aborting.`);
		process.exit(1);
	}

	await mkdir(dirname(RAW_PATH), { recursive: true });
	const tmpPath = `${RAW_PATH}.new`;
	await writeFile(tmpPath, html);

	const currentHash = await sha256(RAW_PATH);
	const newHash = await sha256(tmpPath);

	if (currentHash === newHash) {
		console.log("✓ No changes (sha256 match)");
		await Bun.file(tmpPath)
			.delete?.()
			.catch(() => {});
		process.exit(0);
	}

	if (existsSync(RAW_PATH)) {
		await copyFile(RAW_PATH, PREV_PATH);
		console.log(`✓ Saved previous HTML to ${source.previousRawPath}`);
	}

	await copyFile(tmpPath, RAW_PATH);
	await Bun.file(tmpPath)
		.delete?.()
		.catch(() => {});

	const sizeKB = Math.round(html.length / 1024);
	console.log(`✓ Updated ${source.rawPath} (${sizeKB}KB, sha256 ${newHash?.slice(0, 12)}…)`);
	console.log(`→ Run \`bun tools/parse.ts ${source.name}\` to rebuild IR`);
}

await main();
