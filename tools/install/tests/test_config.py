"""Tests for config module."""

import json
from unittest.mock import patch

from returns.pipeline import is_successful

from rp1_opencode.config import backup_config, update_opencode_config


def test_backup_config_success(tmp_path):
    """Test config backup with existing config."""
    config_file = tmp_path / "opencode.json"
    config_file.write_text('{"test": "data"}')

    with patch("pathlib.Path.home", return_value=tmp_path):
        result = backup_config(config_file)

        assert is_successful(result)
        backup_path = result.unwrap()

        # Verify backup created
        assert backup_path.exists()
        assert backup_path.read_text() == '{"test": "data"}'


def test_backup_config_no_existing(tmp_path):
    """Test backup when config doesn't exist."""
    config_file = tmp_path / "opencode.json"

    with patch("pathlib.Path.home", return_value=tmp_path):
        result = backup_config(config_file)

        # Should succeed and return the path (no backup needed)
        assert is_successful(result)
        assert result.unwrap() == config_file


def test_update_opencode_config_new_file(tmp_path):
    """Test updating config when file doesn't exist."""
    config_file = tmp_path / "opencode.json"
    test_skills = ["maestro", "mermaid", "markdown-preview", "knowledge-base-templates"]

    result = update_opencode_config(config_file, "1.0.0", test_skills)

    assert is_successful(result)

    # Verify config created
    assert config_file.exists()
    with open(config_file) as f:
        config = json.load(f)

    # OpenCode-skills auto-discovers from skills/ directory, no config needed
    assert "plugin" in config
    assert isinstance(config["plugin"], list)


def test_update_opencode_config_existing_file(tmp_path):
    """Test updating existing config preserves valid keys."""
    config_file = tmp_path / "opencode.json"
    existing_config = {"plugin": ["other-plugin"], "model": "anthropic/claude-3-5-sonnet-20241022"}
    test_skills = ["maestro", "mermaid", "markdown-preview", "knowledge-base-templates"]

    with open(config_file, "w") as f:
        json.dump(existing_config, f)

    result = update_opencode_config(config_file, "1.0.0", test_skills)

    assert is_successful(result)

    # Verify config updated
    with open(config_file) as f:
        config = json.load(f)

    # Check existing valid settings preserved
    assert "model" in config
    assert config["model"] == "anthropic/claude-3-5-sonnet-20241022"
    assert "plugin" in config


def test_update_opencode_config_preserves_schema(tmp_path):
    """Test that config preserves valid OpenCode schema keys."""
    config_file = tmp_path / "opencode.json"
    existing_config = {
        "$schema": "https://opencode.ai/config.json",
        "plugin": ["other-plugin"],
        "model": "anthropic/claude-3-5-sonnet-20241022",
        "theme": "dark",
    }
    test_skills = ["maestro", "mermaid"]

    with open(config_file, "w") as f:
        json.dump(existing_config, f)

    result = update_opencode_config(config_file, "1.0.0", test_skills)

    assert is_successful(result)

    # Verify valid keys preserved
    with open(config_file) as f:
        config = json.load(f)

    assert "$schema" in config
    assert "model" in config
    assert "theme" in config
    assert "plugin" in config


def test_update_opencode_config_minimal_valid_config(tmp_path):
    """Test that config is minimal and valid (no invalid keys)."""
    config_file = tmp_path / "opencode.json"
    test_skills = ["maestro", "mermaid", "markdown-preview", "knowledge-base-templates"]

    result = update_opencode_config(config_file, "1.0.0", test_skills)

    assert is_successful(result)

    with open(config_file) as f:
        config = json.load(f)

    # Should only have plugin field (minimal valid config)
    assert "plugin" in config
    # Should NOT have invalid keys
    assert "custom_tools" not in config
    assert "rp1" not in config
