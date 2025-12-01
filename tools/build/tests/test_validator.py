"""Unit tests for validator module.

This module tests L1 (syntax) and L2 (schema) validation functions.
"""

from returns.pipeline import is_successful

from rp1_opencode_builder.validator import (
    validate_agent_schema,
    validate_agent_syntax,
    validate_command_schema,
    validate_command_syntax,
    validate_skill_schema,
    validate_skill_syntax,
)


class TestCommandValidation:
    """Test command validation functions."""

    def test_validate_command_syntax_valid(self):
        """Test syntax validation with valid YAML frontmatter."""
        content = """---
description: Test
template: |
  Content
---"""
        result = validate_command_syntax(content)
        assert is_successful(result)

    def test_validate_command_syntax_no_frontmatter(self):
        """Test syntax validation fails without frontmatter."""
        content = "No frontmatter here"
        result = validate_command_syntax(content)
        assert not is_successful(result)
        error = result.failure()
        assert "must start with YAML frontmatter" in str(error)

    def test_validate_command_syntax_incomplete_frontmatter(self):
        """Test syntax validation fails with incomplete frontmatter."""
        content = "---\ndescription: Test"
        result = validate_command_syntax(content)
        assert not is_successful(result)

    def test_validate_command_syntax_invalid_yaml(self):
        """Test syntax validation fails with invalid YAML."""
        content = """---
description: Test
invalid: {unclosed
---"""
        result = validate_command_syntax(content)
        assert not is_successful(result)

    def test_validate_command_schema_valid(self):
        """Test schema validation with all required fields."""
        content = """---
description: Test description
---

Test template content"""
        result = validate_command_schema(content)
        assert is_successful(result)

    def test_validate_command_schema_missing_description(self):
        """Test schema validation fails without description."""
        content = """---
other: value
---

Test content"""
        result = validate_command_schema(content)
        assert not is_successful(result)
        error = result.failure()
        assert "description" in str(error).lower()

    def test_validate_command_schema_missing_content(self):
        """Test schema validation fails without content after frontmatter."""
        content = """---
description: Test
---
"""
        result = validate_command_schema(content)
        assert not is_successful(result)
        error = str(result.failure())
        assert "prompt content" in error.lower()

    def test_validate_command_schema_wrong_type(self):
        """Test schema validation fails with wrong field type."""
        content = """---
description: 123
---

Test content"""
        result = validate_command_schema(content)
        assert not is_successful(result)
        error = str(result.failure())
        assert "must be string" in error.lower()


class TestAgentValidation:
    """Test agent validation functions."""

    def test_validate_agent_syntax_valid(self):
        """Test agent syntax validation with valid YAML."""
        content = """---
description: Test
mode: subagent
model: inherit
tools:
  bash: true
  write: false
---
Agent content"""
        result = validate_agent_syntax(content)
        assert is_successful(result)

    def test_validate_agent_syntax_invalid_yaml(self):
        """Test agent syntax validation fails with invalid YAML."""
        content = """---
description: Test
mode: {bad
---"""
        result = validate_agent_syntax(content)
        assert not is_successful(result)

    def test_validate_agent_schema_valid(self):
        """Test agent schema validation with all required fields."""
        content = """---
description: Test agent
mode: subagent
model: inherit
tools:
  bash: true
---
Content"""
        result = validate_agent_schema(content)
        assert is_successful(result)

    def test_validate_agent_schema_missing_mode(self):
        """Test schema validation fails without mode."""
        content = """---
description: Test
tools:
  bash: true
---"""
        result = validate_agent_schema(content)
        assert not is_successful(result)
        error = result.failure()
        assert "Missing required fields" in str(error)

    def test_validate_agent_schema_wrong_mode(self):
        """Test schema validation fails with invalid mode."""
        content = """---
description: Test
mode: invalid
model: inherit
tools:
  bash: true
---"""
        result = validate_agent_schema(content)
        assert not is_successful(result)
        error = result.failure()
        assert "mode must be 'subagent'" in str(error)

    def test_validate_agent_schema_tools_not_dict(self):
        """Test schema validation fails when tools is not a dict."""
        content = """---
description: Test
mode: subagent
model: inherit
tools: ['bash', 'write']
---"""
        result = validate_agent_schema(content)
        assert not is_successful(result)
        error = result.failure()
        assert "tools' must be object (dict)" in str(error)


class TestSkillValidation:
    """Test skill validation functions."""

    def test_validate_skill_syntax_valid(self):
        """Test skill syntax validation with valid YAML."""
        content = """---
name: test-skill
description: This is a test skill with sufficient character length for validation
---
Skill content"""
        result = validate_skill_syntax(content)
        assert is_successful(result)

    def test_validate_skill_syntax_invalid_yaml(self):
        """Test skill syntax validation fails with invalid YAML."""
        content = """---
name: test
description: {invalid
---"""
        result = validate_skill_syntax(content)
        assert not is_successful(result)

    def test_validate_skill_schema_valid(self):
        """Test skill schema validation with valid fields."""
        content = """---
name: test-skill
description: This skill description has more than twenty characters required
---
Content"""
        result = validate_skill_schema(content)
        assert is_successful(result)

    def test_validate_skill_schema_missing_name(self):
        """Test schema validation fails without name."""
        content = """---
description: Test description with sufficient length
---"""
        result = validate_skill_schema(content)
        assert not is_successful(result)

    def test_validate_skill_schema_description_too_short(self):
        """Test schema validation fails with description <20 chars."""
        content = """---
name: test
description: Too short
---"""
        result = validate_skill_schema(content)
        assert not is_successful(result)
        error = result.failure()
        assert "too short" in str(error).lower()
        assert "20 chars" in str(error)

    def test_validate_skill_schema_description_exactly_20_chars(self):
        """Test schema validation passes with exactly 20 chars."""
        content = """---
name: test
description: Exactly twenty chars
---"""
        result = validate_skill_schema(content)
        assert is_successful(result)

    def test_validate_skill_schema_empty_frontmatter(self):
        """Test schema validation fails with empty frontmatter."""
        content = """---
---"""
        result = validate_skill_schema(content)
        assert not is_successful(result)


class TestValidationErrorMessages:
    """Test that validation errors provide clear messages."""

    def test_command_missing_fields_lists_fields(self):
        """Test that missing field error lists which fields are missing."""
        content = """---
other: Test
---

Content here"""
        result = validate_command_schema(content)
        assert not is_successful(result)
        error_msg = str(result.failure())
        assert "description" in error_msg.lower()

    def test_agent_mode_error_shows_actual_value(self):
        """Test that mode validation error shows the actual invalid value."""
        content = """---
description: Test
mode: wrong
model: inherit
tools:
  bash: true
---"""
        result = validate_agent_schema(content)
        assert not is_successful(result)
        error_msg = str(result.failure())
        assert "wrong" in error_msg
        assert "subagent" in error_msg
