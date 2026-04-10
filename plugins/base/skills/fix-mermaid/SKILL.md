---
name: fix-mermaid
description: "Validates and repairs mermaid diagrams in markdown files. Scans for mermaid blocks, validates syntax, and auto-repairs common errors."
metadata:
  category: documentation
  is_workflow: false
  version: 1.0.0
  tags:
    - documentation
    - validation
    - repair
  created: 2025-12-11
  updated: 2026-02-26
  author: cloud-on-prem/rp1
  arguments:
    - name: FILE_PATH
      type: string
      required: true
      description: "Path to markdown file, or - for stdin diagram"
  sub_agents:
    - "rp1-base:mermaid-fixer"
---

# Mermaid Diagram Fixer

This command validates and repairs Mermaid.js diagrams in markdown files.

## Usage

```
/fix-mermaid path/to/file.md    # Process markdown file in-place
/fix-mermaid -                   # Process diagram from stdin (stdout output)
```

## Invocation

{% dispatch_agent "rp1-base:mermaid-fixer", "INPUT_PATH: {FILE_PATH}, OUTPUT_MODE: in-place" %}

The agent will:
- Scan markdown for all mermaid code blocks
- Validate each diagram using rp1 CLI tool
- Attempt automatic repair (up to 3 iterations per diagram)
- Insert placeholders for unfixable diagrams
- Output JSON summary of repairs made

## Requirements

- rp1 CLI v0.3.0 or later (includes `agent-tools mmd-validate` command)
- Chromium (auto-downloaded on first use by rp1)
