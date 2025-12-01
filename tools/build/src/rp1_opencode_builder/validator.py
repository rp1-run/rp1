"""Validation module for OpenCode artifacts.

This module provides L1 (syntax) and L2 (schema) validation for generated artifacts.
All functions use the @safe decorator pattern for automatic Result wrapping.
"""

import yaml
from returns.result import safe


class ValidationError(Exception):
    """Base class for validation errors."""

    pass


# L1: Syntax Validation


@safe
def validate_command_syntax(content: str) -> None:
    """L1: Validate OpenCode command has valid YAML frontmatter.

    Uses @safe decorator for automatic Result wrapping.
    Raises ValidationError on failures (automatically wrapped in Failure).

    Args:
        content: Command markdown content with frontmatter

    Returns:
        None on success

    Raises:
        ValidationError: If syntax is invalid (wrapped in Failure by @safe)
    """
    # Extract frontmatter
    if not content.startswith("---"):
        raise ValidationError("Command must start with YAML frontmatter (---)")

    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValidationError("Invalid frontmatter structure (must have opening and closing ---)")

    frontmatter_text = parts[1]

    # Parse YAML (will raise yaml.YAMLError if invalid, caught by @safe)
    try:
        yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as e:
        raise ValidationError(f"Invalid YAML in frontmatter: {e}") from e


@safe
def validate_agent_syntax(content: str) -> None:
    """L1: Validate OpenCode agent has valid YAML frontmatter.

    Uses @safe decorator for automatic Result wrapping.
    OpenCode agents use markdown format (not JSON) per OpenCode docs.

    Args:
        content: Agent markdown content with frontmatter

    Returns:
        None on success

    Raises:
        ValidationError: If syntax is invalid (wrapped in Failure by @safe)
    """
    # Extract frontmatter
    if not content.startswith("---"):
        raise ValidationError("Agent must start with YAML frontmatter (---)")

    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValidationError("Invalid frontmatter structure (must have opening and closing ---)")

    frontmatter_text = parts[1]

    # Parse YAML (will raise yaml.YAMLError if invalid, caught by @safe)
    try:
        yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as e:
        raise ValidationError(f"Invalid YAML in frontmatter: {e}") from e


@safe
def validate_skill_syntax(content: str) -> None:
    """L1: Validate skill has valid YAML frontmatter (Anthropic Skills v1.0).

    Uses @safe decorator for automatic Result wrapping.

    Args:
        content: Skill markdown content with frontmatter

    Returns:
        None on success

    Raises:
        ValidationError: If syntax is invalid (wrapped in Failure by @safe)
    """
    # Extract frontmatter
    if not content.startswith("---"):
        raise ValidationError("Skill must start with YAML frontmatter (---)")

    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValidationError("Invalid frontmatter structure (must have opening and closing ---)")

    frontmatter_text = parts[1]

    # Parse YAML (will raise yaml.YAMLError if invalid, caught by @safe)
    try:
        yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as e:
        raise ValidationError(f"Invalid YAML in frontmatter: {e}") from e


# L2: Schema Validation


@safe
def validate_command_schema(content: str) -> None:
    """L2: Validate OpenCode command has required fields.

    Uses @safe decorator for automatic Result wrapping.

    Args:
        content: Command markdown content with frontmatter

    Returns:
        None on success

    Raises:
        ValidationError: If schema is invalid (wrapped in Failure by @safe)
    """
    # Parse frontmatter and content
    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValidationError("Command must have frontmatter and content")

    frontmatter_text = parts[1]
    prompt_content = parts[2].strip()

    metadata = yaml.safe_load(frontmatter_text)

    if metadata is None:
        raise ValidationError("Frontmatter is empty")

    # Check required fields (only description in frontmatter)
    if "description" not in metadata:
        raise ValidationError("Missing required field: description")

    # Validate field types
    if not isinstance(metadata["description"], str):
        raise ValidationError("Field 'description' must be string")

    # Validate that prompt content exists after frontmatter
    if not prompt_content:
        raise ValidationError("Command must have prompt content after frontmatter")


@safe
def validate_agent_schema(content: str) -> None:
    """L2: Validate OpenCode agent has required fields.

    Uses @safe decorator for automatic Result wrapping.

    Args:
        content: Agent markdown content with frontmatter

    Returns:
        None on success

    Raises:
        ValidationError: If schema is invalid (wrapped in Failure by @safe)
    """
    # Parse frontmatter
    parts = content.split("---", 2)
    frontmatter_text = parts[1]
    metadata = yaml.safe_load(frontmatter_text)

    if metadata is None:
        raise ValidationError("Frontmatter is empty")

    # Check required fields
    required_fields = ["description", "mode", "tools"]
    missing_fields = [f for f in required_fields if f not in metadata]

    if missing_fields:
        raise ValidationError(f"Missing required fields: {', '.join(missing_fields)}")

    # Validate mode
    if metadata["mode"] != "subagent":
        raise ValidationError(f"Agent mode must be 'subagent', got '{metadata['mode']}'")

    # Validate tools is dict (OpenCode format: {bash: true, write: false})
    if not isinstance(metadata["tools"], dict):
        raise ValidationError(f"Field 'tools' must be object (dict), got {type(metadata['tools']).__name__}")


@safe
def validate_skill_schema(content: str) -> None:
    """L2: Validate skill has required fields (Anthropic Skills v1.0).

    Uses @safe decorator for automatic Result wrapping.

    Args:
        content: Skill markdown content with frontmatter

    Returns:
        None on success

    Raises:
        ValidationError: If schema is invalid (wrapped in Failure by @safe)
    """
    parts = content.split("---", 2)
    frontmatter_text = parts[1]
    metadata = yaml.safe_load(frontmatter_text)

    if metadata is None:
        raise ValidationError("Frontmatter is empty")

    # Check required fields
    required_fields = ["name", "description"]
    missing_fields = [f for f in required_fields if f not in metadata]

    if missing_fields:
        raise ValidationError(f"Missing required fields: {', '.join(missing_fields)}")

    # Validate description length (Anthropic Skills v1.0 requirement)
    if len(metadata["description"]) < 20:
        raise ValidationError(
            f"Description too short (must be ≥20 chars): '{metadata['description']}' (length: {len(metadata['description'])})"
        )
