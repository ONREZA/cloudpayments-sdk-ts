#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type CheerioAPI, load } from "cheerio";
import type { AnyNode, Element } from "domhandler";

/* ───────────────── IR types ───────────────── */

export interface IR {
	source: {
		url: string;
		parsedAt: string;
		htmlSha256: string;
		htmlSize: number;
	};
	sections: Section[];
}

export interface Section {
	anchor: string;
	title: string;
	level: 1;
	description: string;
	groups: Group[];
}

export interface Group {
	anchor: string;
	title: string;
	level: 2 | 3;
	description: string;
	notes: string[];
	urls: Url[];
	params: Param[];
	tables: Table[];
	requestExamples: CodeBlock[];
	responseExamples: CodeBlock[];
	otherCodeBlocks: CodeBlock[];
	subgroups: Group[];
}

export interface Url {
	url: string;
	label: string;
}

export interface Param {
	name: string;
	type: string;
	required: boolean;
	description: string;
}

export interface Table {
	headers: string[];
	rows: Record<string, string>[];
}

export interface CodeBlock {
	label: string;
	language: string;
	code: string;
}

/* ───────────────── Paths ───────────────── */

const RAW_PATH = resolve(import.meta.dir, "..", "specs", "raw.html");
const IR_PATH = resolve(import.meta.dir, "..", "specs", "ir.json");
const IR_PREV_PATH = resolve(import.meta.dir, "..", "specs", "ir.prev.json");
const DOCS_URL = "https://developers.cloudpayments.ru/";

/* ───────────────── HTML → Markdown ───────────────── */

const _BLOCK_TAGS = new Set([
	"p",
	"ul",
	"ol",
	"li",
	"br",
	"div",
	"blockquote",
	"pre",
	"table",
	"tr",
	"td",
	"th",
	"thead",
	"tbody",
	"aside",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
]);

function isElement(n: AnyNode): n is Element {
	return n.type === "tag" || n.type === "script" || n.type === "style";
}

function nodeToMarkdown($: CheerioAPI, node: AnyNode): string {
	if (node.type === "text") {
		return (node.data ?? "").replace(/\s+/g, " ");
	}
	if (!isElement(node)) return "";
	const tag = node.tagName.toLowerCase();

	if (tag === "br") return "\n";
	if (tag === "a") {
		const href = node.attribs?.href ?? "";
		const text = innerText($, node);
		if (!href || !text) return text;
		return `[${text}](${href})`;
	}
	if (tag === "code") return `\`${innerText($, node)}\``;
	if (tag === "strong" || tag === "b") return `**${childrenToMarkdown($, node)}**`;
	if (tag === "em" || tag === "i") return `*${childrenToMarkdown($, node)}*`;
	if (tag === "li") return `- ${childrenToMarkdown($, node).trim()}\n`;
	if (tag === "ul" || tag === "ol") return `${childrenToMarkdown($, node)}\n`;
	if (tag === "p") return `${childrenToMarkdown($, node).trim()}\n\n`;
	if (tag === "aside") return `> ${childrenToMarkdown($, node).trim()}\n\n`;
	if (tag === "pre" || tag === "script" || tag === "style") return "";
	if (tag === "img") {
		const src = node.attribs?.src ?? "";
		const alt = node.attribs?.alt ?? "";
		return `![${alt}](${src})`;
	}
	return childrenToMarkdown($, node);
}

function childrenToMarkdown($: CheerioAPI, node: Element): string {
	let out = "";
	for (const child of node.children) out += nodeToMarkdown($, child);
	return out;
}

function innerText($: CheerioAPI, node: Element): string {
	return $(node).text().replace(/\s+/g, " ").trim();
}

function elementsToMarkdown($: CheerioAPI, els: Element[]): string {
	let out = "";
	for (const el of els) out += nodeToMarkdown($, el);
	return out
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]+\n/g, "\n")
		.trim();
}

/* ───────────────── Walker: flat linear → heading blocks ───────────────── */

type HeadingBlock = {
	tag: "h1" | "h2" | "h3";
	id: string;
	title: string;
	elements: Element[];
};

function walkToHeadingBlocks($: CheerioAPI): HeadingBlock[] {
	const blocks: HeadingBlock[] = [];
	let current: HeadingBlock | null = null;

	const $content = $(".content").first();
	if ($content.length === 0) throw new Error("Cannot find .content wrapper in HTML");

	$content.children().each((_, el) => {
		if (!isElement(el)) return;
		const tag = el.tagName.toLowerCase();
		if (tag === "h1" || tag === "h2" || tag === "h3") {
			if (current) blocks.push(current);
			current = {
				tag,
				id: el.attribs?.id ?? "",
				title: innerText($, el),
				elements: [],
			};
		} else if (current) {
			current.elements.push(el);
		}
	});
	if (current) blocks.push(current);
	return blocks;
}

/* ───────────────── Extractors ───────────────── */

/**
 * Собирает текстовое описание (markdown) из элементов ДО первого маркера-структуры:
 * "Адрес метода", "Адреса метода", "Параметры запроса", "Пример запроса", "Пример ответа".
 */
function extractDescription($: CheerioAPI, els: Element[]): string {
	const descEls: Element[] = [];
	for (const el of els) {
		if (isStructuralMarker($, el)) break;
		if (el.tagName.toLowerCase() === "table") break;
		if (el.tagName.toLowerCase() === "aside") continue;
		if (isHighlightDiv(el)) break;
		descEls.push(el);
	}
	return elementsToMarkdown($, descEls);
}

const STRUCTURAL_MARKER_RE =
	/^(Адрес(а)? метода|Параметры запроса|Пример запроса|Пример ответа)(?=[\s:.]|$)/iu;

function isStructuralMarker($: CheerioAPI, el: Element): boolean {
	if (el.tagName.toLowerCase() !== "p") return false;
	return STRUCTURAL_MARKER_RE.test(innerText($, el));
}

function isHighlightDiv(el: Element): boolean {
	if (el.tagName.toLowerCase() !== "div") return false;
	const cls = el.attribs?.class ?? "";
	return /\bhighlight\b/.test(cls);
}

function extractAsides($: CheerioAPI, els: Element[]): string[] {
	const notes: string[] = [];
	for (const el of els) {
		if (el.tagName.toLowerCase() === "aside") {
			const md = childrenToMarkdown($, el).trim();
			if (md) notes.push(md);
		}
	}
	return notes;
}

/**
 * URL-блок: <p> с маркером "Адрес(а) метода". Следующий узел — <p> или текст с URL'ами.
 * Возвращает распарсенные URL-ы с лейблами.
 */
function extractUrls($: CheerioAPI, els: Element[]): Url[] {
	const urls: Url[] = [];
	for (let i = 0; i < els.length; i++) {
		const el = els[i];
		if (!el) continue;
		if (el.tagName.toLowerCase() !== "p") continue;
		const txt = innerText($, el);
		if (!/^Адрес(а)? метода/iu.test(txt)) continue;

		// Ищем URL-ы в этом <p> (они идут после <br>), и в следующем <p>, если он не маркер.
		const candidates: Element[] = [el];
		const next = els[i + 1];
		if (next?.tagName.toLowerCase() === "p" && !isStructuralMarker($, next)) {
			candidates.push(next);
		}

		for (const cand of candidates) {
			const html = $(cand).html() ?? "";
			const lines = splitByBr(html);
			for (const line of lines) {
				const parsed = parseUrlLine($, line);
				if (parsed) urls.push(parsed);
			}
		}
		break; // только первый "Адрес метода" блок
	}
	return urls;
}

function splitByBr(html: string): string[] {
	return html
		.split(/<br\s*\/?>/i)
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseUrlLine(_$: CheerioAPI, line: string): Url | null {
	const wrapped = `<div>${line}</div>`;
	const frag = load(wrapped);
	const text = frag("div").text().replace(/\s+/g, " ").trim();
	const match = text.match(/https?:\/\/\S+/);
	if (!match) return null;
	const url = match[0].replace(/[.,;]$/, "");
	const idx = text.indexOf(url);
	let label = text.slice(idx + url.length).trim();
	label = label
		.replace(/^[—–-]\s*/, "")
		.replace(/^для\s+/i, "")
		.trim();
	return { url, label };
}

/**
 * Параметры запроса: первая <table> после <p>"Параметры запроса:" ЛИБО
 * первая таблица в блоке с заголовками вида [Параметр/Поле, Формат/Тип, ...] —
 * для webhooks и раздела "Уведомления" маркера нет, но формат таблицы
 * совпадает.
 */
function extractParams($: CheerioAPI, els: Element[]): Param[] {
	let foundMarker = false;
	for (const el of els) {
		const tag = el.tagName.toLowerCase();
		if (!foundMarker) {
			if (tag === "p" && /^Параметры запроса/iu.test(innerText($, el))) foundMarker = true;
			else if (tag === "table") {
				const table = parseTable($, el);
				if (looksLikeParamTable(table)) return tableToParams(table);
			}
			continue;
		}
		if (tag === "table") return tableToParams(parseTable($, el));
		if (isStructuralMarker($, el) && tag === "p") continue;
		if (isHighlightDiv(el)) break;
	}
	return [];
}

function looksLikeParamTable(table: Table): boolean {
	const hasName = table.headers.some((h) => PARAM_NAME_KEYS.includes(h));
	const hasType = table.headers.some((h) => PARAM_TYPE_KEYS.includes(h));
	return hasName && hasType;
}

function tableToParams(table: Table): Param[] {
	return table.rows.map((row) => rowToParam(row)).filter((p): p is Param => p !== null);
}

const PARAM_NAME_KEYS = ["Параметр", "Поле", "Параметры"];
const PARAM_TYPE_KEYS = ["Формат", "Тип", "Формат данных"];
const PARAM_REQ_KEYS = ["Применение", "Обязательность", "Обязательный"];
const PARAM_DESC_KEYS = ["Описание", "Значение", "Примечание"];

function rowToParam(row: Record<string, string>): Param | null {
	const name = firstOfKeys(row, PARAM_NAME_KEYS);
	if (!name) return null;
	return {
		name: name.trim(),
		type: firstOfKeys(row, PARAM_TYPE_KEYS).trim(),
		required: parseRequired(firstOfKeys(row, PARAM_REQ_KEYS)),
		description: firstOfKeys(row, PARAM_DESC_KEYS).trim(),
	};
}

function firstOfKeys(row: Record<string, string>, keys: string[]): string {
	for (const k of keys) if (k in row && row[k] !== undefined) return row[k] as string;
	return "";
}

function parseRequired(raw: string): boolean {
	const v = raw.toLowerCase().trim();
	if (!v) return false;
	if (/^обязат/u.test(v)) return true;
	if (/^необязат/u.test(v)) return false;
	if (v === "да" || v === "yes") return true;
	if (v === "нет" || v === "no") return false;
	return false;
}

/**
 * Все таблицы в блоке — с заголовками и строками как records.
 */
function extractAllTables($: CheerioAPI, els: Element[]): Table[] {
	const tables: Table[] = [];
	for (const el of els) {
		if (el.tagName.toLowerCase() === "table") {
			tables.push(parseTable($, el));
		}
	}
	return tables;
}

function parseTable($: CheerioAPI, tableEl: Element): Table {
	const $t = $(tableEl);
	const headers: string[] = [];
	$t.find("thead th").each((_, th) => {
		headers.push(innerText($, th));
	});
	if (headers.length === 0) {
		$t.find("tr")
			.first()
			.find("th,td")
			.each((_, th) => {
				headers.push(innerText($, th));
			});
	}

	const rows: Record<string, string>[] = [];
	$t.find("tbody tr").each((_, tr) => {
		const row: Record<string, string> = {};
		$(tr)
			.find("td")
			.each((i, td) => {
				const key = headers[i] ?? `col${i}`;
				row[key] = cellToMarkdown($, td);
			});
		if (Object.keys(row).length > 0) rows.push(row);
	});

	// Иногда thead отсутствует — тогда первая tr попадает в tbody через cheerio. Обрабатываем fallback:
	if (rows.length === 0) {
		const trs = $t.find("tr").toArray();
		for (let i = 1; i < trs.length; i++) {
			const tr = trs[i];
			if (!tr) continue;
			const row: Record<string, string> = {};
			$(tr)
				.find("td,th")
				.each((j, c) => {
					const key = headers[j] ?? `col${j}`;
					row[key] = cellToMarkdown($, c);
				});
			if (Object.keys(row).length > 0) rows.push(row);
		}
	}

	return { headers, rows };
}

function cellToMarkdown($: CheerioAPI, el: Element): string {
	return childrenToMarkdown($, el).replace(/\s+/g, " ").trim();
}

/**
 * Примеры кода: <p><strong>Пример {запроса|ответа}:</strong> <em>...label...</em></p>
 * затем <div class="highlight"><pre class="highlight {lang}"><code>...</code></pre></div>.
 * Все остальные highlight-блоки идут в otherCodeBlocks.
 */
function extractCodeBlocks(
	$: CheerioAPI,
	els: Element[],
): {
	requestExamples: CodeBlock[];
	responseExamples: CodeBlock[];
	otherCodeBlocks: CodeBlock[];
} {
	const requestExamples: CodeBlock[] = [];
	const responseExamples: CodeBlock[] = [];
	const otherCodeBlocks: CodeBlock[] = [];

	let pendingLabel: { kind: "request" | "response"; label: string } | null = null;

	for (const el of els) {
		const tag = el.tagName.toLowerCase();
		if (tag === "p") {
			const strongText = innerText($, $(el).find("strong").first()[0] ?? el);
			if (/^Пример запроса/iu.test(strongText)) {
				pendingLabel = { kind: "request", label: extractExampleLabel($, el) };
			} else if (/^Пример ответа/iu.test(strongText)) {
				pendingLabel = { kind: "response", label: extractExampleLabel($, el) };
			}
			continue;
		}
		if (isHighlightDiv(el)) {
			const block = parseHighlight($, el);
			if (!block) continue;
			if (pendingLabel?.kind === "request") {
				requestExamples.push({ ...block, label: pendingLabel.label });
				pendingLabel = null;
			} else if (pendingLabel?.kind === "response") {
				responseExamples.push({ ...block, label: pendingLabel.label });
				pendingLabel = null;
			} else {
				otherCodeBlocks.push(block);
			}
		}
	}

	return { requestExamples, responseExamples, otherCodeBlocks };
}

function extractExampleLabel($: CheerioAPI, pEl: Element): string {
	const em = $(pEl).find("em").first();
	if (em.length > 0) {
		return innerText($, em[0] as Element).replace(/[:.]$/, "");
	}
	// fallback — весь текст минус ведущее "Пример ..."
	const full = innerText($, pEl);
	return full.replace(/^Пример (запроса|ответа)[:\s]*/iu, "").trim();
}

function parseHighlight($: CheerioAPI, el: Element): CodeBlock | null {
	const pre = $(el).find("pre").first();
	if (pre.length === 0) return null;
	const cls = (pre.attr("class") ?? "") as string;
	const langMatch = cls.match(/highlight\s+([\w-]+)/) ?? cls.match(/tab-([\w-]+)/);
	const rawLang = langMatch?.[1] ?? "";
	const language = normalizeLang(rawLang);
	const code = pre.text();
	return { label: "", language, code };
}

function normalizeLang(raw: string): string {
	const v = raw.toLowerCase();
	if (!v || v === "llvm") return "json"; // CP часто помечает JSON как llvm через плагин подсветки
	if (v === "shell" || v === "bash" || v === "sh") return "shell";
	if (v === "js" || v === "javascript") return "javascript";
	if (v === "ts" || v === "typescript") return "typescript";
	return v;
}

/* ───────────────── Build tree ───────────────── */

function buildTree(blocks: HeadingBlock[], $: CheerioAPI): Section[] {
	const sections: Section[] = [];
	let lastSection: Section | null = null;
	let lastH2: Group | null = null;

	for (const block of blocks) {
		if (block.tag === "h1") {
			lastSection = {
				anchor: block.id,
				title: block.title,
				level: 1,
				description: extractDescription($, block.elements),
				groups: [],
			};
			sections.push(lastSection);
			lastH2 = null;
			continue;
		}
		const group = buildGroup(block, $);
		if (block.tag === "h2") {
			if (!lastSection) {
				lastSection = {
					anchor: "",
					title: "",
					level: 1,
					description: "",
					groups: [],
				};
				sections.push(lastSection);
			}
			lastSection.groups.push(group);
			lastH2 = group;
		} else if (block.tag === "h3") {
			if (lastH2) lastH2.subgroups.push(group);
			else if (lastSection) lastSection.groups.push(group);
		}
	}
	return sections;
}

function buildGroup(block: HeadingBlock, $: CheerioAPI): Group {
	const { requestExamples, responseExamples, otherCodeBlocks } = extractCodeBlocks(
		$,
		block.elements,
	);
	return {
		anchor: block.id,
		title: block.title,
		level: block.tag === "h2" ? 2 : 3,
		description: extractDescription($, block.elements),
		notes: extractAsides($, block.elements),
		urls: extractUrls($, block.elements),
		params: extractParams($, block.elements),
		tables: extractAllTables($, block.elements),
		requestExamples,
		responseExamples,
		otherCodeBlocks,
		subgroups: [],
	};
}

/* ───────────────── Main ───────────────── */

async function main() {
	if (!existsSync(RAW_PATH)) {
		console.error("✗ specs/raw.html not found. Run `bun run docs:scrape` first.");
		process.exit(1);
	}

	const html = await readFile(RAW_PATH, "utf8");
	const htmlSha256 = createHash("sha256").update(html).digest("hex");

	console.log(`→ Parsing specs/raw.html (${Math.round(html.length / 1024)}KB)`);

	const $ = load(html);
	const blocks = walkToHeadingBlocks($);
	console.log(`  ${blocks.length} heading blocks found`);

	const sections = buildTree(blocks, $);

	// Stats
	const groupCount = sections.reduce((acc, s) => acc + s.groups.length, 0);
	const endpointCount = sections.reduce(
		(acc, s) =>
			acc +
			s.groups.reduce(
				(a, g) =>
					a + (g.urls.length > 0 ? 1 : 0) + g.subgroups.filter((sg) => sg.urls.length > 0).length,
				0,
			),
		0,
	);
	console.log(`  ${sections.length} sections, ${groupCount} groups, ${endpointCount} endpoints`);

	const ir: IR = {
		source: {
			url: DOCS_URL,
			parsedAt: new Date().toISOString(),
			htmlSha256,
			htmlSize: html.length,
		},
		sections,
	};

	if (existsSync(IR_PATH)) {
		await copyFile(IR_PATH, IR_PREV_PATH);
	}
	await writeFile(IR_PATH, `${JSON.stringify(ir, null, 2)}\n`);
	console.log("✓ Wrote specs/ir.json");
}

await main();
