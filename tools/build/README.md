# rp1-opencode-builder

Build tool to generate OpenCode-compatible artifacts from Claude Code sources.

## Overview

This tool transforms rp1's Claude Code plugin sources (commands, agents, skills) into OpenCode-compatible format, enabling rp1 to work on the OpenCode platform without code duplication.

**Architecture**: Claude Code (Source of Truth) → Build Tool (Transform) → OpenCode Artifacts

## Features

- Parse Claude Code commands, agents, and skills with YAML frontmatter
- Transform platform-specific patterns (Task tool → subagent, SlashCommand → command_invoke)
- Generate OpenCode-compatible artifact files
- Validate generated artifacts (syntax + schema)
- Type-safe implementation with Result monad error handling

## Installation

### For Development

```bash
# Clone the repository
git clone https://github.com/rp1-run/rp1.git
cd rp1/build-tool

# Install dependencies with uv
uv sync

# Run tests
uv run pytest

# Run type checking
uv run mypy src/

# Run linting
uv run ruff check src/
```

### For Usage (via uvx)

```bash
# Run directly without installation
uvx rp1-opencode-builder build

# Show help
uvx rp1-opencode-builder --help
```

## Usage

### Build OpenCode Artifacts

```bash
# Build all artifacts (default output: dist/opencode/)
uv run rp1-opencode-builder build

# Build artifacts for bundling with install tool (NEW in v1.0.0)
uv run rp1-opencode-builder build --target-install-tool

# Build with custom output directory
uv run rp1-opencode-builder build --output-dir /path/to/output

# Build specific plugin only
uv run rp1-opencode-builder build --plugin base
```

### Build for Install Tool Bundling (Recommended for Releases)

The `--target-install-tool` flag generates artifacts directly under `install-tool/dist/opencode/`, which allows the install tool to bundle them in its wheel package:

```bash
# From build-tool/ or project root:
uv run rp1-opencode-builder build --target-install-tool

# Or use the automation script:
./scripts/build-for-install.sh
```

This enables simple installation for end users:
```bash
# Clone and run install script (requires gh CLI)
gh repo clone rp1-run/rp1 /tmp/rp1 && bash /tmp/rp1/scripts/install-for-opencode.sh
```

### Validate Artifacts

```bash
# Validate generated artifacts
uv run rp1-opencode-builder validate

# Validate artifacts in custom directory
uv run rp1-opencode-builder validate --artifacts-dir /path/to/artifacts
```

### Clean Output

```bash
# Remove generated artifacts
uv run rp1-opencode-builder clean
```

### Show Differences

```bash
# Preview what would be generated (dry-run)
uv run rp1-opencode-builder diff
```

## Project Structure

```
build-tool/
├── pyproject.toml              # Project configuration
├── README.md                   # This file
├── src/
│   └── rp1_opencode_builder/
│       ├── __init__.py
│       ├── cli.py              # Typer CLI interface
│       ├── models.py           # Type-safe data models
│       ├── parser.py           # Frontmatter parsing
│       ├── transformations.py  # Platform transformation logic
│       ├── generator.py        # Artifact generation
│       ├── validator.py        # Syntax and schema validation
│       └── registry.py         # Platform registry
├── tests/
│   ├── test_models.py
│   ├── test_parser.py
│   ├── test_transformations.py
│   ├── test_generator.py
│   └── test_validator.py
└── config/
    └── platform_registry.yaml  # Platform difference mappings
```

## Development

### Running Tests

```bash
# Run all tests with coverage
uv run pytest

# Run specific test file
uv run pytest tests/test_parser.py

# Run with verbose output
uv run pytest -v

# Generate HTML coverage report
uv run pytest --cov-report=html
```

### Type Checking

```bash
# Type check all source files
uv run mypy src/

# Type check with strict mode (already configured)
uv run mypy --strict src/
```

### Linting and Formatting

```bash
# Check code with ruff
uv run ruff check src/

# Auto-fix issues
uv run ruff check --fix src/

# Format code
uv run ruff format src/
```

## Requirements

- Python 3.13+
- Dependencies managed via uv

## License

Apache-2.0

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development workflow and guidelines.

## Support

- Issues: https://github.com/rp1-run/rp1/issues
- Documentation: https://github.com/rp1-run/rp1/tree/main/docs/opencode
