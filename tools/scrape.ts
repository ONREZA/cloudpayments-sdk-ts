#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DOCS_URL = process.env.CP_DOCS_URL ?? "https://developers.cloudpayments.ru/";
const RAW_PATH = resolve(import.meta.dir, "..", "specs", "raw.html");
const PREV_PATH = resolve(import.meta.dir, "..", "specs", "raw.prev.html");

const MIN_SIZE = 100_000;

async function sha256(path: string): Promise<string | null> {
	if (!existsSync(path)) return null;
	const data = await readFile(path);
	return createHash("sha256").update(data).digest("hex");
}

async function main() {
	console.log(`→ Fetching ${DOCS_URL}`);
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
	if (!/developers.cloudpayments|CloudPayments/i.test(html)) {
		console.error("✗ Response does not look like CloudPayments docs. Aborting.");
		process.exit(1);
	}

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
		console.log("✓ Saved previous HTML to specs/raw.prev.html");
	}

	await copyFile(tmpPath, RAW_PATH);
	await Bun.file(tmpPath)
		.delete?.()
		.catch(() => {});

	const sizeKB = Math.round(html.length / 1024);
	console.log(`✓ Updated specs/raw.html (${sizeKB}KB, sha256 ${newHash?.slice(0, 12)}…)`);
	console.log("→ Run `bun run docs:parse` to rebuild IR");
}

await main();
