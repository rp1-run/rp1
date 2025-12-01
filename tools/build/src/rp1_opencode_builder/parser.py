"""Frontmatter parsing for Claude Code commands, agents, and skills."""

from datetime import date
from pathlib import Path
from typing import Any

import frontmatter
from returns.result import safe

from .models import ClaudeCodeAgent, ClaudeCodeCommand, ClaudeCodeSkill


def _normalize_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    """Normalize YAML metadata for Pydantic validation.

    YAML parses dates as datetime.date objects, but our models expect strings.
    Convert any date objects to ISO format strings.
    """
    normalized = {}
    for key, value in metadata.items():
        if isinstance(value, date):
            normalized[key] = value.isoformat()
        else:
            normalized[key] = value
    return normalized


@safe
def parse_command(file_path: Path) -> ClaudeCodeCommand:
    """Parse Claude Code command markdown with YAML frontmatter.

    Uses @safe decorator for automatic Result wrapping.
    Pydantic model handles all validation automatically.

    Args:
        file_path: Path to command markdown file

    Returns:
        ClaudeCodeCommand (wrapped in Result by @safe decorator)

    Raises:
        FileNotFoundError: If file doesn't exist
        ValidationError: If Pydantic validation fails (missing/invalid fields)
        yaml.YAMLError: If YAML is malformed

    Example:
        >>> result = parse_command(Path("base/commands/knowledge-build.md"))
        >>> if is_successful(result):
        ...     command = result.unwrap()
        ...     print(command.name)
    """
    with open(file_path, encoding="utf-8") as f:
        post = frontmatter.load(f)

    # Normalize metadata (YAML dates → strings) and let Pydantic validate
    normalized = _normalize_metadata(post.metadata)

    return ClaudeCodeCommand(
        **normalized,
        content=post.content,
    )


@safe
def parse_agent(file_path: Path) -> ClaudeCodeAgent:
    """Parse Claude Code agent markdown with YAML frontmatter.

    Uses @safe decorator for automatic Result wrapping.
    Pydantic model handles validation automatically.

    Args:
        file_path: Path to agent markdown file

    Returns:
        ClaudeCodeAgent (wrapped in Result by @safe decorator)

    Raises:
        FileNotFoundError: If file doesn't exist
        ValidationError: If Pydantic validation fails (missing/invalid fields)
        yaml.YAMLError: If YAML is malformed

    Example:
        >>> result = parse_agent(Path("base/agents/kb-spatial-analyzer.md"))
        >>> if is_successful(result):
        ...     agent = result.unwrap()
        ...     print(agent.tools)
    """
    with open(file_path, encoding="utf-8") as f:
        post = frontmatter.load(f)

    # Normalize metadata (dates → strings)
    normalized = _normalize_metadata(post.metadata)

    # Handle tools as list or comma-separated string
    tools_raw: Any = normalized.get("tools", [])
    if isinstance(tools_raw, str):
        normalized["tools"] = [t.strip() for t in tools_raw.split(",")]

    # Pydantic validates required fields automatically
    return ClaudeCodeAgent(
        **normalized,
        content=post.content,
    )


@safe
def parse_skill(skill_dir: Path) -> ClaudeCodeSkill:
    """Parse Claude Code skill from SKILL.md + supporting files.

    Uses @safe decorator for automatic Result wrapping.
    Pydantic model handles validation automatically (including description length ≥20).

    Args:
        skill_dir: Path to skill directory containing SKILL.md

    Returns:
        ClaudeCodeSkill (wrapped in Result by @safe decorator)

    Raises:
        FileNotFoundError: If SKILL.md doesn't exist
        ValidationError: If Pydantic validation fails (missing fields, description <20 chars)
        yaml.YAMLError: If YAML is malformed

    Example:
        >>> result = parse_skill(Path("base/skills/mermaid"))
        >>> if is_successful(result):
        ...     skill = result.unwrap()
        ...     print(skill.supporting_files)
    """
    skill_md = skill_dir / "SKILL.md"

    # Let open() raise FileNotFoundError naturally if file doesn't exist
    with open(skill_md, encoding="utf-8") as f:
        post = frontmatter.load(f)

    # Normalize metadata (dates → strings)
    normalized = _normalize_metadata(post.metadata)

    # Find supporting files (templates/, scripts/, examples/, etc.)
    supporting_files: list[str] = []
    for subdir in ["templates", "scripts", "examples"]:
        subdir_path = skill_dir / subdir
        if subdir_path.exists() and subdir_path.is_dir():
            supporting_files.extend([str(f.relative_to(skill_dir)) for f in subdir_path.rglob("*") if f.is_file()])

    # Pydantic validates required fields + description length (≥20 chars) automatically
    return ClaudeCodeSkill(
        **normalized,
        content=post.content,
        supporting_files=supporting_files,
    )
