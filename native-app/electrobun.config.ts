import type { ElectrobunConfig } from "electrobun";

const BRAND_NATIVE_ICON_ROOT = "../assets/brand/native";

export default {
	app: {
		name: "rp1 Arcade",
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
			"../bin/rp1": "../../MacOS/rp1",
			"src/views/launch/index.html": "views/launch/index.html",
		},
		mac: {
			bundleCEF: false,
			defaultRenderer: "native",
			icons: `${BRAND_NATIVE_ICON_ROOT}/icon.iconset`,
		},
		win: {
			icon: `${BRAND_NATIVE_ICON_ROOT}/icon.ico`,
		},
		linux: {
			icon: `${BRAND_NATIVE_ICON_ROOT}/icon.png`,
		},
		watch: ["src/views"],
	},
} satisfies ElectrobunConfig;
