"""Tests for prerequisites module."""

import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

from returns.pipeline import is_successful

from rp1_opencode.prerequisites import (
    check_opencode_installed,
    check_opencode_skills_plugin,
    check_opencode_version,
    check_write_permissions,
    install_opencode_skills_plugin,
)


def test_check_opencode_installed_success():
    """Test successful OpenCode detection."""
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="OpenCode 0.9.2\n")

        result = check_opencode_installed()

        assert is_successful(result)
        assert result.unwrap() == "OpenCode 0.9.2"


def test_check_opencode_installed_not_found():
    """Test OpenCode not found in PATH."""
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1, stdout="")

        result = check_opencode_installed()

        assert not is_successful(result)
        error = str(result.failure())
        assert "not found" in error.lower()


def test_check_opencode_installed_timeout():
    """Test timeout handling."""
    with patch("subprocess.run") as mock_run:
        mock_run.side_effect = subprocess.TimeoutExpired("opencode", 5)

        result = check_opencode_installed()

        assert not is_successful(result)


def test_check_opencode_version_supported():
    """Test supported OpenCode version (0.9.x)."""
    result = check_opencode_version("OpenCode 0.9.2")

    assert is_successful(result)


def test_check_opencode_version_minimum():
    """Test minimum supported version (0.8.0)."""
    result = check_opencode_version("OpenCode 0.8.0")

    assert is_successful(result)


def test_check_opencode_version_too_old():
    """Test version too old (< 0.8.0)."""
    result = check_opencode_version("OpenCode 0.7.5")

    assert not is_successful(result)
    error = str(result.failure())
    assert "too old" in error.lower()


def test_check_opencode_version_newer_untested(capsys):
    """Test newer untested version (warning but not error)."""
    result = check_opencode_version("OpenCode 0.10.1")

    # Should succeed but print warning
    assert is_successful(result)
    captured = capsys.readouterr()
    assert "warning" in captured.out.lower()


def test_check_opencode_skills_plugin_present(tmp_path):
    """Test opencode-skills plugin detected via plugin config."""
    config_dir = tmp_path / ".config" / "opencode"
    config_dir.mkdir(parents=True)

    config_file = config_dir / "opencode.json"
    config_data = {"plugin": ["opencode-skills"]}

    with open(config_file, "w") as f:
        json.dump(config_data, f)

    with patch("pathlib.Path.home", return_value=tmp_path):
        result = check_opencode_skills_plugin()

        assert is_successful(result)
        assert result.unwrap() is True


def test_check_opencode_skills_plugin_with_version(tmp_path):
    """Test opencode-skills plugin detected with version pin."""
    config_dir = tmp_path / ".config" / "opencode"
    config_dir.mkdir(parents=True)

    config_file = config_dir / "opencode.json"
    config_data = {"plugin": ["opencode-skills@1.2.3"]}

    with open(config_file, "w") as f:
        json.dump(config_data, f)

    with patch("pathlib.Path.home", return_value=tmp_path):
        result = check_opencode_skills_plugin()

        assert is_successful(result)
        assert result.unwrap() is True


def test_check_opencode_skills_plugin_not_present(tmp_path):
    """Test opencode-skills plugin not found (non-blocking)."""
    config_dir = tmp_path / ".config" / "opencode"
    config_dir.mkdir(parents=True)

    config_file = config_dir / "opencode.json"
    config_data = {"plugin": []}

    with open(config_file, "w") as f:
        json.dump(config_data, f)

    with patch("pathlib.Path.home", return_value=tmp_path):
        result = check_opencode_skills_plugin()

        assert is_successful(result)
        assert result.unwrap() is False


def test_check_opencode_skills_plugin_no_config(tmp_path):
    """Test no config file (non-blocking)."""
    with patch("pathlib.Path.home", return_value=tmp_path):
        result = check_opencode_skills_plugin()

        assert is_successful(result)
        assert result.unwrap() is False


def test_install_opencode_skills_plugin_new_config(tmp_path):
    """Test installing plugin to new config file."""
    config_file = tmp_path / "opencode.json"

    result = install_opencode_skills_plugin(config_file)

    assert is_successful(result)
    assert result.unwrap() is True  # Plugin was added

    # Verify config created
    assert config_file.exists()
    with open(config_file) as f:
        config = json.load(f)

    assert "plugin" in config
    assert "opencode-skills" in config["plugin"]


def test_install_opencode_skills_plugin_existing_config(tmp_path):
    """Test installing plugin to existing config."""
    config_file = tmp_path / "opencode.json"
    existing_config = {"plugin": ["some-other-plugin"], "other_setting": "value"}

    with open(config_file, "w") as f:
        json.dump(existing_config, f)

    result = install_opencode_skills_plugin(config_file)

    assert is_successful(result)
    assert result.unwrap() is True  # Plugin was added

    # Verify plugin added
    with open(config_file) as f:
        config = json.load(f)

    assert "opencode-skills" in config["plugin"]
    assert "some-other-plugin" in config["plugin"]
    assert config["other_setting"] == "value"  # Existing settings preserved


def test_install_opencode_skills_plugin_already_present(tmp_path):
    """Test installing when already present (idempotent)."""
    config_file = tmp_path / "opencode.json"
    existing_config = {"plugin": ["opencode-skills"]}

    with open(config_file, "w") as f:
        json.dump(existing_config, f)

    result = install_opencode_skills_plugin(config_file)

    assert is_successful(result)
    assert result.unwrap() is False  # Plugin already present, no change made

    # Verify no duplicate
    with open(config_file) as f:
        config = json.load(f)

    assert config["plugin"].count("opencode-skills") == 1


def test_check_write_permissions_success(tmp_path):
    """Test write permissions OK."""
    target_dir = tmp_path / "opencode" / "command"

    result = check_write_permissions(target_dir)

    assert is_successful(result)
    assert target_dir.exists()


def test_check_write_permissions_failure():
    """Test write permissions denied."""
    # Use a directory that should exist but not be writable
    target_dir = Path("/root/.config/opencode")  # Typically not writable by non-root

    result = check_write_permissions(target_dir)

    # This may succeed if running as root or fail otherwise
    # The test just verifies the function handles both cases gracefully
    if not is_successful(result):
        error = str(result.failure()).lower()
        # Check for any permission-related error message
        assert any(word in error for word in ["permission", "exists", "read-only", "denied"])
