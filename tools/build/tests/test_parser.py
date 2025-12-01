"""Unit tests for parser module."""

from pathlib import Path

import pytest
from pydantic import ValidationError
from returns.pipeline import is_successful

from rp1_opencode_builder.parser import parse_agent, parse_command, parse_skill


@pytest.fixture
def temp_dir(tmp_path: Path) -> Path:
    """Create temporary directory for test files."""
    return tmp_path


class TestParseCommand:
    """Tests for parse_command function."""

    def test_parse_valid_command_with_all_fields(self, temp_dir: Path) -> None:
        """Test parsing a command with all fields including optional ones."""
        cmd_file = temp_dir / "test-command.md"
        cmd_file.write_text(
            """---
name: test-command
version: 1.0.0
description: Test command description
tags: [test, example]
created: 2025-01-01
updated: 2025-01-02
author: test-author
---

Command content here.
"""
        )

        result = parse_command(cmd_file)

        assert is_successful(result)
        cmd = result.unwrap()
        # Verify critical fields were parsed
        assert cmd.name == "test-command"
        assert cmd.tags == ["test", "example"]
        assert str(cmd.updated) == "2025-01-02"
        assert "Command content here" in cmd.content

    def test_parse_command_with_multiline_content(self, temp_dir: Path) -> None:
        """Test parsing command with multiline content."""
        cmd_file = temp_dir / "test-command.md"
        cmd_file.write_text(
            """---
name: test-command
version: 1.0.0
description: Test command
tags: [test]
created: 2025-01-01
author: test-author
---

Line 1
Line 2
Line 3
"""
        )

        result = parse_command(cmd_file)

        assert is_successful(result)
        cmd = result.unwrap()
        assert "Line 1" in cmd.content
        assert "Line 2" in cmd.content
        assert "Line 3" in cmd.content

    def test_parse_command_missing_required_field(self, temp_dir: Path) -> None:
        """Test that parser rejects command missing required field."""
        cmd_file = temp_dir / "test-command.md"
        cmd_file.write_text(
            """---
name: test-command
version: 1.0.0
tags: [test]
created: 2025-01-01
author: test-author
---

Content
"""
        )

        result = parse_command(cmd_file)

        assert not is_successful(result)
        # Pydantic raises ValidationError for missing fields
        assert isinstance(result.failure(), ValidationError)
        assert "description" in str(result.failure()).lower() or "field required" in str(result.failure()).lower()

    def test_parse_command_file_not_found(self, temp_dir: Path) -> None:
        """Test appropriate error when command file doesn't exist."""
        cmd_file = temp_dir / "nonexistent.md"

        result = parse_command(cmd_file)

        assert not is_successful(result)
        error = result.failure()
        # Standard FileNotFoundError raised by open()
        assert isinstance(error, FileNotFoundError)
        assert "not found" in str(error).lower() or "no such file" in str(error).lower()

    def test_parse_command_invalid_yaml(self, temp_dir: Path) -> None:
        """Test handling of malformed YAML frontmatter."""
        cmd_file = temp_dir / "test-command.md"
        cmd_file.write_text(
            """---
name: test-command
version: 1.0.0
description: Test command
tags: [test, unclosed
created: 2025-01-01
author: test-author
---

Content
"""
        )

        result = parse_command(cmd_file)

        assert not is_successful(result)
        error = result.failure()
        # @safe decorator catches yaml.ParserError, not just ParseError
        assert error is not None  # Just verify error exists


class TestParseAgent:
    """Tests for parse_agent function."""

    def test_parse_agent_with_list_tools(self, temp_dir: Path) -> None:
        """Test parsing agent with tools as YAML list."""
        agent_file = temp_dir / "test-agent.md"
        agent_file.write_text(
            """---
name: test-agent
description: Test agent description
tools: [Read, Write, Bash]
model: claude-sonnet-4
---

Agent prompt content here.
"""
        )

        result = parse_agent(agent_file)

        assert is_successful(result)
        agent = result.unwrap()
        assert agent.tools == ["Read", "Write", "Bash"]
        assert "Agent prompt content here" in agent.content

    def test_parse_agent_with_comma_separated_tools(self, temp_dir: Path) -> None:
        """Test parsing agent with tools as comma-separated string."""
        agent_file = temp_dir / "test-agent.md"
        agent_file.write_text(
            """---
name: test-agent
description: Test agent description
tools: Read, Write, Bash
model: claude-sonnet-4
---

Agent prompt
"""
        )

        result = parse_agent(agent_file)

        assert is_successful(result)
        agent = result.unwrap()
        # Verify parser correctly splits comma-separated tools
        assert agent.tools == ["Read", "Write", "Bash"]

    def test_parse_agent_missing_required_field(self, temp_dir: Path) -> None:
        """Test that parser rejects agent missing required field."""
        agent_file = temp_dir / "test-agent.md"
        agent_file.write_text(
            """---
name: test-agent
tools: [Read, Write]
model: claude-sonnet-4
---

Content
"""
        )

        result = parse_agent(agent_file)

        assert not is_successful(result)
        error = result.failure()
        # Pydantic raises ValidationError for missing required fields
        assert isinstance(error, ValidationError)
        assert "description" in str(error).lower()

    def test_parse_agent_invalid_tools_type(self, temp_dir: Path) -> None:
        """Test handling of invalid tools field type (not list or string)."""
        agent_file = temp_dir / "test-agent.md"
        agent_file.write_text(
            """---
name: test-agent
description: Test agent
tools: 123
model: claude-sonnet-4
---

Content
"""
        )

        result = parse_agent(agent_file)

        assert not is_successful(result)
        error = result.failure()
        # Pydantic raises ValidationError for invalid field types
        assert isinstance(error, ValidationError)
        assert "tools" in str(error).lower()


class TestParseSkill:
    """Tests for parse_skill function."""

    def test_parse_skill_discovers_supporting_files(self, temp_dir: Path) -> None:
        """Test that parser discovers supporting files in known subdirectories."""
        skill_dir = temp_dir / "test-skill"
        skill_dir.mkdir()

        skill_md = skill_dir / "SKILL.md"
        skill_md.write_text(
            """---
name: test-skill
description: Test skill description that is at least 20 characters long
---

Skill content here.
"""
        )

        # Create supporting files in multiple subdirectories
        templates_dir = skill_dir / "templates"
        templates_dir.mkdir()
        (templates_dir / "example.md").write_text("Template content")

        scripts_dir = skill_dir / "scripts"
        scripts_dir.mkdir()
        (scripts_dir / "helper.py").write_text("# Script content")

        result = parse_skill(skill_dir)

        assert is_successful(result)
        skill = result.unwrap()
        # Verify both supporting files were discovered
        assert len(skill.supporting_files) == 2
        assert "templates/example.md" in skill.supporting_files
        assert "scripts/helper.py" in skill.supporting_files

    def test_parse_skill_handles_nested_supporting_files(self, temp_dir: Path) -> None:
        """Test that parser recursively discovers nested supporting files."""
        skill_dir = temp_dir / "test-skill"
        skill_dir.mkdir()

        skill_md = skill_dir / "SKILL.md"
        skill_md.write_text(
            """---
name: test-skill
description: Test skill description
---

Content
"""
        )

        # Create nested supporting file structure
        nested_dir = skill_dir / "templates" / "nested" / "deep"
        nested_dir.mkdir(parents=True)
        (nested_dir / "nested.md").write_text("Nested template")

        result = parse_skill(skill_dir)

        assert is_successful(result)
        skill = result.unwrap()
        # Verify nested file was discovered with correct relative path
        assert "templates/nested/deep/nested.md" in skill.supporting_files

    def test_parse_skill_without_supporting_files(self, temp_dir: Path) -> None:
        """Test parsing skill that has no supporting files."""
        skill_dir = temp_dir / "test-skill"
        skill_dir.mkdir()

        skill_md = skill_dir / "SKILL.md"
        skill_md.write_text(
            """---
name: test-skill
description: Test skill description
---

Skill content
"""
        )

        result = parse_skill(skill_dir)

        assert is_successful(result)
        skill = result.unwrap()
        assert skill.supporting_files == []

    def test_parse_skill_missing_skill_md(self, temp_dir: Path) -> None:
        """Test appropriate error when SKILL.md is missing."""
        skill_dir = temp_dir / "test-skill"
        skill_dir.mkdir()

        result = parse_skill(skill_dir)

        assert not is_successful(result)
        error = result.failure()
        # Standard FileNotFoundError raised by open()
        assert isinstance(error, FileNotFoundError)
        assert "SKILL.md" in str(error) or "no such file" in str(error).lower()

    def test_parse_skill_missing_required_field(self, temp_dir: Path) -> None:
        """Test that parser rejects skill missing required field."""
        skill_dir = temp_dir / "test-skill"
        skill_dir.mkdir()

        skill_md = skill_dir / "SKILL.md"
        skill_md.write_text(
            """---
name: test-skill
---

Content
"""
        )

        result = parse_skill(skill_dir)

        assert not is_successful(result)
        error = result.failure()
        # Pydantic raises ValidationError for missing required fields
        assert isinstance(error, ValidationError)
        assert "description" in str(error).lower()
