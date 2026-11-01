#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { directorySnapshot, sameSnapshot, withRollback } from "./artifacts.js";

const root = resolve(import.meta.dir, "..");
const generatedDir = resolve(root, "src", "_generated");

await withRollback([generatedDir], async () => {
	const before = await directorySnapshot(generatedDir);
	await new Promise<void>((ok, fail) => {
		const child = spawn(process.execPath, ["tools/gen.ts"], {
			cwd: root,
			stdio: "inherit",
		});
		child.on("error", fail);
		child.on("close", (code) =>
			code === 0 ? ok() : fail(new Error(`Generator exited with ${code}`)),
		);
	});
	const after = await directorySnapshot(generatedDir);
	if (!sameSnapshot(before, after)) throw new Error("Generated files were stale; run bun run gen");
});
