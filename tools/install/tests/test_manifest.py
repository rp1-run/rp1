"""Tests for manifest module."""

import json
from pathlib import Path

from returns.pipeline import is_successful

from rp1_opencode.manifest import discover_plugins, load_manifest


def test_load_manifest_valid(tmp_path):
    """Test loading valid manifest."""
    manifest_file = tmp_path / "manifest.json"
    manifest_data = {
        "plugin": "rp1-base",
        "version": "2.6.0",
        "generated_at": "2025-11-23T00:00:00Z",
        "opencode_version_tested": "0.9.x",
        "artifacts": {"commands": ["cmd1", "cmd2"], "agents": ["agent1"], "skills": ["skill1"]},
    }

    with open(manifest_file, "w") as f:
        json.dump(manifest_data, f)

    result = load_manifest(manifest_file)

    assert is_successful(result)
    manifest = result.unwrap()
    assert manifest.plugin == "rp1-base"
    assert manifest.version == "2.6.0"
    assert len(manifest.commands) == 2
    assert len(manifest.agents) == 1
    assert len(manifest.skills) == 1
    assert manifest.total_artifacts == 4


def test_load_manifest_missing_file(tmp_path):
    """Test loading missing manifest."""
    manifest_file = tmp_path / "missing.json"

    result = load_manifest(manifest_file)

    assert not is_successful(result)
    error = str(result.failure())
    assert "not found" in error.lower()


def test_load_manifest_missing_fields(tmp_path):
    """Test loading manifest with missing required fields."""
    manifest_file = tmp_path / "manifest.json"
    manifest_data = {"plugin": "rp1-base"}  # Missing version, generated_at, etc.

    with open(manifest_file, "w") as f:
        json.dump(manifest_data, f)

    result = load_manifest(manifest_file)

    assert not is_successful(result)
    error = str(result.failure())
    assert "missing required fields" in error.lower()


def test_discover_plugins_multiple(tmp_path):
    """Test discovering multiple plugins."""
    # Create base plugin
    base_dir = tmp_path / "base"
    base_dir.mkdir()
    base_manifest = {
        "plugin": "rp1-base",
        "version": "2.6.0",
        "generated_at": "2025-11-23T00:00:00Z",
        "opencode_version_tested": "0.9.x",
        "artifacts": {"commands": ["cmd1"], "agents": [], "skills": ["skill1"]},
    }
    with open(base_dir / "manifest.json", "w") as f:
        json.dump(base_manifest, f)

    # Create dev plugin
    dev_dir = tmp_path / "dev"
    dev_dir.mkdir()
    dev_manifest = {
        "plugin": "rp1-dev",
        "version": "2.6.0",
        "generated_at": "2025-11-23T00:00:00Z",
        "opencode_version_tested": "0.9.x",
        "artifacts": {"commands": ["cmd2", "cmd3"], "agents": ["agent1"], "skills": []},
    }
    with open(dev_dir / "manifest.json", "w") as f:
        json.dump(dev_manifest, f)

    result = discover_plugins(tmp_path)

    assert is_successful(result)
    plugins = result.unwrap()
    assert len(plugins) == 2
    plugin_names = [p.plugin for p in plugins]
    assert "rp1-base" in plugin_names
    assert "rp1-dev" in plugin_names


def test_discover_plugins_none_found(tmp_path):
    """Test discovering when no manifests present."""
    result = discover_plugins(tmp_path)

    assert not is_successful(result)
    error = str(result.failure())
    assert "no plugin manifests found" in error.lower()


def test_discover_plugins_dir_not_found():
    """Test discovering when directory doesn't exist."""
    nonexistent = Path("/nonexistent/path")

    result = discover_plugins(nonexistent)

    assert not is_successful(result)
    error = str(result.failure())
    assert "not found" in error.lower()
