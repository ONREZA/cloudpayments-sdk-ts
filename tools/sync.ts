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
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { directorySnapshot, sameSnapshot, withRollback } from "./artifacts.js";
import { DOCS_SOURCES, type DocsSource, type DocsSourceName } from "./docs-sources.js";
import { type IR, parseHtml, saveIR } from "./parse.js";
import { fetchDocs, saveRaw } from "./scrape.js";

const ROOT = resolve(import.meta.dir, "..");
const REPORT_PATH = resolve(ROOT, ".sync-report.md");
const GENERATED_PATH = resolve(ROOT, "src/_generated");

async function generate(): Promise<void> {
	await new Promise<void>((ok, fail) => {
		const child = spawn(process.execPath, ["tools/gen.ts"], {
			cwd: ROOT,
			stdio: "inherit",
		});
		child.on("error", fail);
		child.on("close", (code) =>
			code === 0 ? ok() : fail(new Error(`Generator exited with ${code}`)),
		);
	});
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
					anchor: `${s.anchor}/${g.anchor}`,
					title: `${s.title} → ${g.title}`,
					urls: g.urls.map((u) => u.url),
					params: g.params.map(({ name, type, required }) => ({
						name,
						type,
						required,
					})),
				});
			}
			for (const sg of g.subgroups) {
				if (sg.urls.length > 0) {
					out.push({
						anchor: `${s.anchor}/${g.anchor}/${sg.anchor}`,
						title: `${s.title} → ${g.title} → ${sg.title}`,
						urls: sg.urls.map((u) => u.url),
						params: (sg.params.length
							? sg.params
							: g.params.length
								? g.params
								: (g.subgroups.find((child) => child.params.length)?.params ?? [])
						).map(({ name, type, required }) => ({ name, type, required })),
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

export async function makeSourceReport(source: DocsSource, unchanged = false): Promise<string[]> {
	if (!existsSync(source.irPath))
		return [`## ${source.label} docs sync`, "", "No IR generated.", ""];
	const ir = (await Bun.file(source.irPath).json()) as IR;

	let prev: IR | null = unchanged ? ir : null;
	if (!unchanged && existsSync(source.previousIrPath)) {
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

export async function makeReport(unchangedSources = new Set<DocsSourceName>()): Promise<string> {
	const sections = await Promise.all(
		Object.values(DOCS_SOURCES).map((source) =>
			makeSourceReport(source, unchangedSources.has(source.name)),
		),
	);
	return sections.flat().join("\n");
}

async function main(): Promise<number> {
	await rm(REPORT_PATH, { force: true });
	const fetched = await Promise.all(
		Object.values(DOCS_SOURCES).map(async (source) => {
			const html = await fetchDocs(source);
			const ir = parseHtml(html, source.url);
			const current = existsSync(source.irPath) ? await readFile(source.irPath, "utf8") : null;
			return {
				source,
				html,
				ir,
				changed: current !== `${JSON.stringify(ir, null, 2)}\n`,
			};
		}),
	);
	const generatedBefore = await directorySnapshot(GENERATED_PATH);
	const paths = [
		...Object.values(DOCS_SOURCES).flatMap((source) => [
			source.rawPath,
			source.previousRawPath,
			source.irPath,
			source.previousIrPath,
		]),
		GENERATED_PATH,
	];
	return withRollback(paths, async () => {
		try {
			for (const { source, html, ir } of fetched) {
				await saveRaw(source, html);
				await saveIR(source, ir);
			}
			await generate();
			const generatedAfter = await directorySnapshot(GENERATED_PATH);
			if (!fetched.some((item) => item.changed) && sameSnapshot(generatedBefore, generatedAfter)) {
				console.log("✓ No changes to docs IR or generated output");
				return 100;
			}
			const unchangedSources = new Set(
				fetched.filter((item) => !item.changed).map((item) => item.source.name),
			);
			await writeFile(REPORT_PATH, await makeReport(unchangedSources));
			console.log(`✓ Sync complete. Report at ${REPORT_PATH}`);
			return 0;
		} catch (error) {
			await rm(REPORT_PATH, { force: true });
			throw error;
		}
	});
}

if (import.meta.main) {
	try {
		process.exitCode = await main();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
