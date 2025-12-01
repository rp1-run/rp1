"""Artifact generation module for OpenCode build tool.

This module generates OpenCode-compatible artifact files from transformed data models.
All functions use the @safe decorator pattern for automatic Result wrapping.
"""

from datetime import datetime

from returns.result import safe

from .models import OpenCodeAgent, OpenCodeCommand, OpenCodeSkill


class GenerationError(Exception):
    """Base class for generation errors."""

    pass


def _indent_multiline(text: str, spaces: int) -> str:
    """Helper to indent multiline text for YAML.

    Args:
        text: Text to indent
        spaces: Number of spaces to indent

    Returns:
        Indented text with each line prefixed by spaces

    Examples:
        >>> _indent_multiline("line1\\nline2", 2)
        '  line1\\n  line2'
    """
    indent = " " * spaces
    lines = text.split("\n")
    return "\n".join(indent + line if line.strip() else "" for line in lines)


@safe
def generate_command_file(oc_cmd: OpenCodeCommand, cmd_name: str) -> tuple[str, str]:
    """Generate OpenCode command markdown file with YAML frontmatter.

    Uses @safe decorator for automatic Result wrapping.

    OpenCode format: frontmatter with metadata, then prompt content after closing ---

    Args:
        oc_cmd: OpenCode command data model
        cmd_name: Command name for filename

    Returns:
        Tuple of (filename, content)

    Raises:
        GenerationError: If generation fails (wrapped in Failure by @safe)
    """
    # Build YAML frontmatter (metadata only)
    frontmatter_lines = ["---", f"description: {oc_cmd.description}"]

    # Add argument-hint if present (for OpenCode argument passing)
    # Quote the value to handle brackets properly in YAML
    if oc_cmd.argument_hint:
        frontmatter_lines.append(f'argument-hint: "{oc_cmd.argument_hint}"')

    # NOTE: agent field intentionally omitted - OpenCode's agent: field runs as background agent
    # We use @ mentions in prompt content for explicit invocation instead

    if oc_cmd.model:
        frontmatter_lines.append(f"model: {oc_cmd.model}")

    if oc_cmd.subtask:
        frontmatter_lines.append(f"subtask: {str(oc_cmd.subtask).lower()}")

    frontmatter_lines.append("---")

    # Combine frontmatter + prompt content (NOT inside frontmatter)
    content = "\n".join(frontmatter_lines) + "\n\n" + oc_cmd.template

    filename = f"{cmd_name}.md"

    return (filename, content)


@safe
def generate_agent_file(oc_agent: OpenCodeAgent) -> tuple[str, str]:
    """Generate OpenCode agent markdown file with YAML frontmatter.

    Uses @safe decorator for automatic Result wrapping.
    OpenCode agents use markdown format (not JSON) per OpenCode docs.
    Namespacing is handled via subdirectories (agent/rp1-base/agent-name.md).

    Args:
        oc_agent: OpenCode agent data model

    Returns:
        Tuple of (filename, content)

    Raises:
        GenerationError: If generation fails (wrapped in Failure by @safe)
    """
    # Build tools dict from tools list
    tools_dict = {
        "bash": "bash_run" in oc_agent.tools or "Bash" in oc_agent.tools,
        "write": "write_file" in oc_agent.tools or "Write" in oc_agent.tools,
        "edit": "edit_file" in oc_agent.tools or "Edit" in oc_agent.tools,
    }

    # Build YAML frontmatter
    frontmatter_lines = [
        "---",
        f"description: {oc_agent.description}",
        f"mode: {oc_agent.mode}",
    ]

    # Only include model if it's not "inherit" (OpenCode doesn't understand inherit)
    if oc_agent.model and oc_agent.model != "inherit":
        frontmatter_lines.append(f"model: {oc_agent.model}")

    frontmatter_lines.extend(
        [
            "tools:",
            f"  bash: {str(tools_dict['bash']).lower()}",
            f"  write: {str(tools_dict['write']).lower()}",
            f"  edit: {str(tools_dict['edit']).lower()}",
            "---",
            "",
            oc_agent.content,
        ]
    )

    content = "\n".join(frontmatter_lines)
    filename = f"{oc_agent.name}.md"

    return (filename, content)


@safe
def generate_skill_file(
    oc_skill: OpenCodeSkill,
) -> tuple[str, str, list[tuple[str, str]]]:
    """Generate OpenCode SKILL.md file + supporting files.

    Uses @safe decorator for automatic Result wrapping.

    Args:
        oc_skill: OpenCode skill data model

    Returns:
        Tuple of (skill_dir, SKILL.md content, supporting_files list)
        supporting_files is list of (relative_path, content) tuples

    Raises:
        GenerationError: If generation fails (wrapped in Failure by @safe)
    """
    # Anthropic Skills v1.0 format
    frontmatter_lines = [
        "---",
        f"name: {oc_skill.name}",
        f"description: {oc_skill.description}",
        "---",
        "",
        oc_skill.content,
    ]

    skill_md_content = "\n".join(frontmatter_lines)
    skill_dir = oc_skill.name

    # Supporting files are copied separately by caller
    # Generator just provides the paths
    supporting_files: list[tuple[str, str]] = []

    return (skill_dir, skill_md_content, supporting_files)


@safe
def generate_manifest(
    plugin_name: str,
    version: str,
    commands: list[str],
    agents: list[str],
    skills: list[str],
) -> str:
    """Generate OpenCode manifest.json with metadata.

    Uses @safe decorator for automatic Result wrapping.
    Manifest tracks what was generated for verification.

    Args:
        plugin_name: Plugin name (e.g., "rp1-base")
        version: Plugin version (e.g., "2.6.0")
        commands: List of command names
        agents: List of agent names
        skills: List of skill names

    Returns:
        JSON string with manifest data

    Raises:
        GenerationError: If generation fails (wrapped in Failure by @safe)
    """
    import json

    timestamp = datetime.now().isoformat()

    manifest = {
        "plugin": plugin_name,
        "version": version,
        "generated_at": timestamp,
        "opencode_version_tested": "0.9.x",
        "artifacts": {
            "commands": commands,
            "agents": agents,
            "skills": skills,
        },
        "installation": {
            "commands_dir": "~/.config/opencode/command/",
            "agents_dir": "~/.config/opencode/agent/",
            "skills_dir": "~/.config/opencode/skills/",
        },
        "requirements": {
            "opencode_version": ">=0.8.0",
            "opencode_skills_required": len(skills) > 0,
        },
    }

    return json.dumps(manifest, indent=2)
