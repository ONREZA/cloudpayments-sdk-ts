import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseHtml } from "../../tools/parse.js";

const repository = resolve(import.meta.dir, "../..");

function document(label: string, version: number): string {
	return `<main class="content"><h1 id="api">${label}</h1><h2 id="test">Test ${version}</h2><p>Адрес метода:</p><p>https://api.cloudpayments.ru/test/v${version}</p></main>${" ".repeat(100_000)}`;
}

test("docs sync rolls back both sources and generated output, retries safely, and clears stale reports", async () => {
	const directory = await mkdtemp("/var/tmp/cloudpayments-sync-test-");
	let version = 2;
	let kassirVersion: number | undefined;
	let invalidKassir = false;
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			const kassir = new URL(request.url).pathname === "/kassir";
			return new Response(
				kassir && invalidKassir
					? "invalid docs"
					: document(
							kassir ? "CloudKassir" : "CloudPayments",
							kassir ? (kassirVersion ?? version) : version,
						),
			);
		},
	});
	const run = async (tool: string) => {
		const child = Bun.spawn([process.execPath, `tools/${tool}.ts`], {
			cwd: directory,
			env: {
				...process.env,
				CLOUDPAYMENTS_DOCS_URL: `${server.url}payments`,
				CLOUDKASSIR_DOCS_URL: `${server.url}kassir`,
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { exitCode, stdout, stderr };
	};
	const report = resolve(directory, ".sync-report.md");
	const originals = new Map<string, string>();
	const assertOriginals = async () => {
		for (const [path, content] of originals)
			expect(await readFile(resolve(directory, path), "utf8")).toBe(content);
		expect(existsSync(resolve(directory, "src/_generated/new.ts"))).toBe(false);
		expect(existsSync(resolve(directory, "specs/cloudkassir/raw.prev.html"))).toBe(false);
		expect(existsSync(resolve(directory, "specs/cloudkassir/ir.prev.json"))).toBe(false);
	};
	try {
		await Promise.all(
			["tools", "specs/cloudkassir", "src/_generated"].map((path) =>
				mkdir(resolve(directory, path), { recursive: true }),
			),
		);
		await symlink(resolve(repository, "node_modules"), resolve(directory, "node_modules"));
		await Promise.all(
			[
				"sync",
				"scrape",
				"parse",
				"fetch",
				"diff",
				"docs-sources",
				"artifacts",
				"check-generated",
			].map((tool) =>
				copyFile(resolve(repository, `tools/${tool}.ts`), resolve(directory, `tools/${tool}.ts`)),
			),
		);
		for (const [prefix, label, url] of [
			["specs", "CloudPayments", `${server.url}payments`],
			["specs/cloudkassir", "CloudKassir", `${server.url}kassir`],
		]) {
			const html = document(label as string, 1);
			originals.set(`${prefix}/raw.html`, html);
			originals.set(`${prefix}/raw.prev.html`, "older HTML");
			originals.set(
				`${prefix}/ir.json`,
				`${JSON.stringify(parseHtml(html, url as string), null, 2)}\n`,
			);
			originals.set(`${prefix}/ir.prev.json`, "older IR");
		}
		originals.delete("specs/cloudkassir/raw.prev.html");
		originals.delete("specs/cloudkassir/ir.prev.json");
		originals.set("src/_generated/old.ts", "original output");
		await Promise.all(
			[...originals].map(([path, content]) => writeFile(resolve(directory, path), content)),
		);
		const generator = resolve(directory, "tools/gen.ts");
		await writeFile(
			generator,
			`import {rm} from "node:fs/promises"; await rm("src/_generated/old.ts"); await Bun.write("src/_generated/new.ts", "partial output"); throw new Error("generation failed");`,
		);

		invalidKassir = true;
		await writeFile(report, "stale report");
		expect((await run("sync")).exitCode).toBe(1);
		await assertOriginals();
		expect(existsSync(report)).toBe(false);
		expect((await run("fetch")).exitCode).toBe(1);
		await assertOriginals();

		invalidKassir = false;
		expect((await run("sync")).exitCode).toBe(1);
		await assertOriginals();
		expect(existsSync(report)).toBe(false);
		expect((await run("check-generated")).exitCode).toBe(1);
		await assertOriginals();

		await writeFile(generator, `await Bun.write("src/_generated/old.ts", "updated output");`);
		await writeFile(report, "stale report");
		expect((await run("check-generated")).exitCode).toBe(1);
		await assertOriginals();
		expect((await run("sync")).exitCode).toBe(0);
		expect(await readFile(report, "utf8")).toContain("CloudKassir docs sync");
		for (const prefix of ["specs", "specs/cloudkassir"]) {
			expect(await readFile(resolve(directory, `${prefix}/raw.prev.html`), "utf8")).toBe(
				originals.get(`${prefix}/raw.html`) as string,
			);
			expect(await readFile(resolve(directory, `${prefix}/ir.prev.json`), "utf8")).toBe(
				originals.get(`${prefix}/ir.json`) as string,
			);
		}
		expect((await run("sync")).exitCode).toBe(100);
		expect(existsSync(report)).toBe(false);
		for (const prefix of ["specs", "specs/cloudkassir"])
			expect(await readFile(resolve(directory, `${prefix}/raw.prev.html`), "utf8")).toBe(
				originals.get(`${prefix}/raw.html`) as string,
			);
		expect((await run("check-generated")).exitCode).toBe(0);
		version = 3;
		expect((await run("sync")).exitCode).toBe(0);
		for (const [prefix, label] of [
			["specs", "CloudPayments"],
			["specs/cloudkassir", "CloudKassir"],
		])
			expect(await readFile(resolve(directory, `${prefix}/raw.prev.html`), "utf8")).toBe(
				document(label as string, 2),
			);
		version = 4;
		kassirVersion = 3;
		expect((await run("sync")).exitCode).toBe(0);
		const nextReport = await readFile(report, "utf8");
		const [paymentsReport, kassirReport] = nextReport.split("## CloudKassir docs sync");
		expect(paymentsReport).toContain("Changed endpoint contracts");
		expect(kassirReport).toContain("**No endpoint changes.**");
		expect(kassirReport).not.toContain("Changed endpoint contracts");
		expect(await readFile(resolve(directory, "specs/cloudkassir/raw.prev.html"), "utf8")).toBe(
			document("CloudKassir", 2),
		);
		expect(await readFile(resolve(directory, "specs/cloudkassir/ir.prev.json"), "utf8")).toBe(
			`${JSON.stringify(parseHtml(document("CloudKassir", 2), `${server.url}kassir`), null, 2)}\n`,
		);
		expect((await run("sync")).exitCode).toBe(100);
		expect(existsSync(report)).toBe(false);
	} finally {
		server.stop(true);
		await rm(directory, { recursive: true, force: true });
	}
}, 20_000);
