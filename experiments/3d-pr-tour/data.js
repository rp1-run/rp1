// Mocked PR semantic graph.
//
// Two-layer model:
//  - CONCEPTS: semantic clusters of change. The unit of reasoning in flow mode.
//  - FILES:    individual files inside a concept. The unit shown in tree mode.
//
// Edges exist at both layers. STEPS index concepts (the tour is conceptual).
//
// Code format for each file: array of lines, each
//   { type?: "add" | "del", tokens: [[kind, text], ...] }

export const DOMAINS = {
  infra: { label: "Infra · DB", color: "#ff8bd4" },
  model: { label: "Models", color: "#9eb6ff" },
  api: { label: "Backend API", color: "#7ad0ff" },
  ui: { label: "Frontend UI", color: "#7df0a9" },
  test: { label: "Tests", color: "#ffd16a" },
};

export const PR = {
  number: 482,
  repo: "acme/billing-platform",
  title: "feat(billing): add subscription tier to users schema",
};

export const CONCEPTS = [
  {
    id: "schema-change",
    label: "Tier schema + backfill",
    domain: "infra",
    isEpicenter: true,
    summary:
      "Adds three columns to <b>users</b>, backfills existing rows so the NOT NULL constraint is safe, and indexes <code>tier</code> for downstream lookups.",
    files: ["f-users-sql", "f-backfill-sql"],
  },
  {
    id: "user-model",
    label: "User domain model",
    domain: "model",
    summary:
      "Widens the shared <b>User</b> interface with a discriminated <code>tier</code> union and adds a <code>Tier</code> alias + <code>isEnterprise</code> helper.",
    files: ["f-user-interface", "f-tier-helpers"],
  },
  {
    id: "users-api",
    label: "/users payload",
    domain: "api",
    summary:
      "The <b>GET /users</b> serialiser now exposes <code>tier</code> and <code>tierStartedAt</code> on the wire — review ACL implications.",
    files: ["f-users-route", "f-users-serializer"],
  },
  {
    id: "billing-api",
    label: "Billing tier branch",
    domain: "api",
    summary:
      "Highest-risk change: billing introduces a <b>short-circuit</b> for enterprise users and threads <code>user.tier</code> into pricing.",
    files: ["f-billing-route", "f-pricing"],
  },
  {
    id: "badge-ui",
    label: "Tier badge UI",
    domain: "ui",
    summary:
      "New tier tag in the user badge driven by a small palette helper. Confirm the colour ramp is accessible.",
    files: ["f-user-badge", "f-tier-color"],
  },
  {
    id: "billing-test",
    label: "Billing coverage",
    domain: "test",
    summary:
      "Adds a test for the enterprise skip path. Free / pro variations and tier-transition cases remain <b>uncovered</b>.",
    files: ["f-billing-test"],
  },
];

export const FILES = [
  // ── schema-change ───────────────────────────────────────────────
  {
    id: "f-users-sql",
    conceptId: "schema-change",
    label: "users.sql",
    path: "db/schema/users.sql",
    line: 24,
    treeParent: "db/schema",
    code: [
      { tokens: [["cmt", "-- db/schema/users.sql"]] },
      { tokens: [["kw", "ALTER TABLE "], ["type", "users"]] },
      { type: "add", tokens: [["", "  ADD COLUMN tier "], ["type", "TEXT NOT NULL"], ["", " DEFAULT "], ["str", "'free'"], ["", ","]] },
      { type: "add", tokens: [["", "  ADD COLUMN tier_started_at "], ["type", "TIMESTAMPTZ"], ["", ","]] },
      { type: "add", tokens: [["", "  ADD COLUMN tier_meta "], ["type", "JSONB"], ["", " DEFAULT "], ["str", "'{}'::jsonb"], ["", ";"]] },
    ],
  },
  {
    id: "f-backfill-sql",
    conceptId: "schema-change",
    label: "0042_backfill_tier.sql",
    path: "db/migrations/0042_backfill_tier.sql",
    line: 1,
    treeParent: "db/migrations",
    code: [
      { tokens: [["cmt", "-- Backfill existing rows so the NOT NULL constraint is safe."]] },
      { type: "add", tokens: [["kw", "UPDATE "], ["type", "users"], ["", " SET tier = "], ["str", "'free'"], ["", " WHERE tier IS NULL;"]] },
      { tokens: [["", ""]] },
      { tokens: [["cmt", "-- Covering index for tier-scoped queries (billing, analytics)."]] },
      { type: "add", tokens: [["kw", "CREATE INDEX "], ["fn", "users_tier_idx"], ["", " ON "], ["type", "users"], ["", " (tier);"]] },
      { type: "add", tokens: [["kw", "CREATE INDEX "], ["fn", "users_tier_started_idx"], ["", " ON "], ["type", "users"], ["", " (tier_started_at);"]] },
    ],
  },

  // ── user-model ──────────────────────────────────────────────────
  {
    id: "f-user-interface",
    conceptId: "user-model",
    label: "User.ts",
    path: "packages/models/src/User.ts",
    line: 12,
    treeParent: "packages/models/src",
    code: [
      { tokens: [["kw", "export interface "], ["type", "User"], ["", " {"]] },
      { tokens: [["", "  id: "], ["type", "string"], ["", ";"]] },
      { tokens: [["", "  email: "], ["type", "string"], ["", ";"]] },
      { tokens: [["", "  createdAt: "], ["type", "Date"], ["", ";"]] },
      { type: "add", tokens: [["", "  tier: "], ["type", '"free" | "pro" | "enterprise"'], ["", ";"]] },
      { type: "add", tokens: [["", "  tierStartedAt?: "], ["type", "Date"], ["", ";"]] },
      { type: "add", tokens: [["", "  tierMeta?: "], ["type", "Record<string, unknown>"], ["", ";"]] },
      { tokens: [["", "}"]] },
    ],
  },
  {
    id: "f-tier-helpers",
    conceptId: "user-model",
    label: "tier.ts",
    path: "packages/models/src/tier.ts",
    line: 1,
    treeParent: "packages/models/src",
    code: [
      { type: "add", tokens: [["kw", "export type "], ["type", "Tier"], ["", " = "], ["str", '"free"'], ["", " | "], ["str", '"pro"'], ["", " | "], ["str", '"enterprise"'], ["", ";"]] },
      { tokens: [["", ""]] },
      { type: "add", tokens: [["kw", "export const "], ["fn", "TIERS"], ["", ": readonly "], ["type", "Tier"], ["", "[] = ["], ["str", '"free"'], ["", ", "], ["str", '"pro"'], ["", ", "], ["str", '"enterprise"'], ["", "] as const;"]] },
      { tokens: [["", ""]] },
      { type: "add", tokens: [["kw", "export function "], ["fn", "isEnterprise"], ["", "(t: "], ["type", "Tier"], ["", ") {"]] },
      { type: "add", tokens: [["kw", "  return"], ["", " t === "], ["str", '"enterprise"'], ["", ";"]] },
      { type: "add", tokens: [["", "}"]] },
    ],
  },

  // ── users-api ───────────────────────────────────────────────────
  {
    id: "f-users-route",
    conceptId: "users-api",
    label: "route.ts",
    path: "apps/api/routes/users/route.ts",
    line: 41,
    treeParent: "apps/api/routes/users",
    code: [
      { tokens: [["kw", "export async function "], ["fn", "GET"], ["", "(req: Request) {"]] },
      { tokens: [["", "  const { id } = "], ["fn", "parseParams"], ["", "(req);"]] },
      { tokens: [["", "  const user = await "], ["fn", "db.users.findUnique"], ["", "({ where: { id } });"]] },
      { tokens: [["", "  if (!user) return "], ["fn", "notFound"], ["", "();"]] },
      { type: "del", tokens: [["", "  return Response.json({ id: user.id, email: user.email });"]] },
      { type: "add", tokens: [["", "  return Response.json("], ["fn", "serializeUser"], ["", "(user));"]] },
      { tokens: [["", "}"]] },
    ],
  },
  {
    id: "f-users-serializer",
    conceptId: "users-api",
    label: "serializer.ts",
    path: "apps/api/routes/users/serializer.ts",
    line: 8,
    treeParent: "apps/api/routes/users",
    code: [
      { tokens: [["kw", "export function "], ["fn", "serializeUser"], ["", "(user: "], ["type", "User"], ["", ") {"]] },
      { tokens: [["kw", "  return"], ["", " {"]] },
      { tokens: [["", "    id: user.id,"]] },
      { tokens: [["", "    email: user.email,"]] },
      { type: "add", tokens: [["", "    tier: user.tier,"]] },
      { type: "add", tokens: [["", "    tierStartedAt: user.tierStartedAt?.toISOString() ?? "], ["kw", "null"], ["", ","]] },
      { tokens: [["", "  };"]] },
      { tokens: [["", "}"]] },
    ],
  },

  // ── billing-api ─────────────────────────────────────────────────
  {
    id: "f-billing-route",
    conceptId: "billing-api",
    label: "route.ts",
    path: "apps/api/routes/billing/route.ts",
    line: 87,
    treeParent: "apps/api/routes/billing",
    code: [
      { tokens: [["kw", "export async function "], ["fn", "POST"], ["", "(req: Request) {"]] },
      { tokens: [["", "  const user = await "], ["fn", "loadUser"], ["", "(req);"]] },
      { type: "add", tokens: [["cmt", "  // Enterprise: billed via signed contract, skip metering."]] },
      { type: "add", tokens: [["kw", "  if "], ["", "("], ["fn", "isEnterprise"], ["", "(user.tier)) {"]] },
      { type: "add", tokens: [["kw", "    return"], ["", " "], ["fn", "skipMetering"], ["", "(user);"]] },
      { type: "add", tokens: [["", "  }"]] },
      { tokens: [["", "  const usage = await "], ["fn", "meter"], ["", "(user.id);"]] },
      { tokens: [["", "  const price = "], ["fn", "priceFor"], ["", "(usage, user.tier);"]] },
      { tokens: [["kw", "  return"], ["", " Response.json({ usage, price });"]] },
      { tokens: [["", "}"]] },
    ],
  },
  {
    id: "f-pricing",
    conceptId: "billing-api",
    label: "pricing.ts",
    path: "apps/api/billing/pricing.ts",
    line: 23,
    treeParent: "apps/api/billing",
    code: [
      { type: "del", tokens: [["kw", "export function "], ["fn", "priceFor"], ["", "(usage: "], ["type", "Usage"], ["", ") {"]] },
      { type: "add", tokens: [["kw", "export function "], ["fn", "priceFor"], ["", "(usage: "], ["type", "Usage"], ["", ", tier: "], ["type", "Tier"], ["", ") {"]] },
      { type: "add", tokens: [["kw", "  const "], ["", "rate = "], ["fn", "RATES"], ["", "[tier];"]] },
      { type: "del", tokens: [["kw", "  return"], ["", " usage.units * "], ["fn", "RATES"], ["", ".default;"]] },
      { type: "add", tokens: [["kw", "  return"], ["", " usage.units * rate;"]] },
      { tokens: [["", "}"]] },
    ],
  },

  // ── badge-ui ────────────────────────────────────────────────────
  {
    id: "f-user-badge",
    conceptId: "badge-ui",
    label: "UserBadge.tsx",
    path: "apps/web/components/UserBadge.tsx",
    line: 18,
    treeParent: "apps/web/components",
    code: [
      { tokens: [["kw", "export function "], ["fn", "UserBadge"], ["", "({ user }: { user: "], ["type", "User"], ["", " }) {"]] },
      { type: "add", tokens: [["kw", "  const "], ["", "color = "], ["fn", "tierColor"], ["", "(user.tier);"]] },
      { tokens: [["kw", "  return "], ["", "("]] },
      { tokens: [["", "    <div className="], ["str", '"badge"'], ["", " style={{ background: color }}>"]] },
      { tokens: [["", "      <Avatar src={user.avatarUrl} />"]] },
      { tokens: [["", "      <span>{user.email}</span>"]] },
      { type: "add", tokens: [["", "      <Tag tone={user.tier}>{user.tier}</Tag>"]] },
      { tokens: [["", "    </div>"]] },
      { tokens: [["", "  );"]] },
      { tokens: [["", "}"]] },
    ],
  },
  {
    id: "f-tier-color",
    conceptId: "badge-ui",
    label: "tierColor.ts",
    path: "apps/web/lib/tierColor.ts",
    line: 1,
    treeParent: "apps/web/lib",
    code: [
      { type: "add", tokens: [["kw", "import type "], ["", "{ "], ["type", "Tier"], ["", " } from "], ["str", '"@models/tier"'], ["", ";"]] },
      { tokens: [["", ""]] },
      { type: "add", tokens: [["kw", "export const "], ["fn", "tierColor"], ["", " = (t: "], ["type", "Tier"], ["", ") => ({"]] },
      { type: "add", tokens: [["", "  free: "], ["str", '"#8c95ad"'], ["", ","]] },
      { type: "add", tokens: [["", "  pro: "], ["str", '"#7ad0ff"'], ["", ","]] },
      { type: "add", tokens: [["", "  enterprise: "], ["str", '"#ffd16a"'], ["", ","]] },
      { type: "add", tokens: [["", "}[t]);"]] },
    ],
  },

  // ── billing-test ────────────────────────────────────────────────
  {
    id: "f-billing-test",
    conceptId: "billing-test",
    label: "billing.test.ts",
    path: "apps/api/routes/billing/billing.test.ts",
    line: 56,
    treeParent: "apps/api/routes/billing",
    code: [
      { tokens: [["kw", "test"], ["", "("], ["str", '"enterprise tier skips metering"'], ["", ", async () => {"]] },
      { type: "add", tokens: [["kw", "  const "], ["", "user = await "], ["fn", "makeUser"], ["", "({ tier: "], ["str", '"enterprise"'], ["", " });"]] },
      { type: "add", tokens: [["kw", "  const "], ["", "res = await "], ["fn", "POST"], ["", "("], ["fn", "reqFor"], ["", "(user));"]] },
      { type: "add", tokens: [["kw", "  const "], ["", "body = await res.json();"]] },
      { type: "add", tokens: [["fn", "  expect"], ["", "(body.metered).toBe("], ["kw", "false"], ["", ");"]] },
      { type: "add", tokens: [["fn", "  expect"], ["", "("], ["fn", "billingLedger.charges"], ["", ").toHaveLength("], ["num", "0"], ["", ");"]] },
      { tokens: [["", "});"]] },
      { tokens: [["", ""]] },
      { tokens: [["cmt", "// TODO: cover free → pro upgrade mid-cycle"]] },
    ],
  },
];

// Edges between concept clusters — drives flow-mode rendering and the tour bridge.
export const CONCEPT_EDGES = [
  { from: "schema-change", to: "user-model" },
  { from: "user-model", to: "users-api" },
  { from: "user-model", to: "billing-api" },
  { from: "user-model", to: "badge-ui" },
  { from: "users-api", to: "badge-ui" },
  { from: "billing-api", to: "billing-test" },
];

// Edges between individual files — drives tree-mode rendering. Includes both
// intra-concept (sibling) edges and cross-concept (ripple) edges.
export const FILE_EDGES = [
  // intra-concept
  { from: "f-users-sql", to: "f-backfill-sql", kind: "sibling" },
  { from: "f-user-interface", to: "f-tier-helpers", kind: "sibling" },
  { from: "f-users-route", to: "f-users-serializer", kind: "sibling" },
  { from: "f-billing-route", to: "f-pricing", kind: "sibling" },
  { from: "f-user-badge", to: "f-tier-color", kind: "sibling" },

  // cross-concept (ripple)
  { from: "f-users-sql", to: "f-user-interface", kind: "ripple" },
  { from: "f-user-interface", to: "f-users-route", kind: "ripple" },
  { from: "f-user-interface", to: "f-billing-route", kind: "ripple" },
  { from: "f-user-interface", to: "f-user-badge", kind: "ripple" },
  { from: "f-tier-helpers", to: "f-pricing", kind: "ripple" },
  { from: "f-tier-helpers", to: "f-tier-color", kind: "ripple" },
  { from: "f-users-route", to: "f-user-badge", kind: "ripple" },
  { from: "f-billing-route", to: "f-billing-test", kind: "ripple" },
];

export const STEPS = [
  {
    conceptId: "schema-change",
    title: "The Epicenter",
    sub: "Schema introduces a new tier column",
    reason:
      "The PR <b>adds three columns</b> to <b>users</b>, backfills, and indexes <code>tier</code>. Every downstream consumer of the user record must be reasoned about.",
  },
  {
    conceptId: "user-model",
    title: "Ripple → Domain Model",
    sub: "User type widened with discriminated tier",
    reason:
      "The shared <b>User</b> interface gains a literal-union <code>tier</code> field. A <code>Tier</code> alias and an <code>isEnterprise</code> helper are extracted into <code>tier.ts</code>.",
  },
  {
    conceptId: "users-api",
    title: "Ripple → /users endpoint",
    sub: "Response payload now carries tier",
    reason:
      "The <b>GET /users</b> handler delegates to a serializer that now leaks <code>tier</code> on the wire. Verify ACL: should free-tier users see other users' tiers?",
  },
  {
    conceptId: "billing-api",
    title: "Ripple → /billing logic",
    sub: "Branch on tier == enterprise",
    reason:
      "Billing introduces a <b>short-circuit</b> for enterprise users and threads <code>user.tier</code> into pricing. This is the highest-risk change in the PR.",
  },
  {
    conceptId: "badge-ui",
    title: "Ripple → UI badge",
    sub: "Visual surface for tier",
    reason:
      "Users will now see a tier tag in the header, driven by a small colour palette helper. Confirm the palette is accessible for colour-blind users.",
  },
  {
    conceptId: "billing-test",
    title: "Coverage Check",
    sub: "New test asserts skip behaviour",
    reason:
      "A test was added for the enterprise branch only. Free / pro variations and tier-transition cases are <b>uncovered</b>.",
  },
];

// Helpers used by app.js
export const CONCEPT_BY_ID = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));
export const FILE_BY_ID = Object.fromEntries(FILES.map((f) => [f.id, f]));
