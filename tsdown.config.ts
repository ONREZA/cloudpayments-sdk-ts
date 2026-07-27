import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		webhooks: "src/webhooks/index.ts",
		errors: "src/errors/index.ts",
	},
	format: "esm",
	dts: true,
	sourcemap: true,
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
