#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const generatedDir = resolve(root, "src", "_generated");

async function snapshot(): Promise<Map<string, Buffer>> {
	const files = await readdir(generatedDir);
	return new Map(
		await Promise.all(
			files
				.sort()
				.map(async (file) => [file, await readFile(resolve(generatedDir, file))] as const),
		),
	);
}

async function generate(): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		const child = spawn("bun", ["tools/gen.ts"], { cwd: root, stdio: "inherit" });
		child.on("exit", (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(`generator exited with ${code}`));
		});
	});
}

const before = await snapshot();
await generate();
const after = await snapshot();
const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
	(file) => !before.get(file)?.equals(after.get(file) ?? Buffer.alloc(0)),
);

if (changed.length > 0) {
	console.error(`Generated files were stale: ${changed.join(", ")}`);
	process.exit(1);
}
