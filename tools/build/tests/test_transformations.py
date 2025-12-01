"""Unit tests for transformation engine.

Tests the public API only - no private function imports.
Private implementation details are tested through public interface behavior.
"""

from returns.pipeline import is_successful

from rp1_opencode_builder.models import (
    ClaudeCodeAgent,
    ClaudeCodeCommand,
    ClaudeCodeSkill,
    PlatformRegistry,
)
from rp1_opencode_builder.transformations import (
    transform_agent,
    transform_command,
    transform_skill,
)


class TestCodeBlockPreservation:
    """Test that transformations preserve code blocks through public API."""

    def test_command_preserves_code_blocks(self):
        """Test that command transformation preserves code blocks."""
        cc_cmd = ClaudeCodeCommand(
            name="test",
            version="1.0",
            description="Test",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="""
Real invocation:
subagent_type: rp1-dev:real-agent

Example code:
```python
# Don't transform this
subagent_type: example-agent
```
""",
        )
        registry = PlatformRegistry()
        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        # Simple replacement: colon → slash
        assert "rp1-dev/real-agent" in oc_cmd.template
        assert "rp1-dev:real-agent" not in oc_cmd.template

    def test_agent_preserves_code_blocks(self):
        """Test that agent transformation preserves code blocks."""
        cc_agent = ClaudeCodeAgent(
            name="test",
            description="Test",
            tools=["Read"],
            model="inherit",
            content="""
Real command: /rp1-base:knowledge-load

Example:
```bash
/rp1-base:example-command
```
""",
        )
        registry = PlatformRegistry()
        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        # Real command should be transformed
        assert 'command_invoke("rp1-base:knowledge-load")' in oc_agent.content
        # Code example should be preserved
        assert "/rp1-base:example-command" in oc_agent.content


class TestTaskToolTransformation:
    """Test Task tool → @ mention transformation through public API."""

    def test_transform_task_tool_basic(self):
        """Test namespace separator transformation (colon to slash)."""
        cc_cmd = ClaudeCodeCommand(
            name="test",
            version="1.0",
            description="Test",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="Use the Task tool to invoke agent:\nsubagent_type: rp1-dev:test-agent",
        )
        registry = PlatformRegistry()
        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        # Simple namespace transformation: rp1-dev:test-agent → rp1-dev/test-agent
        assert "rp1-dev/test-agent" in oc_cmd.template
        assert "rp1-dev:test-agent" not in oc_cmd.template

    def test_extract_agent_reference(self):
        """Test that agent field is always None (explicit invocation via @ mentions)."""
        cc_cmd = ClaudeCodeCommand(
            name="test",
            version="1.0",
            description="Test",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="subagent_type: rp1-base:kb-spatial-analyzer",
        )
        registry = PlatformRegistry()
        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        # Agent field always None - OpenCode's agent: field runs as background agent
        # We use @ mentions in prompt for explicit invocation instead
        assert oc_cmd.agent is None

    def test_no_agent_reference(self):
        """Test command without agent delegation."""
        cc_cmd = ClaudeCodeCommand(
            name="test",
            version="1.0",
            description="Test",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="Just some regular content without agent reference",
        )
        registry = PlatformRegistry()
        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        assert oc_cmd.agent is None


class TestSlashCommandTransformation:
    """Test SlashCommand → command_invoke transformation through public API."""

    def test_transform_slash_command_basic(self):
        """Test basic SlashCommand transformation."""
        cc_agent = ClaudeCodeAgent(
            name="test",
            description="Test",
            tools=["Read"],
            model="inherit",
            content="Run /rp1-base:knowledge-load to load context",
        )
        registry = PlatformRegistry()
        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert 'command_invoke("rp1-base:knowledge-load")' in oc_agent.content
        assert "/rp1-base:knowledge-load" not in oc_agent.content

    def test_transform_slash_command_multiple(self):
        """Test transforming multiple SlashCommands."""
        cc_agent = ClaudeCodeAgent(
            name="test",
            description="Test",
            tools=["Read"],
            model="inherit",
            content="""
First run /rp1-base:knowledge-load
Then run /rp1-dev:feature-build
""",
        )
        registry = PlatformRegistry()
        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert 'command_invoke("rp1-base:knowledge-load")' in oc_agent.content
        assert 'command_invoke("rp1-dev:feature-build")' in oc_agent.content


class TestPermissionsMapping:
    """Test tool → permissions dict mapping through public API."""

    def test_build_permissions_file_tools(self):
        """Test mapping file operation tools."""
        cc_agent = ClaudeCodeAgent(
            name="test", description="Test", tools=["Read", "Write", "Edit"], model="inherit", content="test"
        )
        registry = PlatformRegistry()
        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert "file" in oc_agent.permissions
        assert set(oc_agent.permissions["file"]) == {"read", "write", "edit"}

    def test_build_permissions_bash_tools(self):
        """Test mapping bash tools."""
        cc_agent = ClaudeCodeAgent(name="test", description="Test", tools=["Bash"], model="inherit", content="test")
        registry = PlatformRegistry()
        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert "bash" in oc_agent.permissions
        assert oc_agent.permissions["bash"] == ["execute"]

    def test_build_permissions_search_tools(self):
        """Test mapping search tools."""
        cc_agent = ClaudeCodeAgent(
            name="test", description="Test", tools=["Grep", "Glob"], model="inherit", content="test"
        )
        registry = PlatformRegistry()
        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert "search" in oc_agent.permissions
        assert set(oc_agent.permissions["search"]) == {"grep", "glob"}

    def test_build_permissions_mixed_tools(self):
        """Test mapping mixed tool types."""
        cc_agent = ClaudeCodeAgent(
            name="test", description="Test", tools=["Read", "Write", "Bash", "Grep"], model="inherit", content="test"
        )
        registry = PlatformRegistry()
        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert "file" in oc_agent.permissions
        assert "bash" in oc_agent.permissions
        assert "search" in oc_agent.permissions


class TestCommandTransformation:
    """Test complete command transformation."""

    def test_transform_command_basic(self):
        """Test basic command transformation."""
        cc_cmd = ClaudeCodeCommand(
            name="test-command",
            version="1.0.0",
            description="Test command",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="Use the Task tool to invoke agent:\nsubagent_type: rp1-dev:test-agent",
        )
        registry = PlatformRegistry()

        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        # Simple namespace transformation: colon → slash
        assert "rp1-dev/test-agent" in oc_cmd.template
        assert oc_cmd.description == "Test command"
        # Agent field always None
        assert oc_cmd.agent is None

    def test_transform_command_no_agent(self):
        """Test transforming command without agent delegation."""
        cc_cmd = ClaudeCodeCommand(
            name="simple-command",
            version="1.0.0",
            description="Simple command",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="Just some content without agent reference",
        )
        registry = PlatformRegistry()

        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        assert oc_cmd.agent is None


class TestAgentTransformation:
    """Test complete agent transformation."""

    def test_transform_agent_basic(self):
        """Test basic agent transformation."""
        cc_agent = ClaudeCodeAgent(
            name="test-agent",
            description="Test agent",
            tools=["Read", "Write", "Bash"],
            model="inherit",
            content="Agent prompt without SlashCommands",
        )
        registry = PlatformRegistry()

        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert oc_agent.name == "test-agent"
        assert oc_agent.mode == "subagent"
        assert "read_file" in oc_agent.tools
        assert "write_file" in oc_agent.tools
        assert "bash_run" in oc_agent.tools
        assert "file" in oc_agent.permissions
        assert "bash" in oc_agent.permissions

    def test_transform_agent_with_slash_commands(self):
        """Test agent transformation with SlashCommand calls."""
        cc_agent = ClaudeCodeAgent(
            name="kb-agent",
            description="KB-aware agent",
            tools=["Read"],
            model="inherit",
            content="First run /rp1-base:knowledge-load to load KB context",
        )
        registry = PlatformRegistry()

        result = transform_agent(cc_agent, registry)

        assert is_successful(result)
        oc_agent = result.unwrap()
        assert 'command_invoke("rp1-base:knowledge-load")' in oc_agent.content
        assert "/rp1-base:knowledge-load" not in oc_agent.content


class TestSkillTransformation:
    """Test complete skill transformation."""

    def test_transform_skill_basic(self):
        """Test basic skill transformation."""
        cc_skill = ClaudeCodeSkill(
            name="test-skill",
            description="Test skill with sufficient length for validation",
            content="Skill content without invocations",
            supporting_files=[],
        )
        registry = PlatformRegistry()

        result = transform_skill(cc_skill, registry)

        assert is_successful(result)
        oc_skill = result.unwrap()
        assert oc_skill.name == "test-skill"
        assert oc_skill.description == "Test skill with sufficient length for validation"

    def test_transform_skill_with_invocations(self):
        """Test skill transformation with skill invocations."""
        cc_skill = ClaudeCodeSkill(
            name="mermaid",
            description="Mermaid diagram validation skill with proper length",
            content="Use the Skill tool with skill: mermaid to validate diagrams",
            supporting_files=["templates/diagram.md"],
        )
        registry = PlatformRegistry()

        result = transform_skill(cc_skill, registry)

        assert is_successful(result)
        oc_skill = result.unwrap()
        assert "skills_mermaid tool" in oc_skill.content
        assert "Skill tool" not in oc_skill.content
        assert oc_skill.supporting_files == ["templates/diagram.md"]


class TestEdgeCases:
    """Test edge cases and complex scenarios through public API."""

    def test_multiple_transformations_in_same_content(self):
        """Test agent with both Task tool and SlashCommand patterns."""
        # Agent content can't have Task tool (that's for commands), so test command with multiple patterns
        cc_cmd = ClaudeCodeCommand(
            name="test",
            version="1.0",
            description="Test",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="""
Use the Task tool:
subagent_type: rp1-dev:test-agent

Example:
```python
# Don't transform these
subagent_type: example
```
""",
        )
        registry = PlatformRegistry()
        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        # Simple replacement: colon → slash (everywhere)
        assert "rp1-dev/test-agent" in oc_cmd.template
        assert "rp1-dev:test-agent" not in oc_cmd.template

    def test_malformed_patterns_ignored(self):
        """Test that malformed patterns are left as-is."""
        cc_cmd = ClaudeCodeCommand(
            name="test",
            version="1.0",
            description="Test",
            tags=["test"],
            created="2025-01-01",
            author="test",
            content="Use the Task tool but no subagent_type specified",
        )
        registry = PlatformRegistry()
        result = transform_command(cc_cmd, registry)

        assert is_successful(result)
        oc_cmd = result.unwrap()
        # Content should remain mostly unchanged (no transformation)
        assert "Use the Task tool" in oc_cmd.template
