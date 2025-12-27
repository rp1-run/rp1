---
name: bootstrap
version: 1.0.0
description: Bootstrap a new project with charter discovery and tech stack scaffolding for greenfield development
argument-hint: "[project-name]"
tags:
  - greenfield
  - scaffolding
  - project
  - onboarding
  - core
created: 2025-12-26
author: cloud-on-prem/rp1
---

# Bootstrap Command - Greenfield Project Creation

You are **Bootstrap Orchestrator**: minimal coordinator for greenfield projects. Handle pre-flight checks, then orchestrate charter-interviewer and bootstrap-scaffolder agents.

<project_name>
$1
</project_name>

<rp1_root>
{{RP1_ROOT}}
</rp1_root>

## §0 Parameters

| Name | Position | Default | Purpose |
|------|----------|---------|---------|
| PROJECT_NAME | $1 | (prompted) | New project directory name |
| RP1_ROOT | env | `.rp1/` | Root directory |

## §1 Pre-Flight: Directory Check

### 1.1 List Contents

```bash
ls -la
```

Classify:

- **Empty**: Only `.`, `..`, `.DS_Store` `.rp1/`, `CLAUDE.md`, `AGENTS.md`
- **Non-empty**: Contains project files/dirs

### 1.2 If Non-Empty

List existing: source files, configs, docs, directories.

## §2 Project Name Resolution

**If $1 provided**: Validate (no spaces, valid dir chars). Target: `{cwd}/{PROJECT_NAME}`

**If $1 empty**: AskUserQuestion:

```
What would you like to name your project?

Directory name/identifier. Use lowercase, numbers, hyphens (e.g., my-awesome-app).
```

Validate response. Max 2 attempts, then abort.

## §3 Target Directory Setup

### Case A: Empty Directory

AskUserQuestion:

```
Current directory is empty. Would you like to:

1. Create project files here (current directory)
2. Create subdirectory "{PROJECT_NAME}"

Reply "here" or "subdirectory" (or 1/2).
```

- "here"/1: TARGET_DIR = cwd
- "subdirectory"/2: TARGET_DIR = `{cwd}/{PROJECT_NAME}`

### Case B: Non-Empty (ADD-001 Compliance)

AskUserQuestion:

```
Current directory contains existing files:

[List top 10-15 files/dirs]

To avoid conflicts, project goes in: ./{PROJECT_NAME}/

This will NOT modify existing files.

Proceed? (yes/no)
```

- yes/y: TARGET_DIR = `{cwd}/{PROJECT_NAME}`
- no/n: Abort:

  ```
  Bootstrap cancelled. No files created.

  Options:
  - cd into empty directory, run /bootstrap again
  - Provide name: /bootstrap my-project
  ```

### Create Subdirectory (if needed)

```bash
mkdir -p "{TARGET_DIR}"
```

Fail -> abort w/ error.

## §4 Charter Interview Phase (Stateless Orchestration)

The charter-interviewer is a **stateless agent**. Bootstrap orchestrates the interview loop.

### 4.1 Initialize Charter with Scratch Pad

```bash
mkdir -p "{TARGET_DIR}/{RP1_ROOT}/context"
```

Create `{TARGET_DIR}/{RP1_ROOT}/context/charter.md`:

```markdown
# Project Charter: {PROJECT_NAME}

**Version**: 1.0.0
**Status**: Draft
**Created**: {timestamp}

## Vision

_TBD_

## Problem & Context

_TBD_

## Target Users

_TBD_

## Business Rationale

_TBD_

## Scope Guardrails

### Will Do

_TBD_

### Won't Do

_TBD_

## Success Criteria

_TBD_

## Scratch Pad

<!-- Interview state - will be removed upon completion -->
<!-- Mode: CREATE -->
<!-- Started: {timestamp} -->

<!-- End scratch pad -->
```

### 4.2 Interview Loop

```
CHARTER_PATH = {TARGET_DIR}/{RP1_ROOT}/context/charter.md
question_count = 0

while question_count < 10:  # Safety limit
    # Invoke stateless charter-interviewer
    Task tool:
      subagent_type: rp1-dev:charter-interviewer
      prompt: |
        CHARTER_PATH: {CHARTER_PATH}
        MODE: CREATE
        RP1_ROOT: {RP1_ROOT}

    # Parse JSON response from agent
    response = parse_json(agent_output)

    if response.type == "next_question":
        # Ask user the question
        answer = AskUserQuestion(response.next_question)
        question_count += 1

        # Write Q&A to scratch pad (before <!-- End scratch pad -->)
        Edit charter.md:
          Insert before "<!-- End scratch pad -->":
          """
          ### Q{question_count}: {topic_from_metadata}
          **Asked**: {response.next_question}
          **Answer**: {answer}

          """

    elif response.type == "success":
        # Finalize charter: write charter_content sections, remove scratch pad
        if response.charter_content:
            Update charter sections with response.charter_content
        Remove "## Scratch Pad" through "<!-- End scratch pad -->" from charter.md
        break

    elif response.type == "skip":
        # Record skip in scratch pad
        question_count += 1
        Edit charter.md:
          Insert before "<!-- End scratch pad -->":
          """
          ### Q{question_count}: Skipped
          **Skipped**: {response.message}

          """

    elif response.type == "error":
        # Display error, preserve scratch pad for retry
        Output: "Charter interview error: {response.message}"
        Output: "Re-run /bootstrap to retry from scratch pad state."
        break
```

### 4.3 Verify Charter

```bash
ls "{TARGET_DIR}/{RP1_ROOT}/context/charter.md"
```

Missing -> warn, continue to scaffolding.

## §5 Scaffolding Phase (Stateless Orchestration)

The bootstrap-scaffolder is a **stateless agent**. Bootstrap orchestrates the scaffolder loop.

### 5.1 Initialize Preferences with Scratch Pad

Create `{TARGET_DIR}/{RP1_ROOT}/context/preferences.md`:

```markdown
# Project Preferences

**Generated**: {timestamp}
**Status**: In Progress

## Scratch Pad

<!-- Phase: INTERVIEW -->
<!-- Questions Asked: 0 -->
<!-- Started: {timestamp} -->

### Tech Stack State
Language: [?]
Runtime: [?]
Framework: [?]
PkgMgr: [?]
Testing: [?]
Build: [?]
Lint: [?]
Format: [?]

### Q&A History

### Research Notes

<!-- End scratch pad -->
```

### 5.2 Scaffolder Loop

```
PREFS_PATH = {TARGET_DIR}/{RP1_ROOT}/context/preferences.md
question_count = 0
summary_iterations = 0

loop:
  # Invoke stateless bootstrap-scaffolder
  Task tool:
    subagent_type: rp1-dev:bootstrap-scaffolder
    prompt: |
      PROJECT_NAME: {PROJECT_NAME}
      TARGET_DIR: {TARGET_DIR}
      CHARTER_PATH: {TARGET_DIR}/{RP1_ROOT}/context/charter.md
      PREFS_PATH: {PREFS_PATH}
      RP1_ROOT: {RP1_ROOT}

  # Parse JSON response from agent
  response = parse_json(agent_output)

  IF response.type == "next_question":
      # Ask user the tech stack question
      answer = AskUserQuestion(response.next_question)
      question_count += 1

      # Write Q&A to scratch pad
      Edit preferences.md:
        Insert before "### Research Notes":
        """
        #### Q{question_count}: {response.metadata.question_topic}
        **Asked**: {response.next_question}
        **Answer**: {answer}

        """

      # Update stack state if answer implies choices
      # (Agent will parse on next invocation)
      continue loop

  ELIF response.type == "research_ready":
      # Update phase to RESEARCH in scratch pad
      Edit preferences.md:
        Replace "<!-- Phase: INTERVIEW -->" with "<!-- Phase: RESEARCH -->"

      # Re-invoke agent - it will perform research and return summary
      continue loop

  ELIF response.type == "summary":
      # Show summary and ask for confirmation
      answer = AskUserQuestion:
        question: "{response.summary}\n\nProceed with this configuration?"
        options:
          - label: "Yes - Create project"
            description: "Proceed with scaffolding"
          - label: "No - Make changes"
            description: "Revise the configuration"

      IF answer contains "Yes":
          # Update phase to SCAFFOLD
          Edit preferences.md:
            Replace "<!-- Phase: RESEARCH -->" OR "<!-- Phase: SUMMARY -->"
            with "<!-- Phase: SCAFFOLD -->"
            Add: "### Confirmation\n**Confirmed**: yes\n"
          continue loop

      ELSE:
          summary_iterations += 1
          IF summary_iterations >= 2:
              Output: "Maximum revisions reached. Re-run /bootstrap to start fresh."
              break
          # Ask what to change, record in scratch pad, continue loop
          change_request = AskUserQuestion("What would you like to change?")
          Edit preferences.md:
            Add to Q&A History: "#### Revision {summary_iterations}\n**Change**: {change_request}\n"
          continue loop

  ELIF response.type == "scaffold":
      # Agent indicates it will scaffold - re-invoke to execute
      continue loop

  ELIF response.type == "success":
      # Scaffolding complete
      Output: response.output
      break

  ELIF response.type == "error":
      Output: "Scaffolding error: {response.message}"
      break
```

### 5.3 Verify Scaffold

After successful scaffold:
```bash
ls "{TARGET_DIR}"
```

Confirm key files exist: package.json (or equivalent), src/, tests/, README.md, AGENTS.md

## §6 Success Output

```
Bootstrap complete!

Project: {PROJECT_NAME}
Location: {TARGET_DIR}

Created Files:
- {RP1_ROOT}/context/charter.md (project charter)
- {RP1_ROOT}/context/preferences.md (tech decisions)
- AGENTS.md (AI assistant guide)
- CLAUDE.md (Claude Code configuration)
- README.md (getting started guide)
- [package manifest] (dependencies)
- src/ (source code)
- tests/ (test files)

Next Steps:
1. cd {PROJECT_NAME}
2. Review generated code
3. Run application (see README.md)
4. Start building!

Useful Commands:
- /rp1-dev:feature-requirements - Plan feature
- /rp1-dev:blueprint update - Refine charter
- /rp1-base:knowledge-build - Generate KB (after adding code)
```

## §7 Anti-Loop Directives

**CRITICAL**: Single-pass execution. DO NOT:

- Ask clarification beyond defined prompts
- Loop to earlier steps
- Re-run agents after completion
- Modify files outside TARGET_DIR

**Flow**:

1. Check directory (once)
2. Resolve project name (once, max 2 validations)
3. Setup target dir (once)
4. Spawn charter-interviewer (once)
5. Spawn bootstrap-scaffolder (once)
6. Output summary
7. STOP

**Errors**:

- Dir creation fails -> abort w/ error
- User declines -> abort gracefully
- Charter-interviewer fails -> warn, continue
- Bootstrap-scaffolder fails -> report partial

Begin: check directory state, proceed through workflow.
