---
name: fix-mermaid
version: 1.0.0
description: Validates and repairs mermaid diagrams in markdown files. Scans for mermaid blocks, validates syntax, and auto-repairs common errors.
argument-hint: "file-path [-]"
tags:
  - documentation
  - validation
  - repair
created: 2025-12-11
author: cloud-on-prem/rp1
---

# Mermaid Diagram Fixer

This command validates and repairs Mermaid.js diagrams in markdown files.

## Usage

```
/fix-mermaid path/to/file.md    # Process markdown file in-place
/fix-mermaid -                   # Process diagram from stdin (stdout output)
```

## Invocation

Use the Task tool to invoke the mermaid-fixer agent:

```
subagent_type: rp1-base:mermaid-fixer
prompt: |
  INPUT_PATH: $1
  OUTPUT_MODE: in-place
```

The agent will:
- Scan markdown for all mermaid code blocks
- Validate each diagram using rp1 CLI tool
- Attempt automatic repair (up to 3 iterations per diagram)
- Insert placeholders for unfixable diagrams
- Output JSON summary of repairs made

## Parameters

| Parameter | Description |
|-----------|-------------|
| $1 | Path to markdown file, or `-` for stdin diagram |

## Requirements

- rp1 CLI v0.3.0 or later (includes `agent-tools mmd-validate` command)
- Chromium (auto-downloaded on first use by rp1)
