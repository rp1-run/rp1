# Markdown Preview Examples

This file demonstrates practical input/output examples for the markdown-preview skill.

## Example 1: Simple Documentation

**Scenario**: Preview a basic README file with headings, lists, and code blocks.

**Input Markdown**:
```markdown
# Project Documentation

This is a sample project that demonstrates various features.

## Features

- Fast performance
- Easy to use
- Well documented

## Installation

Install via npm:

\`\`\`bash
npm install my-package
\`\`\`

## Usage

Here's a simple example:

\`\`\`javascript
const pkg = require('my-package');
pkg.doSomething();
\`\`\`

## License

MIT License - see LICENSE file for details.
```

**Output Result**:
- HTML file created in temp directory
- Browser opens automatically
- Content rendered with:
  - Styled headings with bottom borders
  - Bulleted lists with proper spacing
  - Code blocks with syntax highlighting (bash, JavaScript)
  - Professional GitHub-style appearance

**Skill Invocation**:
```
Use Skill tool with skill: "rp1-base:markdown-preview"
Parameters:
  - content: [markdown above]
  - title: "Project Documentation"
```

---

## Example 2: Technical Report with Mermaid Diagram

**Scenario**: Generate a technical report containing architecture diagrams.

**Input Markdown**:
```markdown
# System Architecture Report

## Overview

Our system uses a microservices architecture with the following components:

\`\`\`mermaid
graph TD
    Client[Web Client] --> API[API Gateway]
    API --> Auth[Auth Service]
    API --> Users[User Service]
    API --> Orders[Order Service]

    Users --> DB1[(Users DB)]
    Orders --> DB2[(Orders DB)]
    Auth --> DB3[(Auth DB)]
\`\`\`

## Component Descriptions

### API Gateway
The API Gateway handles all incoming requests and routes them to appropriate services.

### Services
Each microservice is independently deployable and has its own database.

## Technology Stack

| Component | Technology |
|-----------|------------|
| API Gateway | Node.js + Express |
| Auth Service | Python + FastAPI |
| User Service | Go |
| Order Service | Java Spring Boot |
| Databases | PostgreSQL |

## Next Steps

1. Implement rate limiting
2. Add monitoring with Prometheus
3. Deploy to Kubernetes
```

**Output Result**:
- Mermaid diagram validated automatically (using rp1-base:mermaid skill)
- If diagram has syntax errors, skill auto-fixes up to 3 attempts
- Diagram rendered as interactive SVG in browser
- Table formatted with alternating row colors
- All content styled professionally

**Validation Flow**:
1. Write entire markdown (with all diagrams) to temp file
2. Run `rp1 agent-tools mmd-validate` once on the markdown file
3. If validation passes: proceed with HTML generation
4. If validation fails: prepend warning, continue generation (non-blocking)
5. Mermaid.js renders diagrams in browser (shows errors if invalid)
6. User sees syntax errors directly in preview

---

## Example 3: Multiple Diagrams with Code

**Scenario**: Preview a design document with sequence diagram and code examples.

**Input Markdown**:
```markdown
# Authentication Flow Design

## User Login Sequence

\`\`\`mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant AuthService
    participant Database

    User->>Frontend: Enter credentials
    Frontend->>API: POST /login
    API->>AuthService: Validate credentials
    AuthService->>Database: Query user
    Database-->>AuthService: User data
    AuthService-->>API: JWT token
    API-->>Frontend: Token + user info
    Frontend-->>User: Redirect to dashboard
\`\`\`

## Token Generation Code

\`\`\`python
import jwt
from datetime import datetime, timedelta

def generate_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=24),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')
\`\`\`

## State Management

\`\`\`mermaid
stateDiagram-v2
    [*] --> Unauthenticated
    Unauthenticated --> Authenticating: Login attempt
    Authenticating --> Authenticated: Success
    Authenticating --> Unauthenticated: Failure
    Authenticated --> Unauthenticated: Logout
    Authenticated --> [*]
\`\`\`

## Error Handling

\`\`\`typescript
interface AuthError {
  code: string;
  message: string;
  timestamp: Date;
}

async function handleAuthError(error: AuthError): Promise<void> {
  console.error(`[${error.code}] ${error.message}`);

  if (error.code === 'TOKEN_EXPIRED') {
    await refreshToken();
  } else if (error.code === 'INVALID_CREDENTIALS') {
    redirectToLogin();
  }
}
\`\`\`
```

**Output Result**:
- Two Mermaid diagrams rendered (sequence + state)
- Both diagrams validated together in single pass
- Code blocks with language-specific syntax highlighting:
  - Python (with keyword colors)
  - TypeScript (with type annotations highlighted)
- Clean separation between sections
- Professional layout

**Validation**:
- All diagrams validated in one pass (~2-3 seconds total)
- If valid: HTML generated immediately
- If invalid: Warning shown, diagrams still render with error display

---

## Example 4: Plain Text Conversion

**Scenario**: Convert plain text notes into formatted HTML.

**Input Content** (plain text, no markdown):
```
System Maintenance Notes

Database backup completed successfully at 2025-11-08 14:30 UTC
- Backup size: 2.3 GB
- Duration: 45 minutes
- Location: s3://backups/prod/2025-11-08/

Issues encountered:
1. Temporary connection timeout at 14:35
2. Resolved automatically after retry

Next maintenance window: 2025-11-15
```

**Output Result**:
- Plain text rendered as paragraphs
- Line breaks preserved
- Basic formatting applied
- No special markdown processing
- Still uses professional styling

**Use Case**: Quick notes, logs, or simple text files that need browser preview.

---

## Example 5: Error Handling - Invalid Mermaid

**Scenario**: Preview document with broken Mermaid diagram that cannot be auto-fixed.

**Input Markdown**:
```markdown
# Network Diagram

\`\`\`mermaid
graph TD
    A[Server] --> B[Client
    C[Database] --> A
    INVALID SYNTAX HERE
    D --> E
\`\`\`

The diagram above shows our network topology.
```

**Validation Result**:
- Script validation fails (exit code 1)
- Warning prepended to document:
  ```
  ⚠️ Mermaid Validation Warning: Some diagrams have syntax errors.
  They may not render correctly in the preview.
  ```

**Output Result**:
- HTML generated successfully (non-blocking)
- Document opens in browser
- Invalid diagram shows Mermaid.js error in place:
  ```
  Syntax error in graph
  Expecting 'SEMI', 'NEWLINE', 'EOF', got 'INVALID'
  ```
- User sees exact syntax errors
- Rest of document renders normally
- User can fix diagram in source and regenerate

**Skill Response**:
```json
{
  "status": "success",
  "filePath": "/tmp/markdown-preview-1699464000.html",
  "message": "Preview generated with warnings. Some diagrams invalid.",
  "diagramsValidated": false,
  "browserOpened": true
}
```

---

## Example 6: PR Visualization Integration

**Scenario**: PR Visualizer agent generates markdown report with diagrams.

**Agent Context**:
```markdown
The PR Visualizer agent has generated pr-visual.md containing:
- Change summary
- Multiple Mermaid diagrams showing architectural changes
- Code diff highlights
```

**Agent Code** (from pr-visualizer agent):
```markdown
## Final Step: Generate HTML Preview

Use Skill tool with skill: "rp1-base:markdown-preview"

Read the generated markdown:
- Read {RP1_ROOT}/work/pr_reviews/pr-{PR_NUMBER}-visual.md

Pass to skill:
  - content: [markdown content read from file]
  - title: "PR #{PR_NUMBER} Visualization"

The skill will:
1. Write markdown to temp file
2. Validate ALL diagrams in one pass (rp1 agent-tools mmd-validate)
3. Generate self-contained HTML
4. Open in browser automatically
5. Return file path

Log to user:
"✓ Visual report generated: {filePath}"
```

**Workflow**:
1. PR Visualizer creates markdown file
2. Calls markdown-preview skill
3. Skill validates all diagrams together (~2-3 seconds for 4 diagrams)
4. HTML generated with all diagrams rendered
5. Browser opens showing visual PR review
6. User sees architectural impact of changes

**Performance** (typical PR with 4 diagrams):
- Write markdown to temp: ~0.1 seconds
- Diagram validation (all 4): ~2-3 seconds (single pass)
- HTML generation: ~0.5 seconds
- File write: ~0.1 seconds
- Browser open: ~1 second
- **Total**: ~4-5 seconds

---

## Example 7: Documentation with Tables and Blockquotes

**Scenario**: Technical specification with complex formatting.

**Input Markdown**:
```markdown
# API Specification

## Authentication Endpoint

> **Important**: All API requests require authentication except public endpoints.

### POST /auth/login

**Request Body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User email address |
| password | string | Yes | User password (min 8 chars) |
| remember | boolean | No | Extended session duration |

**Response** (200 OK):

\`\`\`json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "expiresAt": "2025-11-09T14:30:00Z"
}
\`\`\`

**Error Responses**:

| Status | Code | Description |
|--------|------|-------------|
| 401 | INVALID_CREDENTIALS | Email or password incorrect |
| 429 | RATE_LIMIT_EXCEEDED | Too many login attempts |
| 500 | INTERNAL_ERROR | Server error |

> **Note**: Rate limiting applies 5 failed attempts per IP per hour.
```

**Output Result**:
- Table with alternating row colors
- Styled blockquotes with left border
- JSON syntax highlighting
- Proper header hierarchy
- Professional typography

---

## Common Use Cases Summary

| Use Case | Input Type | Key Features Used |
|----------|------------|-------------------|
| README Preview | Markdown | Headings, lists, code blocks |
| Technical Report | Markdown + Diagrams | Mermaid validation, tables |
| Design Document | Complex diagrams | Multiple diagrams, sequences |
| Plain Notes | Text | Paragraph formatting |
| PR Visualization | Generated markdown | Agent integration, auto-open |
| API Docs | Tables + code | Complex formatting, JSON |

## Performance Benchmarks

**Typical Content Sizes**:
- Small (< 1KB): ~1 second total
- Medium (1-10KB): ~3 seconds total
- Large (10-50KB): ~5 seconds total
- With diagrams: +1 second per diagram

**Bottlenecks**:
- Mermaid validation: ~2-3s total (all diagrams in one pass)
- Browser launch: ~1-2s (platform dependent)
- File I/O: negligible (<100ms)

**Optimization**:
- Single-pass validation eliminates per-diagram overhead
- Constant-time validation regardless of diagram count

## Tips for Best Results

**Markdown Authoring**:
- Use GitHub-flavored markdown
- Specify language for code blocks (```python, ```bash, etc.)
- Keep Mermaid diagrams simple for faster rendering
- Test diagrams separately if complex

**Diagram Best Practices**:
- Limit to 10-15 nodes per diagram
- Use consistent naming
- Avoid deeply nested structures
- All diagrams validated together, so no need to test individually

**Performance Optimization**:
- Single validation pass is efficient for documents with many diagrams
- Diagrams with 20+ nodes may slow browser rendering (not validation)
- Complex tables render faster than equivalent diagrams
- Validation time is constant (~2-3s) regardless of diagram count
