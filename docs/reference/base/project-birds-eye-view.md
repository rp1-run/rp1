# project-birds-eye-view

Generates comprehensive project overview documents with architecture diagrams for new developer onboarding.

---

## Synopsis

=== "Claude Code"

    ```bash
    /project-birds-eye-view
    ```

=== "OpenCode"

    ```bash
    /rp1-base/project-birds-eye-view
    ```

## Description

The `project-birds-eye-view` command creates a comprehensive overview document of your project, suitable for onboarding new team members or providing executive summaries. It leverages the knowledge base and explores the codebase to produce documentation with validated Mermaid diagrams.

The command produces documentation covering:

- **Summary**: High-level project description and purpose
- **System Context**: External integrations and boundaries
- **Architecture**: Layers, patterns, and key decisions
- **Modules**: Component breakdown and responsibilities
- **Data Model**: Key entities and relationships
- **Workflows**: Critical business processes
- **APIs**: External and internal interfaces

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `RP1_ROOT` | `.rp1/` | Root directory for output |

## Output

The command generates a comprehensive markdown document:

**Location:** `.rp1/work/project-overview.md`

**Contents:**

- Project summary with key metrics
- System context diagram (Mermaid)
- Architecture diagram (Mermaid)
- Module breakdown with dependencies
- Data model diagram (if applicable)
- Key workflow diagrams
- API overview

## Examples

### Generate Overview

=== "Claude Code"

    ```bash
    /project-birds-eye-view
    ```

=== "OpenCode"

    ```bash
    /rp1-base/project-birds-eye-view
    ```

**Expected output:**
```
✅ Project Overview Generated

Summary:
- Project: Acme Store
- Type: E-commerce Platform
- Tech Stack: TypeScript, PostgreSQL, Redis

Output: $RP1_ROOT/work/project-overview.md

Sections Generated:
- Summary ✓
- System Context ✓
- Architecture (with diagram) ✓
- Modules ✓
- Data Model ✓
- Workflows ✓
- APIs ✓
```

### Example Diagrams

??? example "System Context"
    Shows the project's external boundaries and integrations:

    ```mermaid
    flowchart TB
        subgraph "External Systems"
            STRIPE[Stripe API]
            EMAIL[SendGrid]
            S3[AWS S3]
        end

        subgraph "Acme Store"
            API[API Gateway]
            CART[Cart Service]
            ORDERS[Order Service]
        end

        subgraph "Users"
            CUST[Customer]
            ADMIN[Admin]
        end

        CUST --> API
        ADMIN --> API
        API --> CART
        API --> ORDERS
        ORDERS --> STRIPE
        ORDERS --> EMAIL
        CART --> S3
    ```

??? example "Architecture Layers"
    Shows the system's layered architecture:

    ```mermaid
    flowchart TB
        subgraph "Presentation Layer"
            WEB[Web App]
            MOBILE[Mobile App]
        end

        subgraph "Application Layer"
            AUTH[Auth Service]
            CATALOG[Catalog Service]
            CHECKOUT[Checkout Service]
        end

        subgraph "Data Layer"
            PG[(PostgreSQL)]
            REDIS[(Redis Cache)]
            ES[(Elasticsearch)]
        end

        WEB --> AUTH
        MOBILE --> AUTH
        AUTH --> CATALOG
        AUTH --> CHECKOUT
        CATALOG --> PG
        CATALOG --> ES
        CHECKOUT --> PG
        CHECKOUT --> REDIS
    ```

??? example "Module Dependencies"
    Shows how modules depend on each other:

    ```mermaid
    flowchart LR
        subgraph "Core"
            AUTH[auth]
            CONFIG[config]
            LOGGER[logger]
        end

        subgraph "Features"
            CART[cart]
            PRODUCTS[products]
            ORDERS[orders]
        end

        CART --> AUTH
        PRODUCTS --> AUTH
        ORDERS --> AUTH
        ORDERS --> CART
        ORDERS --> PRODUCTS
        AUTH --> CONFIG
        AUTH --> LOGGER
    ```

??? example "Order Workflow"
    Shows a critical business process:

    ```mermaid
    flowchart LR
        BROWSE[Browse] --> ADD[Add to Cart]
        ADD --> REVIEW[Review Cart]
        REVIEW --> PAY[Payment]
        PAY -->|Success| CONFIRM[Confirmation]
        PAY -->|Failure| RETRY[Retry]
        RETRY --> PAY
        CONFIRM --> SHIP[Shipping]
    ```

## Diagram Validation

All Mermaid diagrams are validated before being included. If a diagram fails validation, the command:

1. Logs a warning
2. Uses a simplified fallback diagram
3. Marks the section for manual review

## Requirements

!!! warning "Prerequisite"
    The knowledge base must exist before running this command. Run [`knowledge-build`](knowledge-build.md) first.

## Related Commands

- [`knowledge-build`](knowledge-build.md) - Generate the knowledge base
- [`write-content`](write-content.md) - Create other documentation

## See Also

- [Knowledge-Aware Agents](../../concepts/knowledge-aware-agents.md) - How the KB enables this command
