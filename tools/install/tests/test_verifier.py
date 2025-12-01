"""Tests for verifier module."""

from pathlib import Path
from unittest.mock import patch

from returns.pipeline import is_successful

from rp1_opencode.verifier import check_file_health, verify_installation


def test_verify_installation_no_config():
    """Test verification when OpenCode config doesn't exist."""
    with patch("pathlib.Path.home", return_value=Path("/nonexistent")):
        result = verify_installation()

        assert not is_successful(result)
        error = str(result.failure())
        assert "configuration directory not found" in error.lower()


def test_verify_installation_healthy(tmp_path):
    """Test verification of healthy installation."""
    # Create fake OpenCode structure
    config_dir = tmp_path / ".config" / "opencode"
    command_dir = config_dir / "command"
    agent_dir = config_dir / "agent"
    skills_dir = config_dir / "skills"

    command_dir.mkdir(parents=True)
    agent_dir.mkdir(parents=True)
    skills_dir.mkdir(parents=True)

    # Create 21 commands
    for i in range(21):
        command_file = command_dir / f"rp1-base:command{i}.md"
        command_file.write_text("---\ndescription: Test\n---\n# Content")

    # Create 17 agents
    for i in range(17):
        agent_file = agent_dir / f"kb-agent{i}.md"
        agent_file.write_text("---\ndescription: Test\n---\n# Content")

    # Create 4 skills
    for skill_name in ["maestro", "mermaid", "markdown-preview", "knowledge-base-templates"]:
        skill_dir = skills_dir / skill_name
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text("---\nname: Test\ndescription: Test skill description\n---\n# Content")

    with patch("pathlib.Path.home", return_value=tmp_path):
        result = verify_installation()

        assert is_successful(result)
        report = result.unwrap()

        assert report.is_healthy
        assert report.commands_found == 21
        assert report.agents_found == 17
        assert report.skills_found == 4
        assert len(report.issues) == 0


def test_verify_installation_missing_commands(tmp_path):
    """Test verification with missing commands."""
    config_dir = tmp_path / ".config" / "opencode"
    command_dir = config_dir / "command"
    command_dir.mkdir(parents=True)

    # Create only 10 commands (missing 11)
    for i in range(10):
        command_file = command_dir / f"rp1-base:command{i}.md"
        command_file.write_text("---\ndescription: Test\n---\n# Content")

    with patch("pathlib.Path.home", return_value=tmp_path):
        result = verify_installation()

        assert is_successful(result)
        report = result.unwrap()

        assert not report.is_healthy
        assert report.commands_found == 10
        assert len(report.issues) > 0
        assert any("missing commands" in issue.lower() for issue in report.issues)


def test_check_file_health_valid():
    """Test file health check with valid file."""
    # Create a temporary file with valid frontmatter
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".md") as f:
        f.write("---\nname: test\ndescription: Test file\n---\n# Content")
        temp_file = Path(f.name)

    try:
        result = check_file_health(temp_file)

        assert is_successful(result)
        issues = result.unwrap()
        assert len(issues) == 0
    finally:
        temp_file.unlink()


def test_check_file_health_missing_file():
    """Test file health check with missing file."""
    missing_file = Path("/nonexistent/file.md")

    result = check_file_health(missing_file)

    assert is_successful(result)
    issues = result.unwrap()
    assert len(issues) > 0
    assert any("not found" in issue.lower() for issue in issues)


def test_check_file_health_invalid_yaml():
    """Test file health check with invalid YAML."""
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".md") as f:
        f.write("---\ninvalid: yaml: syntax:\n---\n# Content")
        temp_file = Path(f.name)

    try:
        result = check_file_health(temp_file)

        assert is_successful(result)
        issues = result.unwrap()
        assert len(issues) > 0
        assert any("invalid yaml" in issue.lower() for issue in issues)
    finally:
        temp_file.unlink()


def test_check_file_health_missing_frontmatter():
    """Test file health check with missing frontmatter."""
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".md") as f:
        f.write("# Content without frontmatter")
        temp_file = Path(f.name)

    try:
        result = check_file_health(temp_file)

        assert is_successful(result)
        issues = result.unwrap()
        assert len(issues) > 0
        assert any("missing yaml frontmatter" in issue.lower() for issue in issues)
    finally:
        temp_file.unlink()
