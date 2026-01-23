/**
 * Main entry point for the rp1 eval test project.
 */

import { greet } from "./utils";

const name = process.argv[2] ?? "World";
console.log(greet(name));
