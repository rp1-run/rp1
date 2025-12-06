#!/usr/bin/env node
/**
 * Postinstall script that sets the appropriate shebang based on the installing package manager.
 * - If installed with bun: uses #!/usr/bin/env bun
 * - If installed with npm/yarn/pnpm: uses #!/usr/bin/env node
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = join(__dirname, "..", "dist", "main.js");

// Detect if we're being installed by bun
// npm_execpath contains the path to the package manager executable
const execPath = process.env.npm_execpath || "";
const isBunInstall = execPath.includes("bun");

const shebang = isBunInstall ? "#!/usr/bin/env bun" : "#!/usr/bin/env node";

try {
  const content = readFileSync(mainPath, "utf8");
  const newContent = content.replace(/^#!.*\n/, shebang + "\n");
  writeFileSync(mainPath, newContent);

  if (process.env.npm_config_loglevel !== "silent") {
    console.log(`rp1: Configured for ${isBunInstall ? "Bun" : "Node.js"} runtime`);
  }
} catch (error) {
  // Don't fail installation if this doesn't work
  console.warn("rp1: Could not configure runtime shebang:", error.message);
}
