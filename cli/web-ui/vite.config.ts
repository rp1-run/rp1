import { execSync } from "node:child_process";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "./package.json";

const getGitCommit = (): string => {
	try {
		return execSync("git rev-parse --short HEAD", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "Unknown";
	}
};

export default defineConfig({
	plugins: [react()],
	define: {
		__RP1_WEB_UI_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
		__RP1_WEB_UI_GIT_COMMIT__: JSON.stringify(getGitCommit()),
		__RP1_WEB_UI_VERSION__: JSON.stringify(pkg.version),
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "dist/client",
		emptyOutDir: true,
	},
	server: {
		port: 6810,
		strictPort: false,
		hmr: {
			port: 6810,
		},
		proxy: {
			"/api": {
				target: "http://127.0.0.1:6710",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://127.0.0.1:6710",
				ws: true,
			},
		},
	},
});
