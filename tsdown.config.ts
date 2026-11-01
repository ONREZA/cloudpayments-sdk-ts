import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		webhooks: "src/webhooks/index.ts",
		errors: "src/errors/index.ts",
		browser: "src/browser/index.ts",
	},
	format: "esm",
	platform: "neutral",
	target: "es2024",
	deps: { neverBundle: true },
	dts: true,
	sourcemap: true,
	clean: true,
	// Shared index modules need unique declaration chunk names.
	hash: true,
	treeshake: true,
	minify: false,
	publint: { strict: true },
	attw: { profile: "esm-only", level: "error" },
});
