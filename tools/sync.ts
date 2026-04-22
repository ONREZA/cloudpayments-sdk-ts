#!/usr/bin/env bun
/**
 * End-to-end re-sync с документацией CloudPayments:
 *   1. scrape: docs HTML → specs/raw.html
 *   2. parse:  HTML → specs/ir.json
 *   3. gen:    IR → src/_generated/
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
import type { IR } from "./parse.ts";

const ROOT = resolve(import.meta.dir, "..");
const REPORT_PATH = resolve(ROOT, ".sync-report.md");

async function run(script: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn("bun", [script], { cwd: ROOT, stdio: "inherit" });
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
	params: number;
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
					params: g.params.length,
				});
			}
			for (const sg of g.subgroups) {
				if (sg.urls.length > 0) {
					out.push({
						anchor: sg.anchor,
						title: `${s.title} → ${g.title} → ${sg.title}`,
						urls: sg.urls.map((u) => u.url),
						params: sg.params.length,
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

async function makeReport(): Promise<string> {
	if (!existsSync(resolve(ROOT, "specs/ir.json"))) return "No IR generated.\n";
	const ir = (await Bun.file(resolve(ROOT, "specs/ir.json")).json()) as IR;

	let prev: IR | null = null;
	const prevPath = resolve(ROOT, "specs/ir.prev.json");
	if (existsSync(prevPath)) {
		prev = (await Bun.file(prevPath).json()) as IR;
	}

	const current = collectEndpoints(ir);
	const currentHandbooks = collectHandbooks(ir);

	const lines: string[] = [];
	lines.push("## CloudPayments docs sync", "");
	lines.push(`- htmlSize: ${ir.source.htmlSize} bytes`);
	lines.push(`- htmlSha256: \`${ir.source.htmlSha256.slice(0, 16)}…\``);
	lines.push(`- parsedAt: ${ir.source.parsedAt}`);
	lines.push("");

	if (prev) {
		const before = collectEndpoints(prev);
		const beforeSet = new Set(before.map((e) => e.anchor));
		const afterSet = new Set(current.map((e) => e.anchor));
		const added = current.filter((e) => !beforeSet.has(e.anchor));
		const removed = before.filter((e) => !afterSet.has(e.anchor));

		if (added.length === 0 && removed.length === 0) {
			lines.push("**No endpoint changes.**", "");
		} else {
			if (added.length > 0) {
				lines.push("### ➕ Added endpoints", "");
				for (const e of added) lines.push(`- \`${e.anchor}\` — ${e.title} (${e.params} params)`);
				lines.push("");
			}
			if (removed.length > 0) {
				lines.push("### ➖ Removed endpoints", "");
				for (const e of removed) lines.push(`- \`${e.anchor}\` — ${e.title}`);
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

	return lines.join("\n");
}

async function main() {
	const steps = ["tools/scrape.ts", "tools/parse.ts", "tools/gen.ts"];
	for (const s of steps) {
		console.log(`\n━━━ ${s} ━━━`);
		await run(s);
	}

	const report = await makeReport();
	await writeFile(REPORT_PATH, report);
	console.log(`\n✓ Sync complete. Report at ${REPORT_PATH}`);

	// Выходим с 100 если ни specs/ir.json, ни src/_generated/ не изменились
	// относительно индекса git — CI поймёт что ничего публиковать не надо.
	const changed = gitStatusPaths(["specs/ir.json", "src/_generated"]).trim();
	if (!changed) {
		console.log("→ no changes to specs/ir.json or src/_generated — exit 100");
		process.exit(100);
	}
	console.log("→ changes detected:");
	console.log(changed);
}

await main();
