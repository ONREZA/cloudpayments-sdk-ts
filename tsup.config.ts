import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		webhooks: "src/webhooks/index.ts",
		errors: "src/errors/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true,
	splitting: false,
	treeshake: true,
	target: "es2022",
});
