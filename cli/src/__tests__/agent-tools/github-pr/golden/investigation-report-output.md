<!-- rp1-artifact: 9f27673c-7480-4770-8aaa-c390669cffb9 -->
## 📋 rp1 Artifact: Investigation Report — node-20-upgrade

| Field | Value |
|-------|-------|
| Producer | `bug-investigator` |
| Artifact type | `investigation-report` |
| Issue ID | `node-20-upgrade` |
| Status | `complete` |
| Generated | 2026-05-12 |
| Doc ID | `9f27673c-7480-4770-8aaa-c390669cffb9` |
| Source path | `examples/investigation-report-input.md` (gitignored, local to author) |

### Executive Summary

The pdf-service repo is currently pinned to Node 16.14.0 across `.nvmrc`, two Dockerfiles, two `package.json` `engines` fields, and one Babel target. Node 16 went EOL in September 2023; Node 18 EOL was April 2025; only Node 20 (Active LTS until Apr 2026) and Node 22 are currently in support.

**The single biggest risk is `node-java` (currently pinned at `^0.12.1`).** This is a native module that builds from source via node-gyp/nan; the installed `nan@2.14.1` does not compile on Node 20.x. Upstream fixed this in `java@0.14.0`.

**Recommended sequence**: three checkpoints — (A) bump `java` to 0.15.x on Node 16 first; (B) move to Node 18.20-alpine; (C) move to Node 20.x. Effort estimate: 3–7 focused sessions assuming no exotic surprises.

<details>
<summary><strong>Full artifact</strong> (click to expand)</summary>

## 2. Investigation Process

### Sources consulted

- GitHub issue #499 (full body + 4 comments)
- Codebase audit — all Node-version pinpoints read directly
- npm registry — `npm view <pkg> engines` for ~12 packages

### Hypotheses tested

| # | Hypothesis | Verdict |
|---|-----------|---------|
| H1 | `node-java` at the pinned version cannot compile against Node 20's V8 headers. | **Confirmed** |
| H2 | OpenSSL 3 (Node 17+) breaks signing or some MD5/SHA1 path in JS. | **Mostly rejected** |
| H3 | The hard-coded image-hash health checks will drift after the upgrade. | **Likely, low certainty** |

## 3. Recommended Sequence

1. **PR A**: `java` bump on Node 16 (isolate native build risk)
2. **PR B**: Node 18.20-alpine (toolchain churn — alpine 3.20, python3, libvips)
3. **PR C**: Node 20.x (last hop, easiest if A and B are clean)

</details>

---
<sub>🤖 Posted by `publish-artifact`. Re-run the skill to update this comment in place. Local artifact is gitignored and may be edited by `rp1` agents.</sub>
