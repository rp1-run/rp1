"""Transformation engine for converting Claude Code artifacts to OpenCode format."""

import re

from returns.result import safe

from .models import (
    ClaudeCodeAgent,
    ClaudeCodeCommand,
    ClaudeCodeSkill,
    OpenCodeAgent,
    OpenCodeCommand,
    OpenCodeSkill,
    PlatformRegistry,
)


def _is_in_code_block(text: str, position: int) -> bool:
    """Check if a position in text is inside a code block (```...```).

    Args:
        text: The full text content
        position: Character position to check

    Returns:
        True if position is inside a code block, False otherwise
    """
    # Count code block delimiters (```) before this position
    text_before = text[:position]
    delimiter_count = text_before.count("```")

    # If count is odd, we're inside a code block
    return delimiter_count % 2 == 1


def _find_matches_outside_code_blocks(pattern: str, text: str, flags: int = 0) -> list[re.Match[str]]:
    """Find regex matches that are NOT inside code blocks.

    Args:
        pattern: Regex pattern to search for
        text: Text to search in
        flags: Regex flags (e.g., re.DOTALL)

    Returns:
        List of Match objects for matches outside code blocks
    """
    all_matches = re.finditer(pattern, text, flags)
    return [match for match in all_matches if not _is_in_code_block(text, match.start())]


def _transform_task_tool_invocations(content: str) -> str:
    """Transform agent namespace separator for OpenCode.

    Simply replaces colon with slash: rp1-dev:agent → rp1-dev/agent
    This matches OpenCode's subdirectory namespacing.

    Args:
        content: Command content to transform

    Returns:
        Transformed content with OpenCode namespace format
    """
    # Simple replacement: rp1-base:agent → rp1-base/agent, rp1-dev:agent → rp1-dev/agent
    # This matches the subdirectory structure in OpenCode (agent/rp1-base/, agent/rp1-dev/)
    result = content.replace("rp1-base:", "rp1-base/")
    result = result.replace("rp1-dev:", "rp1-dev/")

    return result


def _extract_agent_reference(content: str) -> str | None:
    """Extract agent name with namespace if command delegates to a single agent.

    Returns None if no delegation or multiple agents (orchestrator pattern).
    Returns full namespace path for agent reference.

    Args:
        content: Command content to analyze

    Returns:
        Agent namespace (e.g., "rp1-dev:pr-visualizer") if exactly one agent, None otherwise
    """
    # Pattern: subagent_type: agent-name
    pattern = r"subagent_type:\s*([^\s\n]+)"
    matches = re.findall(pattern, content)

    # Only return agent if command delegates to exactly ONE agent
    # If multiple agents (orchestrator), return None
    if len(matches) == 1:
        agent_with_ns: str = matches[0]
        return agent_with_ns  # Return full namespace (e.g., "rp1-dev:pr-visualizer")
    return None


def _is_thin_wrapper_command(content: str) -> bool:
    """Check if command is a thin wrapper (just documentation, no actual execution logic).

    Thin wrapper commands just explain how to use the Task tool but don't execute anything.
    For OpenCode, these need to be converted to direct agent invocations.

    Args:
        content: Command content to check

    Returns:
        True if thin wrapper, False if has execution logic
    """
    # Heuristics for thin wrapper:
    # - Mentions "Task tool" or "subagent" in plain text
    # - Has code block showing subagent_type (documentation, not execution)
    # - Doesn't have actual @ mention invocations
    # - Short content (< 1000 chars) - just routing logic
    has_task_tool_explanation = "Task tool" in content or "invoke the" in content.lower()
    has_code_block = "```" in content
    no_at_mentions = "@" not in content or "@/rp1-" not in content
    is_short = len(content) < 1000

    return has_task_tool_explanation and has_code_block and no_at_mentions and is_short


def _create_direct_invocation(agent_namespace: str, description: str) -> str:
    """Create direct agent invocation for thin wrapper commands.

    Converts thin wrapper documentation to actual @ mention invocation.

    Args:
        agent_namespace: Full agent namespace (e.g., "rp1-dev:pr-visualizer")
        description: Command description

    Returns:
        Direct invocation prompt
    """
    # Convert namespace to path: rp1-dev:pr-visualizer → /rp1-dev/pr-visualizer
    agent_path = "/" + agent_namespace.replace(":", "/")

    # Create simple, direct invocation prompt
    return f"""# {description}

Invoke the agent to handle this task:

{agent_path}
"""


@safe
def transform_command(cc_cmd: ClaudeCodeCommand, registry: PlatformRegistry) -> OpenCodeCommand:
    """Transform Claude Code command to OpenCode format.

    Uses @safe decorator for automatic Result wrapping.

    Handles:
    - Metadata field mapping
    - Task tool invocation → @ mention pattern
    - Namespace preservation (/rp1-base:*, /rp1-dev:*)
    - Code block preservation (examples not transformed)

    Args:
        cc_cmd: Parsed Claude Code command
        registry: Platform registry with mappings

    Returns:
        OpenCodeCommand (wrapped in Result by @safe decorator)

    Raises:
        TransformationError: On transformation failures (wrapped in Failure)
    """
    # Transform namespace separator: rp1-base: → rp1-base/, rp1-dev: → rp1-dev/
    # This matches OpenCode's subdirectory structure
    transformed_content = _transform_task_tool_invocations(cc_cmd.content)

    # Build OpenCode command
    # NOTE: agent field always None - OpenCode's agent field runs as background agent
    # We want explicit invocation via prompt content instead
    return OpenCodeCommand(
        template=transformed_content,
        description=cc_cmd.description,
        argument_hint=cc_cmd.argument_hint,  # Pass through argument-hint for OpenCode
        agent=None,  # Always None - explicit invocation via prompt
        model=None,  # Inherit from OpenCode config
        subtask=False,
    )


def _transform_slash_command_calls(content: str) -> str:
    """Transform SlashCommand invocations to OpenCode command_invoke pattern.

    Preserves code examples (doesn't transform inside code blocks).

    Pattern: /rp1-base:knowledge-load → command_invoke("rp1-base:knowledge-load")

    Args:
        content: Agent content to transform

    Returns:
        Transformed content with command_invoke patterns
    """
    # Pattern: /rp1-(base|dev):command-name
    slash_pattern = r"/rp1-(base|dev):([a-z-]+)"

    # Find matches outside code blocks
    matches = _find_matches_outside_code_blocks(slash_pattern, content)

    # Replace in reverse order to preserve positions
    result = content
    for match in reversed(matches):
        plugin = match.group(1)
        command = match.group(2)
        replacement = f'command_invoke("rp1-{plugin}:{command}")'
        result = result[: match.start()] + replacement + result[match.end() :]

    return result


def _build_permissions_dict(tools: list[str]) -> dict[str, list[str]]:
    """Build OpenCode permissions dict from Claude Code tools list.

    Maps tools to permission categories:
    - file: read, write, edit
    - bash: execute
    - search: grep, glob

    Args:
        tools: List of Claude Code tool names

    Returns:
        OpenCode permissions dict
    """
    permissions: dict[str, list[str]] = {}

    # File permissions
    file_perms = []
    if "Read" in tools or "read_file" in tools:
        file_perms.append("read")
    if "Write" in tools or "write_file" in tools:
        file_perms.append("write")
    if "Edit" in tools or "edit_file" in tools:
        file_perms.append("edit")

    if file_perms:
        permissions["file"] = file_perms

    # Bash permissions
    if "Bash" in tools or "bash_run" in tools:
        permissions["bash"] = ["execute"]

    # Search permissions
    search_perms = []
    if "Grep" in tools or "grep_file" in tools:
        search_perms.append("grep")
    if "Glob" in tools or "glob_pattern" in tools:
        search_perms.append("glob")

    if search_perms:
        permissions["search"] = search_perms

    return permissions


@safe
def transform_agent(cc_agent: ClaudeCodeAgent, registry: PlatformRegistry) -> OpenCodeAgent:
    """Transform Claude Code agent to OpenCode format.

    Uses @safe decorator for automatic Result wrapping.

    Handles:
    - Tool permission mapping (Claude Code → OpenCode)
    - Mode setting (always "subagent")
    - Model specification format
    - SlashCommand → command_invoke transformation
    - Code block preservation

    Args:
        cc_agent: Parsed Claude Code agent
        registry: Platform registry with tool mappings

    Returns:
        OpenCodeAgent (wrapped in Result by @safe decorator)

    Raises:
        TransformationError: On transformation failures (wrapped in Failure)
    """
    # Map tools using registry (filter out None values)
    oc_tools: list[str] = []
    for tool in cc_agent.tools:
        mapped_tool = registry.tool_mappings.get(tool, tool)
        if mapped_tool is not None:
            oc_tools.append(mapped_tool)

    # Build permissions dict (OpenCode requires explicit permissions)
    permissions = _build_permissions_dict(cc_agent.tools)

    # Transform content: SlashCommand → command_invoke
    transformed_content = _transform_slash_command_calls(cc_agent.content)

    return OpenCodeAgent(
        name=cc_agent.name,
        description=cc_agent.description,
        mode="subagent",
        model=cc_agent.model,
        tools=oc_tools,
        permissions=permissions,
        content=transformed_content,
    )


def _transform_skill_invocations(content: str, skill_name: str) -> str:
    """Transform native skill invocations to opencode-skills pattern.

    Preserves code examples (doesn't transform inside code blocks).

    Pattern: Skill tool → skills_{name} tool

    Args:
        content: Skill content to transform
        skill_name: Name of the skill

    Returns:
        Transformed content with skills_{name} pattern
    """
    # In Claude Code, skills are invoked via Skill tool
    # In OpenCode, they're invoked via skills_{name} custom tool
    skill_pattern = rf"Skill tool.*?skill:\s*{re.escape(skill_name)}"

    # Find matches outside code blocks
    matches = _find_matches_outside_code_blocks(skill_pattern, content, re.DOTALL)

    # Replace in reverse order
    result = content
    for match in reversed(matches):
        replacement = f"skills_{skill_name} tool"
        result = result[: match.start()] + replacement + result[match.end() :]

    return result


@safe
def transform_skill(cc_skill: ClaudeCodeSkill, registry: PlatformRegistry) -> OpenCodeSkill:
    """Transform Claude Code skill to Anthropic Skills v1.0 format.

    Uses @safe decorator for automatic Result wrapping.

    Handles:
    - Description length validation (≥20 chars) - already validated by model
    - SKILL.md format compliance
    - Supporting file path adjustments
    - Skill invocation pattern transformation

    Args:
        cc_skill: Parsed Claude Code skill (already validated ≥20 char description)
        registry: Platform registry

    Returns:
        OpenCodeSkill (wrapped in Result by @safe decorator)

    Raises:
        ValidationError: If description <20 chars (already caught by Pydantic in parse phase)
        TransformationError: On transformation failures (wrapped in Failure)
    """
    # Transform skill invocation in content (native → skills_{name})
    transformed_content = _transform_skill_invocations(cc_skill.content, cc_skill.name)

    # OpenCodeSkill model validates description length automatically (Pydantic validator)
    return OpenCodeSkill(
        name=cc_skill.name,
        description=cc_skill.description,
        content=transformed_content,
        supporting_files=cc_skill.supporting_files,
    )
