"""Data models for installation tool."""

from dataclasses import dataclass


@dataclass
class PluginManifest:
    """Plugin manifest data from manifest.json."""

    plugin: str
    version: str
    generated_at: str
    opencode_version_tested: str
    commands: list[str]
    agents: list[str]
    skills: list[str]

    @property
    def total_artifacts(self) -> int:
        """Total count of artifacts in this plugin."""
        return len(self.commands) + len(self.agents) + len(self.skills)
