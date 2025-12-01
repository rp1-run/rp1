"""Configuration management module for OpenCode."""

import json
import shutil
from datetime import datetime
from pathlib import Path

from returns.result import safe


class ConfigError(Exception):
    """Base class for config errors."""

    pass


@safe
def backup_config(config_path: Path) -> Path:
    """Create backup of existing config file.

    Note: Currently unused in installation flow. Reserved for future
    update/rollback features that may perform destructive operations.

    Args:
        config_path: Path to opencode.json

    Returns:
        Path to backup file

    Raises:
        ConfigError: If backup operation fails
    """
    if not config_path.exists():
        return config_path  # No existing config, nothing to backup

    # Create backup directory
    backup_dir = Path.home() / ".opencode-rp1-backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    # Timestamp for backup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"{config_path.name}.backup.{timestamp}"

    # Copy file
    shutil.copy2(config_path, backup_path)

    return backup_path


@safe
def update_opencode_config(config_path: Path, rp1_version: str, skills: list[str]) -> None:
    """Update opencode.json with rp1 configuration.

    Note: OpenCode config only supports specific keys. Since opencode-skills plugin
    handles skill discovery automatically from ~/.config/opencode/skills/, we don't
    need to add custom_tools entries. The plugin field is already set by install_opencode_skills_plugin().

    Args:
        config_path: Path to opencode.json
        rp1_version: Version of rp1 being installed
        skills: List of skill names (for validation/logging only)

    Raises:
        ConfigError: If config update fails
    """
    # Load existing config
    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
    else:
        config = {}

    # OpenCode config schema doesn't support custom_tools or arbitrary metadata
    # The opencode-skills plugin automatically discovers skills from ~/.config/opencode/skills/
    # So we don't need to modify the config file for skills

    # Just ensure the config is valid (has required keys)
    if "plugin" not in config:
        config["plugin"] = []

    # Write config (preserving existing valid keys)
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
