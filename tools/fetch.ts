#!/usr/bin/env bun
import { withRollback } from "./artifacts.js";
import { DOCS_SOURCES } from "./docs-sources.js";
import { fetchDocs, saveRaw } from "./scrape.js";

const sources = Object.values(DOCS_SOURCES);
const fetched = await Promise.all(
	sources.map(async (source) => ({ source, html: await fetchDocs(source) })),
);
await withRollback(
	sources.flatMap((source) => [source.rawPath, source.previousRawPath]),
	async () => {
		for (const { source, html } of fetched) await saveRaw(source, html);
	},
);
