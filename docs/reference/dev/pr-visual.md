# pr-visual

See what your PR changes at a glance with auto-generated architecture and flow diagrams.

---

## Synopsis

=== "Claude Code"

    ```bash
    /pr-visual [pr-branch] [base-branch] [review-depth] [focus-areas]
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-visual [pr-branch] [base-branch] [review-depth] [focus-areas]
    ```

## Description

The `pr-visual` command generates Mermaid diagrams from PR diffs to help understand code changes visually. It creates architecture diagrams, flow charts, and dependency graphs showing what changed and how components interact.

## Parameters

| Parameter | Position | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `PR_BRANCH` | `$1` | No | Current branch | Branch to visualize |
| `BASE_BRANCH` | `$2` | No | `main` | Base branch for comparison |
| `REVIEW_DEPTH` | `$3` | No | `standard` | Level of detail |
| `FOCUS_AREAS` | `$4` | No | All | Specific areas to focus on |

## Diagram Types

| Type | Shows |
|------|-------|
| **Architecture** | Component relationships, new/modified modules |
| **Flow** | Control flow through changed code paths |
| **Dependency** | Import/dependency changes |
| **Data Flow** | Data transformations and state changes |

## Examples

### Visualize Current Branch

=== "Claude Code"

    ```bash
    /pr-visual
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-visual
    ```

### Visualize Specific PR

=== "Claude Code"

    ```bash
    /pr-visual feature/auth main
    ```

=== "OpenCode"

    ```bash
    /rp1-dev/pr-visual feature/auth main
    ```

**Example output:**
```
✅ PR Visualization Complete

Diagrams Generated:
1. Architecture Overview (12 components)
2. Auth Flow Changes (3 new paths)
3. Dependency Graph (2 new imports)

Output: $RP1_ROOT/work/pr-reviews/feature-auth-visual-001.md
```

### Example Diagrams

??? example "Architecture Overview"
    Shows how new and modified components fit into the existing system:

    ```mermaid
    flowchart TB
        subgraph "Existing Components"
            API[API Layer]
            DB[(Database)]
            UI[Frontend]
        end

        subgraph "New/Modified (this PR)"
            AUTH[Auth Service]:::new
            MW[Auth Middleware]:::new
            SESS[Session Store]:::modified
        end

        UI --> API
        API --> MW
        MW --> AUTH
        AUTH --> SESS
        AUTH --> DB

        classDef new fill:#2e7d32,color:#fff
        classDef modified fill:#f57c00,color:#fff
    ```

??? example "Auth Flow Changes"
    Visualizes the control flow through changed code paths:

    ```mermaid
    sequenceDiagram
        participant U as User
        participant UI as Frontend
        participant MW as Middleware
        participant AUTH as Auth Service
        participant DB as Database

        U->>UI: Login request
        UI->>MW: POST /api/login
        MW->>AUTH: validateCredentials()
        AUTH->>DB: Query user
        DB-->>AUTH: User record
        AUTH-->>MW: JWT token
        MW-->>UI: Set cookie + redirect
        UI-->>U: Dashboard
    ```

??? example "Dependency Graph"
    Shows import and dependency changes:

    ```mermaid
    flowchart LR
        subgraph "New Dependencies"
            JWT[jsonwebtoken]:::new
            BCRYPT[bcrypt]:::new
        end

        subgraph "Modified Files"
            AUTH[auth.service.ts]:::modified
            MW[middleware.ts]:::modified
            CFG[config.ts]:::modified
        end

        AUTH --> JWT
        AUTH --> BCRYPT
        MW --> AUTH
        CFG --> AUTH

        classDef new fill:#2e7d32,color:#fff
        classDef modified fill:#f57c00,color:#fff
    ```

??? example "Data Flow"
    Tracks data transformations through the system:

    ```mermaid
    flowchart LR
        REQ[Request Body]:::input
        VAL[Validated Input]
        HASH[Hashed Password]
        TOKEN[JWT Token]
        RESP[Response]:::output

        REQ -->|validate| VAL
        VAL -->|bcrypt| HASH
        HASH -->|compare| DB[(Database)]
        DB -->|user data| TOKEN
        TOKEN -->|sign| RESP

        classDef input fill:#1565c0,color:#fff
        classDef output fill:#2e7d32,color:#fff
    ```

## Output

**Location:** `$RP1_ROOT/work/pr-reviews/<review-id>-visual-<NNN>.md`

Contains validated Mermaid diagrams ready for rendering.

## Related Commands

- [`pr-review`](pr-review.md) - Full PR review
- [`project-birds-eye-view`](../base/project-birds-eye-view.md) - Project-wide diagrams
