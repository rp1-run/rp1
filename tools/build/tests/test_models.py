"""Unit tests for data models."""

from rp1_opencode_builder.models import PlatformRegistry


class TestPlatformRegistry:
    """Tests for PlatformRegistry model."""

    def test_default_directory_mappings(self) -> None:
        """Test default directory mappings include critical paths."""
        registry = PlatformRegistry()

        assert registry.directory_mappings["agents"] == "agent"
        assert registry.directory_mappings["commands"] == "command"

    def test_default_tool_mappings_coverage(self) -> None:
        """Test default tool mappings include all critical tools."""
        registry = PlatformRegistry()

        # Core file operations
        assert registry.tool_mappings["Read"] == "read_file"
        assert registry.tool_mappings["Write"] == "write_file"
        assert registry.tool_mappings["Bash"] == "bash_run"

        # Agent coordination (semantic transformations)
        assert registry.tool_mappings["Task"] == "@mention"
        assert registry.tool_mappings["SlashCommand"] == "command_invoke"
        assert registry.tool_mappings["Skill"] == "skills_{name}"

        # Unavailable tools
        assert registry.tool_mappings["ExitPlanMode"] is None

    def test_custom_mappings_override_defaults(self) -> None:
        """Test that custom mappings properly override defaults."""
        registry = PlatformRegistry(
            directory_mappings={"agents": "custom_agent"}, tool_mappings={"CustomTool": "custom_tool"}
        )

        assert registry.directory_mappings["agents"] == "custom_agent"
        assert registry.tool_mappings["CustomTool"] == "custom_tool"
