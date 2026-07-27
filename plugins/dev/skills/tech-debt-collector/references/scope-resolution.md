# Scope Resolution

Classification order for the SCOPE argument, the PR-reference forms, the
cross-repository guard, and the canonical scope form. Load during scoping.

### 1.1 Validate Scope and Resolve Target

Classify the `SCOPE` argument in this exact order — explicit project, PR reference, filesystem path, verified git ref — and fail closed on anything else. A token that is both a path and a branch resolves as a path; use `pull/<N>/diff` or a path-free branch name to disambiguate. PR references accept the short forms (`pull/<N>/diff`, `PR #<N>`), a full GitHub PR URL, and that URL's bare path form (without scheme/host, e.g. `owner/repo/pull/<N>`) — all four resolve to the same bare `TARGET` PR number; scouts resolve the diff via the GitHub CLI (`gh`), which must be available and authenticated. URL forms carry a repository slug: it MUST match the current repository, otherwise the same-numbered PR in the current repository would be silently analyzed instead.

```bash
SCOPE_TYPE=""
TARGET=""
SCOPE_REPO=""

if [ -z "$SCOPE" ] || [ "$SCOPE" = "project" ]; then
  SCOPE_TYPE="project"
  TARGET="{codeRoot}"
elif [[ "$SCOPE" =~ ^pull/([0-9]+)/diff$ ]] || \
     [[ "$SCOPE" =~ ^PR[[:space:]]?#?([0-9]+)$ ]]; then
  SCOPE_TYPE="pr-diff"
  TARGET="${BASH_REMATCH[1]}"   # bare PR number, e.g. 433
elif [[ "$SCOPE" =~ ^https://github\.com/([^/[:space:]]+/[^/[:space:]]+)/pull/([0-9]+)/?$ ]] || \
     [[ "$SCOPE" =~ ^([^/[:space:]]+/[^/[:space:]]+)/pull/([0-9]+)/?$ ]]; then
  SCOPE_TYPE="pr-diff"
  SCOPE_REPO="${BASH_REMATCH[1]}"  # owner/repo slug carried by the URL forms
  TARGET="${BASH_REMATCH[2]}"      # bare PR number, e.g. 433
elif [ -e "$SCOPE" ]; then
  SCOPE_TYPE="file"
  TARGET="$SCOPE"
elif git rev-parse --verify --quiet "$SCOPE^{commit}" >/dev/null 2>&1; then
  SCOPE_TYPE="branch"
  TARGET="$SCOPE"
else
  echo "ERROR: SCOPE '$SCOPE' is not 'project', an existing path, a resolvable git branch/ref, or a PR reference. Use the canonical form 'PR #<N>' (pull/<N>/diff, a full GitHub PR URL, and its bare owner/repo/pull/<N> path form are also accepted)."
fi

# URL forms name a repository — refuse a slug that is not this repository.
if [ -n "$SCOPE_REPO" ]; then
  CURRENT_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
  if [ "$SCOPE_REPO" != "$CURRENT_REPO" ]; then
    echo "ERROR: PR URL targets repository '$SCOPE_REPO', but the current project is '$CURRENT_REPO'. This workflow analyzes only the current repository — run it from a checkout of '$SCOPE_REPO' to analyze that PR."
    SCOPE_TYPE=""
  fi
fi
```

If classification fails, emit `scoping` with `{"status": "failed", "reason": "unresolvable_scope"}` and STOP. If the repository check fails, emit `scoping` with `{"status": "failed", "reason": "cross_repository_scope"}` and STOP. Never silently default an unknown target to project scope.

**Canonical Scope Form** (REQ-003): `PR #<N>` is this workflow's canonical, identity-stable PR scope form. `SCOPE` is also this workflow's declared `identity_args` value, hashed verbatim by the shared workflow-identity mechanism — so `pull/<N>/diff`, the full URL, and the bare path form still produce a different run identity than `PR #<N>` even though all four resolve to the same `TARGET`. Canonicalizing identity itself would require changing the shared identity-hashing mechanism every rp1 workflow depends on, which is disproportionate to this fix; documenting one canonical form and steering the fail-closed error message toward it keeps the change scoped to this skill. Operators who need run-identity continuity across repeated invocations against the same PR should always invoke with `PR #<N>`.
