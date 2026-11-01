import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Restore every owned artifact, including created files, if an operation fails. */
export async function withRollback<T>(paths: string[], operation: () => Promise<T>): Promise<T> {
	const backup = await mkdtemp("/var/tmp/cloudpayments-docs-");
	let keepBackup = false;
	const originals = paths.map((path, index) => ({
		path,
		saved: join(backup, String(index)),
		exists: existsSync(path),
	}));
	try {
		for (const item of originals) {
			if (item.exists) await cp(item.path, item.saved, { recursive: true });
		}
		try {
			return await operation();
		} catch (error) {
			const restored = await Promise.allSettled(
				originals.map(async (item) => {
					await rm(item.path, { recursive: true, force: true });
					if (item.exists) {
						await mkdir(dirname(item.path), { recursive: true });
						await cp(item.saved, item.path, { recursive: true });
					}
				}),
			);
			const failures = restored.flatMap((result) =>
				result.status === "rejected" ? [result.reason] : [],
			);
			if (failures.length) {
				keepBackup = true;
				throw new AggregateError(
					[error, ...failures],
					`Docs update failed and rollback was incomplete; backup retained at ${backup}`,
					{ cause: error },
				);
			}
			throw error;
		}
	} finally {
		if (!keepBackup) await rm(backup, { recursive: true, force: true });
	}
}

export async function directorySnapshot(path: string): Promise<Map<string, Buffer>> {
	if (!existsSync(path)) return new Map();
	const names = (await readdir(path, { recursive: true, withFileTypes: true }))
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name))
		.sort();
	return new Map(
		await Promise.all(
			names.map(async (name) => [name.slice(path.length + 1), await readFile(name)] as const),
		),
	);
}

export function sameSnapshot(before: Map<string, Buffer>, after: Map<string, Buffer>): boolean {
	return (
		before.size === after.size &&
		[...before].every(([name, content]) => after.get(name)?.equals(content))
	);
}
