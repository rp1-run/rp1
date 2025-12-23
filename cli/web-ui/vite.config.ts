import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
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
		port: 5173,
		strictPort: false,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:7710",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://127.0.0.1:7710",
				ws: true,
			},
		},
	},
});
