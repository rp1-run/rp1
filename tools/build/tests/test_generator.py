"""Unit tests for generator module.

This module tests artifact generation functions in isolation.
"""

from returns.pipeline import is_successful

from rp1_opencode_builder.generator import (
    _indent_multiline,
    generate_agent_file,
    generate_command_file,
    generate_manifest,
    generate_skill_file,
)
from rp1_opencode_builder.models import OpenCodeAgent, OpenCodeCommand, OpenCodeSkill


class TestIndentMultiline:
    """Test multiline indentation helper."""

    def test_indent_single_line(self):
        """Test indenting a single line."""
        result = _indent_multiline("text", 2)
        assert result == "  text"

    def test_indent_multiple_lines(self):
        """Test indenting multiple lines."""
        result = _indent_multiline("line1\nline2\nline3", 4)
        assert result == "    line1\n    line2\n    line3"

    def test_indent_empty_lines_preserved(self):
        """Test that empty lines are preserved without indentation."""
        result = _indent_multiline("line1\n\nline3", 2)
        assert result == "  line1\n\n  line3"

    def test_indent_zero_spaces(self):
        """Test with zero indentation."""
        result = _indent_multiline("text", 0)
        assert result == "text"


class TestGenerateCommandFile:
    """Test command file generation."""

    def test_generate_command_basic(self):
        """Test basic command generation."""
        oc_cmd = OpenCodeCommand(
            template="Test command template content",
            description="Test description",
            agent=None,
            model=None,
            subtask=False,
        )

        result = generate_command_file(oc_cmd, "test-command")

        assert is_successful(result)
        filename, content = result.unwrap()
        assert filename == "test-command.md"
        # Check frontmatter
        assert content.startswith("---\n")
        assert "description: Test description" in content
        assert "---\n\n" in content  # Frontmatter closes, then blank line
        # Check prompt is AFTER frontmatter (not inside it)
        parts = content.split("---", 2)
        assert len(parts) == 3
        prompt_content = parts[2].strip()
        assert prompt_content == "Test command template content"

    def test_generate_command_with_agent(self):
        """Test that agent field is never included in OpenCode commands."""
        oc_cmd = OpenCodeCommand(
            template="Delegate to agent via @mention",
            description="Test",
            agent=None,  # Always None for OpenCode
            model=None,
            subtask=False,
        )

        result = generate_command_file(oc_cmd, "test")
        assert is_successful(result)
        _, content = result.unwrap()
        # Agent field should never appear in OpenCode command frontmatter
        assert "agent:" not in content
        assert "description: Test" in content

    def test_generate_command_with_model(self):
        """Test command generation with model specification."""
        oc_cmd = OpenCodeCommand(
            template="Content",
            description="Test",
            agent=None,
            model="claude-3-5-sonnet",
            subtask=False,
        )

        result = generate_command_file(oc_cmd, "test")
        assert is_successful(result)
        _, content = result.unwrap()
        assert "model: claude-3-5-sonnet" in content

    def test_generate_command_multiline_template(self):
        """Test command with multiline template content."""
        template = "Line 1\nLine 2\nLine 3"
        oc_cmd = OpenCodeCommand(
            template=template,
            description="Test",
            agent=None,
            model=None,
            subtask=False,
        )

        result = generate_command_file(oc_cmd, "test")
        assert is_successful(result)
        _, content = result.unwrap()
        # Prompt should be after frontmatter, not indented
        parts = content.split("---", 2)
        prompt_content = parts[2].strip()
        assert prompt_content == "Line 1\nLine 2\nLine 3"


class TestGenerateAgentFile:
    """Test agent file generation."""

    def test_generate_agent_basic(self):
        """Test basic agent generation."""
        oc_agent = OpenCodeAgent(
            name="test-agent",
            description="Test agent description",
            mode="subagent",
            model="inherit",
            tools=["read_file", "bash_run"],
            permissions={"file": ["read"], "bash": ["execute"]},
            content="Agent prompt content",
        )

        result = generate_agent_file(oc_agent)

        assert is_successful(result)
        filename, content = result.unwrap()
        assert filename == "test-agent.md"
        assert "---\n" in content
        assert "description: Test agent description" in content
        assert "mode: subagent" in content
        # model: inherit should be omitted (OpenCode doesn't support it)
        assert "model:" not in content
        assert "tools:" in content
        assert "bash: true" in content
        assert "Agent prompt content" in content

    def test_generate_agent_no_bash(self):
        """Test agent without bash tools."""
        oc_agent = OpenCodeAgent(
            name="test",
            description="Test",
            mode="subagent",
            model="inherit",
            tools=["read_file"],
            permissions={"file": ["read"]},
            content="Content",
        )

        result = generate_agent_file(oc_agent)
        assert is_successful(result)
        _, content = result.unwrap()
        assert "bash: false" in content

    def test_generate_agent_with_write_edit(self):
        """Test agent with write and edit permissions."""
        oc_agent = OpenCodeAgent(
            name="test",
            description="Test",
            mode="subagent",
            model="inherit",
            tools=["write_file", "edit_file"],
            permissions={"file": ["write", "edit"]},
            content="Content",
        )

        result = generate_agent_file(oc_agent)
        assert is_successful(result)
        _, content = result.unwrap()
        assert "write: true" in content
        assert "edit: true" in content


class TestGenerateSkillFile:
    """Test skill file generation."""

    def test_generate_skill_basic(self):
        """Test basic skill generation."""
        oc_skill = OpenCodeSkill(
            name="test-skill",
            description="This is a test skill with sufficient length for validation",
            content="Skill prompt content",
            supporting_files=[],
        )

        result = generate_skill_file(oc_skill)

        assert is_successful(result)
        skill_dir, skill_md, supporting = result.unwrap()
        assert skill_dir == "test-skill"
        assert "---\n" in skill_md
        assert "name: test-skill" in skill_md
        assert "description: This is a test skill" in skill_md
        assert "Skill prompt content" in skill_md
        assert supporting == []

    def test_generate_skill_with_supporting_files(self):
        """Test skill with supporting files."""
        oc_skill = OpenCodeSkill(
            name="test",
            description="Test skill with minimum twenty characters here",
            content="Content",
            supporting_files=["templates/template.md", "scripts/script.sh"],
        )

        result = generate_skill_file(oc_skill)
        assert is_successful(result)
        skill_dir, _, supporting = result.unwrap()
        assert skill_dir == "test"


class TestGenerateManifest:
    """Test manifest generation."""

    def test_generate_manifest_basic(self):
        """Test basic manifest generation."""
        result = generate_manifest(
            plugin_name="rp1-test",
            version="1.0.0",
            commands=["cmd1", "cmd2"],
            agents=["agent1"],
            skills=["skill1"],
        )

        assert is_successful(result)
        manifest_json = result.unwrap()
        assert '"plugin": "rp1-test"' in manifest_json
        assert '"version": "1.0.0"' in manifest_json
        assert '"cmd1"' in manifest_json
        assert '"cmd2"' in manifest_json
        assert '"opencode_version_tested": "0.9.x"' in manifest_json
        assert '"opencode_skills_required": true' in manifest_json

    def test_generate_manifest_no_skills(self):
        """Test manifest with no skills."""
        result = generate_manifest(
            plugin_name="rp1-dev",
            version="2.0.0",
            commands=["cmd1"],
            agents=["agent1"],
            skills=[],
        )

        assert is_successful(result)
        manifest_json = result.unwrap()
        assert '"opencode_skills_required": false' in manifest_json

    def test_generate_manifest_includes_installation_paths(self):
        """Test that manifest includes installation directory paths."""
        result = generate_manifest("test", "1.0.0", [], [], [])
        assert is_successful(result)
        manifest_json = result.unwrap()
        assert '"commands_dir": "~/.config/opencode/command/"' in manifest_json
        assert '"agents_dir": "~/.config/opencode/agent/"' in manifest_json
        assert '"skills_dir": "~/.config/opencode/skills/"' in manifest_json

    def test_generate_manifest_includes_requirements(self):
        """Test that manifest includes OpenCode version requirements."""
        result = generate_manifest("test", "1.0.0", [], [], [])
        assert is_successful(result)
        manifest_json = result.unwrap()
        assert '"opencode_version": ">=0.8.0"' in manifest_json
