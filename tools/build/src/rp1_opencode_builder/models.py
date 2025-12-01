"""Type-safe data models for Claude Code and OpenCode artifacts."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ClaudeCodeCommand(BaseModel):
    """Parsed Claude Code command with frontmatter.

    Represents a command from Claude Code's .claude-plugin/commands/ directory
    with YAML frontmatter and markdown content.

    All fields except 'updated' and 'argument_hint' are required.
    Pydantic validates these automatically.
    """

    name: str
    version: str
    description: str
    argument_hint: str | None = Field(default=None, alias="argument-hint")
    tags: list[str]
    created: str
    updated: str | None = None
    author: str
    content: str

    model_config = {
        "frozen": True,  # Immutable after creation
        "str_strip_whitespace": True,  # Strip whitespace from strings
        "coerce_numbers_to_str": True,  # Allow number -> string conversion
        "populate_by_name": True,  # Allow both argument_hint and argument-hint
    }


class ClaudeCodeAgent(BaseModel):
    """Parsed Claude Code agent with frontmatter.

    Represents an agent from Claude Code's .claude-plugin/agents/ directory
    with YAML frontmatter specifying tools, model, and prompt content.
    """

    name: str
    description: str
    tools: list[str]
    model: str
    content: str

    model_config = {"frozen": True}


class ClaudeCodeSkill(BaseModel):
    """Parsed Claude Code skill (SKILL.md).

    Represents a skill from Claude Code's .claude-plugin/skills/ directory
    with SKILL.md file and optional supporting files (templates, scripts).
    """

    name: str
    description: str
    content: str
    supporting_files: list[str] = Field(default_factory=list)

    @field_validator("description")
    @classmethod
    def validate_description_length(cls, v: str) -> str:
        """Validate description meets Anthropic Skills v1.0 requirement (≥20 chars)."""
        if len(v) < 20:
            raise ValueError(f"Skill description must be ≥20 characters, got {len(v)}: {v}")
        return v

    model_config = {"frozen": True}


class OpenCodeCommand(BaseModel):
    """OpenCode command with required frontmatter.

    OpenCode commands use YAML frontmatter with specific fields for
    command template, description, and optional agent delegation.
    """

    template: str
    description: str
    argument_hint: str | None = Field(default=None, alias="argument-hint")
    agent: str | None = None
    model: str | None = None
    subtask: bool = False

    model_config = {
        "frozen": True,
        "populate_by_name": True,  # Allow both argument_hint and argument-hint
    }


class OpenCodeAgent(BaseModel):
    """OpenCode agent configuration.

    OpenCode agents require explicit configuration with mode, tools,
    and permissions for security and capability management.
    """

    name: str
    description: str
    mode: Literal["subagent"] = "subagent"
    model: str
    tools: list[str]
    permissions: dict[str, list[str]] = Field(default_factory=dict)
    content: str

    model_config = {"frozen": True}


class OpenCodeSkill(BaseModel):
    """OpenCode skill (Anthropic Skills v1.0).

    Skills in OpenCode must conform to Anthropic Skills v1.0 spec
    and are accessed via the opencode-skills plugin.
    """

    name: str
    description: str
    content: str
    supporting_files: list[str] = Field(default_factory=list)

    @field_validator("description")
    @classmethod
    def validate_description_length(cls, v: str) -> str:
        """Validate description meets Anthropic Skills v1.0 requirement (≥20 chars)."""
        if len(v) < 20:
            raise ValueError(f"Skill description must be ≥20 characters, got {len(v)}: {v}")
        return v

    model_config = {"frozen": True}


class PlatformRegistry(BaseModel):
    """Registry of platform differences between Claude Code and OpenCode.

    This registry documents known differences and provides mapping rules
    for transforming Claude Code artifacts to OpenCode format.

    Attributes:
        directory_mappings: Path transformations (e.g., agents/ → agent/)
        tool_mappings: Tool name mappings (e.g., Read → read_file)
        metadata_mappings: Metadata field mappings
    """

    directory_mappings: dict[str, str] = Field(
        default={
            "agents": "agent",
            "commands": "command",
        }
    )

    tool_mappings: dict[str, str | None] = Field(
        default={
            # Direct file operation mappings
            "Read": "read_file",
            "Write": "write_file",
            "Edit": "edit_file",
            "NotebookEdit": "edit_notebook_cell",
            # Search and discovery mappings
            "Grep": "grep_file",
            "Glob": "glob_pattern",
            # Execution mappings
            "Bash": "bash_run",
            "BashOutput": "get_bash_output",
            "KillShell": "kill_bash",
            # Agent coordination (semantic transformations)
            "Task": "@mention",
            "SlashCommand": "command_invoke",
            "Skill": "skills_{name}",
            # Web and external
            "WebFetch": "web_fetch",
            "WebSearch": "web_search",
            # Interaction
            "AskUserQuestion": "ask_user",
            "TodoWrite": "manage_todos",
            # Special tools (Claude Code specific)
            "ExitPlanMode": None,
        }
    )

    metadata_mappings: dict[str, str] = Field(
        default={
            "name": "name",
            "version": "version",
            "description": "description",
            "argument-hint": "argument-hint",
            "tags": "tags",
            "created": "created",
            "author": "author",
        }
    )
