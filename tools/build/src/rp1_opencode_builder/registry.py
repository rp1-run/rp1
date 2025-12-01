"""Platform registry loader for transformation rules."""

from pathlib import Path
from typing import Any

import yaml
from returns.result import safe

from .models import PlatformRegistry


@safe
def load_registry(registry_path: Path | None = None) -> PlatformRegistry:
    """Load platform registry from YAML file with code defaults.

    Uses @safe decorator for automatic Result wrapping.

    The registry file contains simple mappings (directory names, tool names).
    Complex semantic transformations (Task tool → @ mention) are handled in code.

    Args:
        registry_path: Path to platform_registry.yaml file.
                      If None, uses default location (config/platform_registry.yaml).

    Returns:
        PlatformRegistry with merged YAML + code defaults (wrapped in Result by @safe)

    Raises:
        FileNotFoundError: If registry file doesn't exist
        yaml.YAMLError: If YAML is malformed
        ValidationError: If Pydantic validation fails

    Example:
        >>> result = load_registry()
        >>> if is_successful(result):
        ...     registry = result.unwrap()
        ...     print(registry.tool_mappings["Read"])  # "read_file"
    """
    if registry_path is None:
        # Default: config/platform_registry.yaml relative to this file
        config_dir = Path(__file__).parent.parent.parent / "config"
        registry_path = config_dir / "platform_registry.yaml"

    # Load YAML file
    with open(registry_path, encoding="utf-8") as f:
        yaml_data: dict[str, Any] = yaml.safe_load(f)

    # Merge YAML with code defaults (Pydantic handles defaults automatically)
    # YAML values override defaults where provided
    return PlatformRegistry(**yaml_data)
