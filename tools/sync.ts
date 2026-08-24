#!/usr/bin/env bun
/**
 * End-to-end re-sync с документацией CloudPayments и CloudKassir:
 *   1. scrape: docs HTML → specs
 *   2. parse:  HTML → IR
 *   3. gen:    оба IR → src/_generated/
 *
 * Вызывается из CI (sync-docs.yml) и локально перед релизом.
 *
 * Exit codes (важно для CI):
 *   0   — успех, есть изменения в specs/ir.json ИЛИ src/_generated/
 *   100 — успех, но ни specs/ir.json, ни src/_generated/ не изменились
 *   ≠0  — ошибка в одном из шагов
 *
 * Дополнительно пишет `.sync-report.md` со сводкой изменений (добавлено/убрано
 * endpoints, изменения в справочниках) — используется CI как PR body.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DOCS_SOURCES, type DocsSource } from "./docs-sources.js";
import type { IR } from "./parse.js";

const ROOT = resolve(import.meta.dir, "..");
const REPORT_PATH = resolve(ROOT, ".sync-report.md");

async function run(script: string, args: string[] = []): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn("bun", [script, ...args], { cwd: ROOT, stdio: "inherit" });
		child.on("exit", (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(`${script} exited with ${code}`));
		});
	});
}

function gitStatusPaths(paths: string[]): string {
	try {
		return execSync(`git status --porcelain -- ${paths.map((p) => JSON.stringify(p)).join(" ")}`, {
			cwd: ROOT,
			encoding: "utf8",
		});
	} catch {
		return "";
	}
}

interface EndpointSummary {
	anchor: string;
	title: string;
	urls: string[];
	params: Array<{ name: string; type: string; required: boolean }>;
}

function collectEndpoints(ir: IR): EndpointSummary[] {
	const out: EndpointSummary[] = [];
	for (const s of ir.sections) {
		for (const g of s.groups) {
			if (g.urls.length > 0) {
				out.push({
					anchor: g.anchor,
					title: `${s.title} → ${g.title}`,
					urls: g.urls.map((u) => u.url),
					params: g.params.map(({ name, type, required }) => ({ name, type, required })),
				});
			}
			for (const sg of g.subgroups) {
				if (sg.urls.length > 0) {
					out.push({
						anchor: sg.anchor,
						title: `${s.title} → ${g.title} → ${sg.title}`,
						urls: sg.urls.map((u) => u.url),
						params: sg.params.map(({ name, type, required }) => ({ name, type, required })),
					});
				}
			}
		}
	}
	return out;
}

function collectHandbooks(ir: IR): Array<{ anchor: string; title: string; rows: number }> {
	const out: Array<{ anchor: string; title: string; rows: number }> = [];
	const spr = ir.sections.find((s) => s.anchor === "spravochniki");
	if (!spr) return out;
	for (const g of spr.groups) {
		const rows = g.tables[0]?.rows.length ?? 0;
		out.push({ anchor: g.anchor, title: g.title, rows });
	}
	return out;
}

async function makeSourceReport(source: DocsSource): Promise<string[]> {
	if (!existsSync(source.irPath))
		return [`## ${source.label} docs sync`, "", "No IR generated.", ""];
	const ir = (await Bun.file(source.irPath).json()) as IR;

	let prev: IR | null = null;
	if (existsSync(source.previousIrPath)) {
		prev = (await Bun.file(source.previousIrPath).json()) as IR;
	}

	const current = collectEndpoints(ir);
	const currentHandbooks = collectHandbooks(ir);

	const lines: string[] = [];
	lines.push(`## ${source.label} docs sync`, "");
	lines.push(`- htmlSize: ${ir.source.htmlSize} bytes`);
	lines.push(`- htmlSha256: \`${ir.source.htmlSha256.slice(0, 16)}…\``);
	lines.push("");

	if (prev) {
		const before = collectEndpoints(prev);
		const beforeSet = new Set(before.map((e) => e.anchor));
		const beforeByAnchor = new Map(before.map((e) => [e.anchor, e]));
		const afterSet = new Set(current.map((e) => e.anchor));
		const added = current.filter((e) => !beforeSet.has(e.anchor));
		const removed = before.filter((e) => !afterSet.has(e.anchor));
		const changed = current.filter((endpoint) => {
			const previous = beforeByAnchor.get(endpoint.anchor);
			return (
				previous !== undefined &&
				JSON.stringify([previous.urls, previous.params]) !==
					JSON.stringify([endpoint.urls, endpoint.params])
			);
		});

		if (added.length === 0 && removed.length === 0 && changed.length === 0) {
			lines.push("**No endpoint changes.**", "");
		} else {
			if (added.length > 0) {
				lines.push("### ➕ Added endpoints", "");
				for (const e of added) {
					lines.push(`- \`${e.anchor}\` — ${e.title} (${e.params.length} params)`);
				}
				lines.push("");
			}
			if (removed.length > 0) {
				lines.push("### ➖ Removed endpoints", "");
				for (const e of removed) lines.push(`- \`${e.anchor}\` — ${e.title}`);
				lines.push("");
			}
			if (changed.length > 0) {
				lines.push("### ✏️ Changed endpoint contracts", "");
				for (const e of changed) {
					lines.push(`- \`${e.anchor}\` — ${e.title} (${e.params.length} params)`);
				}
				lines.push("");
			}
		}
	} else {
		lines.push(`### Endpoints (${current.length})`, "");
		for (const e of current) lines.push(`- \`${e.anchor}\` — ${e.title}`);
		lines.push("");
	}

	lines.push(`### Handbooks`, "");
	for (const h of currentHandbooks) {
		lines.push(`- \`${h.anchor}\` — ${h.title} (${h.rows} rows)`);
	}
	lines.push("");

	return lines;
}

async function makeReport(): Promise<string> {
	const sections = await Promise.all(Object.values(DOCS_SOURCES).map(makeSourceReport));
	return sections.flat().join("\n");
}

async function main() {
	for (const source of Object.values(DOCS_SOURCES)) {
		for (const script of ["tools/scrape.ts", "tools/parse.ts"]) {
			console.log(`\n━━━ ${script} (${source.label}) ━━━`);
			await run(script, [source.name]);
		}
	}
	console.log("\n━━━ tools/gen.ts ━━━");
	await run("tools/gen.ts");

	const report = await makeReport();
	await writeFile(REPORT_PATH, report);
	console.log(`\n✓ Sync complete. Report at ${REPORT_PATH}`);

	// Выходим с 100 если ни один IR, ни generated output не изменились
	// относительно индекса git — CI поймёт что ничего публиковать не надо.
	const changed = gitStatusPaths([
		...Object.values(DOCS_SOURCES).map((source) => source.irPath),
		"src/_generated",
	]).trim();
	if (!changed) {
		console.log("→ no changes to docs IR or src/_generated — exit 100");
		process.exit(100);
	}
	console.log("→ changes detected:");
	console.log(changed);
}

await main();
