import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "RP1 Arcade",
		identifier: "run.rp1.arcade",
		version: "0.1.0",
	},
	runtime: {
		exitOnLastWindowClosed: true,
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		copy: {
			"src/views/launch/index.html": "views/launch/index.html",
		},
		mac: {
			bundleCEF: false,
			defaultRenderer: "native",
		},
		watch: ["src/views"],
	},
} satisfies ElectrobunConfig;
