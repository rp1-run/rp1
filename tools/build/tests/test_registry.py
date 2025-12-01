"""Unit tests for platform registry loader."""

from pathlib import Path

from returns.pipeline import is_successful

from rp1_opencode_builder.registry import load_registry


class TestRegistryLoader:
    """Test platform registry loading."""

    def test_load_registry_default_path(self):
        """Test loading registry from default path."""
        result = load_registry()

        assert is_successful(result)
        registry = result.unwrap()

        # Verify directory mappings loaded
        assert registry.directory_mappings["agents"] == "agent"
        assert registry.directory_mappings["commands"] == "command"

        # Verify tool mappings loaded
        assert registry.tool_mappings["Read"] == "read_file"
        assert registry.tool_mappings["Write"] == "write_file"
        assert registry.tool_mappings["Bash"] == "bash_run"

    def test_load_registry_has_code_defaults(self):
        """Test that registry merges YAML with code defaults."""
        result = load_registry()

        assert is_successful(result)
        registry = result.unwrap()

        # Check tool mappings (defined in both YAML and code)
        assert "Read" in registry.tool_mappings
        assert "Write" in registry.tool_mappings
        assert "Bash" in registry.tool_mappings

        # Check special tools
        assert registry.tool_mappings["ExitPlanMode"] is None

    def test_load_registry_nonexistent_file(self):
        """Test loading registry with nonexistent file."""
        result = load_registry(Path("/nonexistent/path/registry.yaml"))

        # Should fail with FileNotFoundError wrapped in Failure
        assert not is_successful(result)

    def test_load_registry_validates_structure(self):
        """Test that invalid YAML structure is caught."""
        # Create temporary invalid YAML file
        import tempfile

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            # Write invalid structure (missing required fields)
            f.write("invalid: yaml: structure: here:")
            f.flush()
            temp_path = Path(f.name)

        try:
            result = load_registry(temp_path)
            # Should fail due to invalid YAML
            assert not is_successful(result)
        finally:
            temp_path.unlink()


class TestRegistryMappings:
    """Test specific registry mappings."""

    def test_directory_mappings_complete(self):
        """Test all directory mappings are present."""
        result = load_registry()
        registry = result.unwrap()

        assert "agents" in registry.directory_mappings
        assert "commands" in registry.directory_mappings

    def test_tool_mappings_file_operations(self):
        """Test file operation tool mappings."""
        result = load_registry()
        registry = result.unwrap()

        assert registry.tool_mappings["Read"] == "read_file"
        assert registry.tool_mappings["Write"] == "write_file"
        assert registry.tool_mappings["Edit"] == "edit_file"

    def test_tool_mappings_execution(self):
        """Test execution tool mappings."""
        result = load_registry()
        registry = result.unwrap()

        assert registry.tool_mappings["Bash"] == "bash_run"

    def test_tool_mappings_search(self):
        """Test search tool mappings."""
        result = load_registry()
        registry = result.unwrap()

        assert registry.tool_mappings["Grep"] == "grep_file"
        assert registry.tool_mappings["Glob"] == "glob_pattern"

    def test_tool_mappings_semantic_transformations(self):
        """Test semantic transformation markers."""
        result = load_registry()
        registry = result.unwrap()

        # These are markers for code-based transformations
        assert registry.tool_mappings["Task"] == "@mention"
        assert registry.tool_mappings["SlashCommand"] == "command_invoke"
        assert registry.tool_mappings["Skill"] == "skills_{name}"
