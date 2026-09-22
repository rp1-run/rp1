#!/usr/bin/env bun
// Strip internal Artifactory hosts from tracked lockfiles.
//
// Installing on a corporate network has to go through Artifactory, because
// registry.npmjs.org is blocked there. Bun then records the
// absolute Artifactory tarball URL for every resolved package, which makes the
// committed lockfile unusable for anyone outside the corporate network.
//
// Bun omits the URL entirely when it resolved from its default registry, so an
// empty string is the public-repo form -- the same shape upstream Bun and other
// public repos commit. npm always records `resolved` absolutely, but rewriting
// the host to npmjs is safe because npm's `replace-registry-host` default maps
// it back to the configured registry at install time.
//
// Integrity hashes are never touched, so a tarball that does not match still
// fails the install rather than being silently accepted.
//
//   bun scripts/normalize-lockfiles.ts           rewrite in place
//   bun scripts/normalize-lockfiles.ts --check   report and exit 1, changing nothing

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const INTERNAL =
  /https:\/\/(?:[^/\s"]*\.)?(?:block-artifacts\.com|artifactory\.global\.square|sqprod\.co)\/[^\s"]*?\/npm\/[^/\s"]+\//;
const PUBLIC_REGISTRY = "https://registry.npmjs.org/";
const LOCKFILES = ["bun.lock", "package-lock.json", "pnpm-lock.yaml"];

const check = process.argv.includes("--check");

/** Tracked lockfiles anywhere in the repo, so nested projects are covered. */
function trackedLockfiles(): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", ...LOCKFILES.map((name) => `*${name}`)],
    { encoding: "utf8" },
  );
  return output.split("\0").filter((path: string) => path.length > 0);
}

/** Bun records "" when it resolved from its default registry. */
function normalizeBunLock(contents: string): string {
  return contents.replace(new RegExp(`"${INTERNAL.source}[^"]*"`, "g"), '""');
}

/** npm maps registry.npmjs.org back to the configured registry on install. */
function normalizeNpmLock(contents: string): string {
  return contents.replace(/"resolved": "([^"]+)"/g, (match, url: string) =>
    INTERNAL.test(url)
      ? `"resolved": "${url.replace(INTERNAL, PUBLIC_REGISTRY)}"`
      : match,
  );
}

/** pnpm derives the URL from the registry when the `tarball` field is absent. */
function normalizePnpmLock(contents: string): string {
  return contents.replace(
    new RegExp(`,\\s*tarball: ${INTERNAL.source}[^\\s}]*`, "g"),
    "",
  );
}

function normalizerFor(path: string): (contents: string) => string {
  if (path.endsWith("bun.lock")) return normalizeBunLock;
  if (path.endsWith("pnpm-lock.yaml")) return normalizePnpmLock;
  return normalizeNpmLock;
}

const dirty: string[] = [];

for (const path of trackedLockfiles()) {
  const before = readFileSync(path, "utf8");
  const after = normalizerFor(path)(before);
  if (after === before) continue;

  dirty.push(path);
  if (!check) writeFileSync(path, after);
}

if (dirty.length === 0) {
  console.log("Lockfiles contain no internal Artifactory references.");
  process.exit(0);
}

if (check) {
  console.error("Internal Artifactory references found in tracked lockfiles:");
  for (const path of dirty) console.error(`  ${path}`);
  console.error("\nFix: bun scripts/normalize-lockfiles.ts");
  process.exit(1);
}

for (const path of dirty) console.log(`normalized ${path}`);
