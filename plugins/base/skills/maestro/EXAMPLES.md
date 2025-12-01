# Skill Examples

This file contains annotated examples of well-designed skills at different complexity levels. Use these as reference when building new skills.

---

## Example 1: Simple Utility Skill

**Complexity**: Simple (single file, direct instructions)
**Pattern**: Text transformation utility

### commit-message-writer/SKILL.md

```markdown
---
name: commit-message-writer
description: Writes clear, conventional commit messages following best practices. Analyzes staged changes and generates concise messages focusing on the 'why' rather than 'what'. Use when creating git commits or when user mentions 'commit', 'commit message', 'git commit'.
---

# Commit Message Writer

Helps write clear, conventional commit messages that follow best practices and accurately describe changes.

## What This Skill Does

- Analyzes git staged changes to understand modifications
- Generates concise commit messages focusing on purpose and intent
- Follows conventional commit format when appropriate
- Ensures messages are meaningful and searchable

## When to Use

Use this skill when:
- User asks for help writing a commit message
- User mentions "commit", "git commit", or "commit message"
- User wants to follow commit message best practices

## How It Works

1. **Analyze Changes**
   - Review git diff to understand what changed
   - Identify the type of change (feat, fix, refactor, docs, etc.)
   - Understand the scope and impact

2. **Determine Intent**
   - Identify the purpose behind changes
   - Focus on 'why' rather than 'what'
   - Consider user perspective and benefits

3. **Generate Message**
   - Use conventional commit format: `type(scope): description`
   - Keep first line under 72 characters
   - Add body if needed to explain reasoning
   - Include breaking change notation if applicable

4. **Review with User**
   - Present generated message
   - Explain reasoning
   - Offer to adjust based on feedback

## Message Format

### Structure
```
type(scope): short description

Optional longer description explaining why this change
was made and what problem it solves.

BREAKING CHANGE: description of breaking change if applicable
```

### Common Types
- **feat**: New feature
- **fix**: Bug fix
- **refactor**: Code restructuring without behavior change
- **docs**: Documentation changes
- **test**: Test additions or modifications
- **chore**: Maintenance tasks

## Best Practices

- **Be concise**: First line under 72 characters
- **Be specific**: Describe actual change, not file names
- **Be purposeful**: Explain why, not just what
- **Use imperative mood**: "Add feature" not "Added feature"
- **Reference issues**: Include ticket numbers when applicable

## Examples

**Good**:
```
feat(auth): add OAuth2 login support

Implements OAuth2 authentication to improve security
and enable single sign-on. Resolves #123.
```

**Bad**:
```
Updated files  # Too vague, no context
```

**Good**:
```
fix(api): handle null responses from user service

Adds null checking to prevent crashes when user service
is unavailable. Returns 503 status with retry-after header.
```

**Bad**:
```
Fixed bug  # No specifics about what or why
```
```

### Design Notes

**Why This Works**:
- ✅ Single file under 300 lines
- ✅ Clear, trigger-rich description with keywords
- ✅ Direct, actionable instructions
- ✅ Examples showing good vs bad
- ✅ Focused on single capability
- ✅ No unnecessary complexity

**Key Decisions**:
- No supporting files needed - all info fits in SKILL.md
- No scripts needed - generating messages is context-dependent
- Examples integrated into main file for easy reference
- Workflow is simple enough to present linearly

---

## Example 2: Moderate Workflow Skill

**Complexity**: Moderate (main file + templates)
**Pattern**: Structured output generator

### api-doc-generator/SKILL.md

```markdown
---
name: api-doc-generator
description: Generates comprehensive API documentation from code analysis. Creates endpoint documentation with request/response examples, authentication details, and error handling. Use when documenting APIs or when user mentions 'API docs', 'API documentation', 'REST documentation', 'endpoint documentation'.
---

# API Documentation Generator

Generates comprehensive, user-friendly API documentation by analyzing code and creating structured documentation following industry standards.

## What This Skill Does

- Analyzes API endpoint code to extract information
- Documents request/response formats with examples
- Includes authentication and authorization details
- Documents error responses and status codes
- Generates consistent, readable documentation

## When to Use

Use this skill when:
- User needs to document REST APIs
- User mentions "API docs", "document endpoints", "REST documentation"
- User wants to create or update API documentation

## Workflow

### Stage 1: Discover Endpoints

1. Ask user for API code location or specific files
2. Scan for endpoint definitions (routes, controllers)
3. Identify all HTTP methods and paths
4. List discovered endpoints for user confirmation

### Stage 2: Analyze Each Endpoint

For each endpoint:
1. Extract HTTP method and path
2. Identify request parameters (path, query, body)
3. Determine response format and status codes
4. Find authentication/authorization requirements
5. Identify error conditions and responses

### Stage 3: Generate Documentation

1. Use template from TEMPLATES.md for each endpoint
2. Create realistic request/response examples
3. Document all parameters with types and descriptions
4. Include authentication details
5. List all possible status codes with meanings

### Stage 4: Organize and Format

1. Group endpoints by resource or domain
2. Add table of contents
3. Include authentication overview section
4. Add common error responses section
5. Format in user's preferred output (Markdown, OpenAPI, etc.)

## Output Format

See TEMPLATES.md for detailed endpoint documentation templates.

The documentation follows industry-standard formats:
- Clear endpoint descriptions
- Complete parameter documentation
- Realistic examples
- Comprehensive error documentation

## Best Practices

- **Be comprehensive**: Document all parameters and responses
- **Use realistic examples**: Show actual data structures, not placeholders
- **Document errors**: Include all error scenarios
- **Keep it current**: Mark documentation generation date
- **Be consistent**: Use same format for all endpoints

## Common Issues

**Issue**: Incomplete parameter documentation
- **Solution**: Review endpoint code thoroughly, check for optional vs required

**Issue**: Unrealistic examples
- **Solution**: Use actual data from tests or development database

**Issue**: Missing error cases
- **Solution**: Check error handling code and exception handlers
```

### api-doc-generator/TEMPLATES.md

```markdown
# API Documentation Templates

## Endpoint Documentation Template

```markdown
## [HTTP METHOD] /api/path/to/endpoint

Brief description of what this endpoint does.

### Authentication
[Required/Optional] - [Auth type: Bearer token, API key, etc.]

### Request Parameters

#### Path Parameters
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | Resource identifier |

#### Query Parameters
| Name | Type | Required | Description |
|------|------|----------|-------------|
| filter | string | No | Filter results by criteria |

#### Request Body
```json
{
  "field": "string",
  "value": "integer"
}
```

### Response

#### Success Response (200 OK)
```json
{
  "id": 123,
  "field": "example",
  "value": 42
}
```

#### Error Responses

**400 Bad Request**
```json
{
  "error": "Invalid input",
  "details": "Field 'value' must be positive integer"
}
```

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**404 Not Found**
```json
{
  "error": "Resource not found"
}
```

### Example Request

```bash
curl -X GET \
  'https://api.example.com/api/resource/123?filter=active' \
  -H 'Authorization: Bearer token123'
```
```

## Overview Section Template

```markdown
# API Documentation

## Overview
Brief description of the API and its purpose.

## Base URL
```
https://api.example.com/v1
```

## Authentication
Description of authentication method and how to obtain credentials.

## Rate Limiting
Description of rate limits and headers.

## Common Response Codes
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Endpoints
[Links to endpoint documentation sections]
```
```

### Design Notes

**Why This Works**:
- ✅ Clear stage-based workflow
- ✅ Separates templates to keep main file concise
- ✅ Progressive disclosure (overview → details in TEMPLATES.md)
- ✅ Comprehensive but not overwhelming
- ✅ Realistic examples in templates

**Key Decisions**:
- Templates separated because they're lengthy and referenced multiple times
- No scripts needed - documentation generation is context-dependent
- Workflow is detailed enough to guide but not overly prescriptive
- Examples show realistic data structures

---

## Example 3: Complex Multi-Stage Skill

**Complexity**: Complex (multiple files + validation script)
**Pattern**: Multi-stage process with validation

### code-refactorer/SKILL.md

```markdown
---
name: code-refactorer
description: Performs systematic code refactoring with validation at each step. Analyzes code quality, identifies improvements, plans changes, executes refactoring, and validates results. Use when refactoring code or when user mentions 'refactor', 'improve code', 'clean up code', 'code quality'.
allowed-tools: [Read, Edit, Bash, Grep, Glob]
---

# Code Refactorer

Systematically refactors code through a validated, multi-stage process that ensures quality improvements without breaking functionality.

## What This Skill Does

- Analyzes code to identify refactoring opportunities
- Plans refactoring changes with clear rationale
- Executes changes incrementally with validation
- Ensures tests pass after each change
- Documents improvements made

## When to Use

Use this skill when:
- User requests code refactoring
- User wants to improve code quality
- User mentions "refactor", "clean up", "improve code quality"
- Code review suggests refactoring

## Architecture

This skill uses a 4-stage validation-first approach:

1. **Analysis** - Identify issues and opportunities
2. **Planning** - Design changes with validation points
3. **Execution** - Apply changes incrementally
4. **Verification** - Validate improvements and functionality

## Stage 1: Analysis

**Goal**: Understand current code and identify improvements

1. **Scan Codebase**
   - Identify files in scope (ask user or use provided paths)
   - Read and analyze code structure
   - Note dependencies and relationships

2. **Identify Issues**
   Run analysis checklist:
   - [ ] Code duplication
   - [ ] Long functions/methods (>50 lines)
   - [ ] Deep nesting (>3 levels)
   - [ ] Unclear naming
   - [ ] Missing error handling
   - [ ] Tight coupling
   - [ ] Low test coverage

3. **Prioritize Improvements**
   - Rank by impact and risk
   - Consider user priorities
   - Identify quick wins vs major refactors

See PATTERNS.md for common refactoring patterns.

## Stage 2: Planning

**Goal**: Create validated refactoring plan

1. **Design Changes**
   For each improvement:
   - Describe current state
   - Describe desired state
   - List specific changes needed
   - Identify affected files
   - Note potential risks

2. **Create Validation Plan**
   - Which tests must pass?
   - What new tests are needed?
   - How to verify behavior unchanged?
   - What rollback steps if issues occur?

3. **Get User Approval**
   - Present refactoring plan
   - Explain rationale and risks
   - Confirm scope and approach
   - Adjust based on feedback

## Stage 3: Execution

**Goal**: Apply changes incrementally with validation

For each refactoring:

1. **Pre-Validation**
   - Run existing tests: `python validate.py test`
   - Verify all tests pass before changes
   - Document baseline behavior

2. **Apply Changes**
   - Make one logical change at a time
   - Keep changes small and focused
   - Maintain backwards compatibility when possible

3. **Post-Validation**
   - Run tests again: `python validate.py test`
   - Verify all tests still pass
   - Check for new warnings or errors
   - Confirm behavior unchanged

4. **Commit**
   - Commit each logical change separately
   - Write clear commit message explaining refactoring
   - Tag refactoring commits for easy identification

**If Validation Fails**:
- Stop further changes
- Analyze failure cause
- Either fix issue or rollback change
- Do not proceed until validated

## Stage 4: Verification

**Goal**: Confirm improvements achieved goals

1. **Measure Improvements**
   - Compare metrics before/after
   - Verify issues addressed
   - Check no regressions introduced

2. **Documentation**
   - Update relevant documentation
   - Note architectural changes
   - Document new patterns used

3. **Summary Report**
   - List changes made
   - Show metrics improvements
   - Note remaining opportunities
   - Provide recommendations

## Validation Script

Use the included validation script for consistent checking:

```bash
# Run all tests
python validate.py test

# Check code quality metrics
python validate.py metrics <file>

# Verify no regressions
python validate.py compare <before> <after>
```

## Reference Materials

- **PATTERNS.md**: Common refactoring patterns and techniques
- **validate.py**: Validation and metrics script

## Best Practices

- **One change at a time**: Keep refactorings focused and atomic
- **Tests first**: Ensure tests pass before and after every change
- **Preserve behavior**: Refactoring changes structure, not functionality
- **Small steps**: Many small changes safer than one large change
- **Clear commits**: Each commit should be reviewable independently

## Common Refactoring Patterns

See PATTERNS.md for detailed explanations of:
- Extract Function
- Extract Class
- Inline Temporary
- Replace Magic Number with Constant
- Decompose Conditional
- Introduce Parameter Object

## Troubleshooting

**Tests Failing After Refactoring**:
- Review changes carefully
- Check for unintended behavior changes
- Verify test assumptions still valid
- Rollback if cannot resolve quickly

**Merge Conflicts**:
- Work on dedicated refactoring branch
- Coordinate with team on timing
- Keep refactorings small to minimize conflicts

## Quality Checklist

- [ ] All tests pass
- [ ] No new warnings or errors
- [ ] Code metrics improved
- [ ] Behavior unchanged
- [ ] Documentation updated
- [ ] Clear commit history
```

### code-refactorer/PATTERNS.md

```markdown
# Refactoring Patterns

Common refactoring patterns with before/after examples.

## Extract Function

**When**: Function or method is too long (>50 lines) or does multiple things

**Before**:
```python
def process_order(order):
    # Validate order
    if not order.items:
        raise ValueError("Empty order")
    if not order.customer:
        raise ValueError("No customer")

    # Calculate total
    total = 0
    for item in order.items:
        total += item.price * item.quantity

    # Apply discount
    if order.customer.is_premium:
        total *= 0.9

    # Process payment
    # ... 20 more lines
```

**After**:
```python
def process_order(order):
    validate_order(order)
    total = calculate_total(order)
    total = apply_discount(total, order.customer)
    process_payment(order, total)

def validate_order(order):
    if not order.items:
        raise ValueError("Empty order")
    if not order.customer:
        raise ValueError("No customer")

def calculate_total(order):
    return sum(item.price * item.quantity for item in order.items)

def apply_discount(total, customer):
    if customer.is_premium:
        return total * 0.9
    return total
```

[Additional patterns...]
```

### code-refactorer/validate.py

```python
#!/usr/bin/env python3
"""
Validation script for code refactoring.

Usage:
    python validate.py test              # Run all tests
    python validate.py metrics <file>    # Check code metrics
    python validate.py compare <before> <after>  # Compare metrics
"""

import sys
import subprocess

def run_tests():
    """Run all tests and return success/failure."""
    # Implementation details...
    pass

def check_metrics(file_path):
    """Analyze code metrics for a file."""
    # Implementation details...
    pass

def compare_metrics(before_file, after_file):
    """Compare metrics between two versions."""
    # Implementation details...
    pass

if __name__ == "__main__":
    # Script logic...
    pass
```

### Design Notes

**Why This Works**:
- ✅ Multi-stage workflow with validation gates
- ✅ Progressive disclosure (overview → patterns in separate file)
- ✅ Validation script for deterministic operations
- ✅ Clear rollback strategy
- ✅ Tool restrictions prevent unintended operations
- ✅ Comprehensive but SKILL.md stays under 400 lines

**Key Decisions**:
- Tool restrictions ensure safe refactoring (no web fetch, write only via Edit)
- Validation script handles testing/metrics consistently
- PATTERNS.md separates detailed examples from workflow
- Stage-based approach with clear validation points
- Emphasizes incremental changes with rollback capability

---

## Example 4: Update/Refactoring Example

**Before**: Poorly structured skill
**After**: Improved skill following best practices

### Before: vague-helper/SKILL.md

```markdown
---
name: helper
description: Helps with stuff.
---

# Helper

This skill helps you do various things with data and files.

You can use it to process JSON, CSV, or other formats. Just tell it what you want and it will try to help.

It can read files, write files, transform data, validate things, and more.

[... 700 lines of unstructured content ...]
```

**Problems**:
- ❌ Vague name ("helper")
- ❌ Useless description ("helps with stuff")
- ❌ No trigger terms
- ❌ Unclear purpose and scope
- ❌ Over 500 lines
- ❌ No structure or organization

### After: data-transformer/SKILL.md

```markdown
---
name: data-transformer
description: Transforms data between formats (JSON, CSV, XML, YAML). Validates structure, filters data, and applies transformations. Use when converting data formats or when user mentions 'convert JSON', 'CSV to JSON', 'transform data', 'data conversion', 'parse data'.
---

# Data Transformer

Transforms data between common formats with validation and filtering capabilities.

## What This Skill Does

- Converts between JSON, CSV, XML, and YAML formats
- Validates data structure against schemas
- Filters and transforms data with user-defined rules
- Handles common edge cases and errors gracefully

## When to Use

Use when:
- User needs to convert data between formats
- User mentions "convert", "transform data", "JSON to CSV", etc.
- User needs to validate data structure
- User wants to filter or reshape data

## Workflow

[Clear stage-based workflow - ~250 lines total]

## Examples

See EXAMPLES.md for detailed transformation examples.

## Reference

See REFERENCE.md for supported formats and transformation options.
```

### Supporting Files Added:
- **EXAMPLES.md**: Input/output examples for each format combination
- **REFERENCE.md**: Technical details about supported formats and options

**Improvements Made**:
- ✅ Specific, descriptive name
- ✅ Clear, trigger-rich description
- ✅ Defined scope and purpose
- ✅ Under 500 lines (split content into support files)
- ✅ Clear structure and workflow
- ✅ Progressive disclosure pattern

---

## Key Takeaways from Examples

### Simple Skills (Example 1)
- Single file is sufficient
- Keep under 300 lines
- Integrate examples into main file
- Direct, linear instructions

### Moderate Skills (Example 2)
- Main file + 1-2 support files
- Templates separate lengthy format examples
- Workflow has clear stages
- Still under 400 lines in SKILL.md

### Complex Skills (Example 3)
- Multiple support files justified
- Validation scripts for deterministic operations
- Tool restrictions for safety
- Clear validation gates in workflow
- SKILL.md stays focused on navigation

### Updates (Example 4)
- Fix structural issues first (name, description, length)
- Split oversized content into support files
- Clarify scope and purpose
- Add trigger terms to description
- Improve organization and navigation
