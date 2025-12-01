"""Manifest parsing module for plugin metadata."""

import json
from pathlib import Path

from returns.result import safe

from rp1_opencode.models import PluginManifest


class ManifestError(Exception):
    """Base class for manifest errors."""

    pass


@safe
def load_manifest(manifest_path: Path) -> PluginManifest:
    """Load and parse plugin manifest.json.

    Args:
        manifest_path: Path to manifest.json file

    Returns:
        PluginManifest with metadata

    Raises:
        ManifestError: If manifest is missing or invalid
    """
    if not manifest_path.exists():
        raise ManifestError(f"Manifest not found: {manifest_path}")

    with open(manifest_path) as f:
        data = json.load(f)

    # Validate required fields
    required_fields = ["plugin", "version", "generated_at", "opencode_version_tested", "artifacts"]
    missing_fields = [f for f in required_fields if f not in data]

    if missing_fields:
        raise ManifestError(f"Manifest missing required fields: {', '.join(missing_fields)}")

    artifacts = data["artifacts"]
    if not isinstance(artifacts, dict):
        raise ManifestError("Manifest 'artifacts' must be an object")

    return PluginManifest(
        plugin=data["plugin"],
        version=data["version"],
        generated_at=data["generated_at"],
        opencode_version_tested=data["opencode_version_tested"],
        commands=artifacts.get("commands", []),
        agents=artifacts.get("agents", []),
        skills=artifacts.get("skills", []),
    )


@safe
def discover_plugins(artifacts_dir: Path) -> list[PluginManifest]:
    """Discover all plugins in artifacts directory.

    Args:
        artifacts_dir: Path to artifacts directory (e.g., dist/opencode/)

    Returns:
        List of plugin manifests discovered

    Raises:
        ManifestError: If discovery fails
    """
    if not artifacts_dir.exists():
        raise ManifestError(f"Artifacts directory not found: {artifacts_dir}")

    plugins: list[PluginManifest] = []

    # Scan for plugin directories (each should have manifest.json)
    for plugin_dir in artifacts_dir.iterdir():
        if not plugin_dir.is_dir():
            continue

        manifest_path = plugin_dir / "manifest.json"
        if manifest_path.exists():
            manifest = load_manifest(manifest_path).unwrap()
            plugins.append(manifest)

    if not plugins:
        raise ManifestError(f"No plugin manifests found in {artifacts_dir}")

    return plugins
