"""Prerequisites checking module for OpenCode installation."""

import json
import subprocess
from pathlib import Path

from returns.result import safe


class PrerequisiteError(Exception):
    """Base class for prerequisite check errors."""

    pass


@safe
def check_opencode_installed() -> str:
    """Check if OpenCode CLI is installed and in PATH.

    Returns OpenCode version string if installed.
    Raises PrerequisiteError if not found.
    """
    result = subprocess.run(
        ["opencode", "--version"],
        capture_output=True,
        text=True,
        timeout=5,
    )

    if result.returncode == 0:
        return result.stdout.strip()
    else:
        raise PrerequisiteError("OpenCode CLI not found in PATH.\nInstallation: https://opencode.ai/docs/installation")


@safe
def check_opencode_version(version_str: str) -> None:
    """Validate OpenCode version is in supported range.

    Supported: >=0.8.0
    Tested: 0.9.x

    Args:
        version_str: Version string from OpenCode (e.g., "OpenCode 0.9.2")

    Raises:
        PrerequisiteError: If version is too old or incompatible
    """
    # Parse version (e.g., "OpenCode 0.9.2" → "0.9.2")
    version_parts = version_str.split()
    version = version_parts[-1]

    major, minor, *_ = version.split(".")
    major_int = int(major)
    minor_int = int(minor)

    # Check minimum version
    if major_int == 0 and minor_int < 8:
        raise PrerequisiteError(
            f"OpenCode version {version} is too old.\nMinimum required: 0.8.0\nTested versions: 0.9.x"
        )

    # Warn if not tested version (but don't fail)
    if major_int == 0 and minor_int > 9:
        print(f"⚠ Warning: OpenCode {version} not tested. Tested versions: 0.9.x")


@safe
def check_opencode_skills_plugin() -> bool:
    """Check if opencode-skills plugin is configured in opencode.json.

    Returns True if configured, False if not (non-blocking).
    This is non-blocking because skills are optional.
    """
    # Check for opencode-skills in OpenCode config
    config_dir = Path.home() / ".config" / "opencode"
    config_file = config_dir / "opencode.json"

    if not config_file.exists():
        return False  # No config yet, non-blocking

    with open(config_file) as f:
        config = json.load(f)

    # Check if plugin is configured
    if "plugin" in config:
        plugins = config["plugin"]
        if isinstance(plugins, list):
            # Check for opencode-skills with or without version pin
            return any("opencode-skills" in str(p) for p in plugins)
        elif isinstance(plugins, str):
            return "opencode-skills" in plugins

    return False  # Not found, non-blocking


@safe
def install_opencode_skills_plugin(config_path: Path) -> bool:
    """Install opencode-skills plugin by adding it to opencode.json.

    OpenCode will automatically install the plugin on next startup.
    This operation is idempotent - safe to call multiple times.

    Args:
        config_path: Path to opencode.json

    Returns:
        True if plugin was added, False if already present

    Raises:
        PrerequisiteError: If installation configuration fails
    """
    # Load existing config
    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
    else:
        config = {}

    # Add plugin configuration
    if "plugin" not in config:
        config["plugin"] = []

    # Ensure it's a list
    if isinstance(config["plugin"], str):
        config["plugin"] = [config["plugin"]]

    # Check if already present
    already_present = any("opencode-skills" in str(p) for p in config["plugin"])

    if not already_present:
        config["plugin"].append("opencode-skills")
        # Write updated config
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
        return True
    else:
        return False  # Already present, no change made


@safe
def check_write_permissions(target_dir: Path) -> None:
    """Check if we have write permissions to target directory.

    Args:
        target_dir: Directory to check permissions for

    Raises:
        PrerequisiteError: If permissions denied or cannot create directory
    """
    # Try to create target directory if it doesn't exist
    target_dir.mkdir(parents=True, exist_ok=True)

    # Try to write a test file
    test_file = target_dir / ".rp1-write-test"
    test_file.write_text("test")
    test_file.unlink()
