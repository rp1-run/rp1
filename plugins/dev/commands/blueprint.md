---
name: blueprint
version: 2.0.0
description: Guided wizard that captures project vision through a two-tier document hierarchy (charter + PRDs) to bridge the gap between idea and feature requirements.
argument-hint: "[prd-name]"
tags:
  - planning
  - project
  - charter
  - prd
  - onboarding
  - core
created: 2025-11-30
author: cloud-on-prem/rp1
---

# Project Blueprint - Vision Capture

Launch the blueprint wizard to capture and structure your project vision through guided questioning.

## Usage

**Default Flow** (creates charter + main PRD together):

```
/rp1-dev:blueprint
```

**Named PRD Flow** (requires existing charter):

```
/rp1-dev:blueprint mobile-app
/rp1-dev:blueprint api
/rp1-dev:blueprint web
```

## Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| PRD_NAME | $1 | (none) | Name of PRD to create (omit for default flow) |
| EXTRA_CONTEXT | $ARGUMENTS | `""` | Additional context from user |
| RP1_ROOT | Environment | `.rp1/` | Root directory |

## Document Hierarchy

The blueprint command creates a two-tier document hierarchy:

1. **Charter** (`{RP1_ROOT}/context/charter.md`) - Single project-level document capturing:
   - Problem & context (why)
   - Target users (who)
   - Business rationale
   - Scope guardrails
   - Success criteria

2. **PRDs** (`{RP1_ROOT}/work/prds/<name>.md`) - Surface-specific documents capturing:
   - Surface overview
   - In/out scope
   - Requirements
   - Dependencies
   - Timeline

PRDs inherit from the charter and link back to it, avoiding content duplication.

## Workflow

### Step 1: Mode Detection

Before invoking the charter interviewer, detect the current mode based on charter.md state.

**Detection Logic**:

1. Use the Read tool to attempt reading `{RP1_ROOT}/context/charter.md`
2. Based on the result, determine the mode:

| Condition | Mode | User Message |
|-----------|------|--------------|
| File does not exist | CREATE | "Starting new charter creation. I'll guide you through defining your project vision." |
| File exists AND contains `## Scratch Pad` | RESUME | "Resuming interrupted charter session. I'll continue from where you left off." |
| File exists AND does NOT contain `## Scratch Pad` | UPDATE | "Updating existing charter. I'll ask focused questions about changes you want to make." |

**Implementation**:

```
1. Read {RP1_ROOT}/context/charter.md
2. If file not found or empty:
   - MODE = CREATE
   - Output: "Starting new charter creation. I'll guide you through defining your project vision."
3. Else if file contains "## Scratch Pad":
   - MODE = RESUME
   - Output: "Resuming interrupted charter session. I'll continue from where you left off."
4. Else:
   - MODE = UPDATE
   - Output: "Updating existing charter. I'll ask focused questions about changes you want to make."
```

Store the detected MODE for use in subsequent steps.

### Step 2: Initialize Scratch Pad

Before starting the interview loop, initialize the scratch pad based on MODE.

**CREATE Mode** - Use Write tool to create charter.md:

```markdown
# Project Charter: [To Be Determined]

**Version**: 1.0.0
**Status**: Draft
**Created**: {YYYY-MM-DD}

## Scratch Pad

<!-- Interview state - will be removed upon completion -->
<!-- Mode: CREATE -->
<!-- Started: {ISO timestamp e.g. 2025-12-27T10:30:00Z} -->

<!-- End scratch pad -->
```

**UPDATE Mode** - Use Edit tool to append scratch pad to existing charter:

```
old_string: [last line of existing charter content]
new_string: [last line of existing charter content]

## Scratch Pad

<!-- Interview state - will be removed upon completion -->
<!-- Mode: UPDATE -->
<!-- Started: {ISO timestamp} -->

<!-- End scratch pad -->
```

**RESUME Mode** - No initialization needed (scratch pad already exists).

### Step 3: Charter Interview Loop (Orchestration)

Execute a loop that invokes the stateless charter-interviewer agent repeatedly until a terminal state is reached.

**Loop Structure**:

```
question_number = 0
loop:
  1. Invoke charter-interviewer via Task tool:
     - subagent_type: rp1-dev:charter-interviewer
     - prompt: Include CHARTER_PATH ({RP1_ROOT}/context/charter.md), MODE, and RP1_ROOT

  2. Parse the JSON response from charter-interviewer

  3. Handle response based on type:

     IF type == "next_question":
        question_number = response.metadata.question_number
        topic = determine_topic_from_gaps(response.metadata.gaps_remaining[0])

        a. Call AskUserQuestion with response.next_question
        b. Get user's answer
        c. Write Q&A to scratch pad in charter.md:

           ### Q{question_number}: {topic}
           **Asked**: {response.next_question}
           **Answer**: {user's answer}

        d. Continue loop

     IF type == "success":
        a. Get charter_content from response
        b. Write finalized charter sections to charter.md (replacing placeholders)
        c. Remove the entire "## Scratch Pad" section from charter.md
        d. Update charter status to "Complete"
        e. Output: "Charter complete! Proceeding to PRD creation..."
        f. Exit loop, proceed to Step 4

     IF type == "skip":
        question_number = response.metadata.question_number
        topic = determine_topic_from_message(response.message)

        a. Record skip in scratch pad:

           ### Q{question_number}: {topic}
           **Skipped**: {response.message}

        b. Continue loop

     IF type == "error":
        a. Display error message to user: response.message
        b. Output: "Charter interview encountered an error. Scratch pad state preserved for retry."
        c. Preserve scratch pad state (do NOT remove it)
        d. Exit command (do NOT proceed to PRD)
```

**Task Tool Invocation for charter-interviewer**:

```
Use Task tool with:
- subagent_type: rp1-dev:charter-interviewer
- prompt:
  Analyze charter state and return next interview action.

  Parameters:
  - CHARTER_PATH: {RP1_ROOT}/context/charter.md
  - MODE: {detected mode from Step 1}

  Read the charter file, analyze the scratch pad state, and return a JSON response
  indicating the next action (next_question, success, skip, or error).
```

**Response Parsing**:

The charter-interviewer returns valid JSON matching this schema:
```typescript
interface StatelessAgentResponse {
  type: "next_question" | "success" | "skip" | "error";
  next_question?: string;
  message?: string;
  charter_complete?: boolean;
  charter_content?: {
    problem?: string;
    users?: string;
    value_prop?: string;
    scope?: string;
    success?: string;
  };
  metadata?: {
    question_number?: number;
    total_questions?: number;
    gaps_remaining?: string[];
  };
}
```

Parse the JSON from the agent's output. The agent outputs ONLY the JSON block.

**Topic Mapping** (for scratch pad entries):

| Gap ID | Topic |
|--------|-------|
| problem | Problem & Context |
| users | Target Users |
| value_prop | Value Proposition |
| scope | Scope |
| success | Success Criteria |

For Q1 in CREATE mode, use topic "Brain Dump".

#### Scratch Pad Write Operations

**Writing Q&A pairs** - Use Edit tool to insert Q&A before `<!-- End scratch pad -->`:

```
old_string: <!-- End scratch pad -->
new_string: ### Q{N}: {Topic}
**Asked**: {question text}
**Answer**: {user's answer}

<!-- End scratch pad -->
```

Example for first question in CREATE mode:
```
old_string: <!-- End scratch pad -->
new_string: ### Q1: Brain Dump
**Asked**: Tell me everything about this project. What are you building, what problem does it solve, and who is it for?
**Answer**: We're building a task management app for remote teams. The main problem is coordination across time zones.

<!-- End scratch pad -->
```

**Recording skipped questions** - Use Edit tool with `**Skipped**:` instead of `**Answer**:`:

```
old_string: <!-- End scratch pad -->
new_string: ### Q{N}: {Topic}
**Skipped**: {reason from response.message}

<!-- End scratch pad -->
```

**Removing scratch pad on success** - Use Edit tool to remove entire section:

```
old_string: ## Scratch Pad

<!-- Interview state - will be removed upon completion -->
<!-- Mode: {MODE} -->
<!-- Started: {timestamp} -->

{all Q&A entries}

<!-- End scratch pad -->
new_string:
```

Match from `## Scratch Pad` through `<!-- End scratch pad -->` and replace with empty string. After removal, write the finalized charter content from `response.charter_content` to the appropriate sections.

### Step 4: PRD Creation (via Blueprint Wizard)

After charter interview completes successfully, spawn blueprint-wizard for PRD creation only.

Use the Task tool with:

- **subagent_type**: `rp1-dev:blueprint-wizard`
- **prompt**: Include PRD_NAME ($1), EXTRA_CONTEXT ($ARGUMENTS)

```
Create PRD for the project. Charter already exists at {RP1_ROOT}/context/charter.md.

Parameters:
- PRD_NAME: $1 (empty = create main.md PRD)
- EXTRA_CONTEXT: $ARGUMENTS

The wizard will:
1. Read existing charter for context
2. Scan project artifacts (README, docs)
3. Guide through PRD sections only (charter already done)
4. Generate PRD at {RP1_ROOT}/work/prds/

Execute the PRD workflow immediately.
```

**Note**: Blueprint-wizard assumes charter.md already exists and handles only PRD creation.

## Next Steps

After completing blueprint:

- Use `/rp1-dev:feature-requirements <feature-id>` to define specific features
- Features can optionally associate with a parent PRD for context inheritance
