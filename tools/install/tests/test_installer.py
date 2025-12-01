"""Tests for installer module."""

from unittest.mock import patch

from returns.pipeline import is_successful

from rp1_opencode.installer import backup_existing_installation, copy_artifacts, install_rp1


def test_copy_artifacts_commands(tmp_path):
    """Test copying command files."""
    # Create source structure
    source_dir = tmp_path / "source" / "base"
    command_src = source_dir / "command"
    command_src.mkdir(parents=True)

    # Create test command files
    (command_src / "test-command.md").write_text("# Test Command")
    (command_src / "another-command.md").write_text("# Another Command")

    # Create target structure
    target_dir = tmp_path / "target"

    # Copy artifacts
    result = copy_artifacts(source_dir, target_dir)

    assert is_successful(result)
    files_copied = result.unwrap()
    assert files_copied == 2

    # Verify files copied
    assert (target_dir / "command" / "test-command.md").exists()
    assert (target_dir / "command" / "another-command.md").exists()


def test_copy_artifacts_agents(tmp_path):
    """Test copying agent files."""
    # Create source structure
    source_dir = tmp_path / "source" / "base"
    agent_src = source_dir / "agent"
    agent_src.mkdir(parents=True)

    # Create test agent files
    (agent_src / "test-agent.md").write_text("# Test Agent")

    # Create target structure
    target_dir = tmp_path / "target"

    # Copy artifacts
    result = copy_artifacts(source_dir, target_dir)

    assert is_successful(result)
    files_copied = result.unwrap()
    assert files_copied == 1

    # Verify files copied
    assert (target_dir / "agent" / "test-agent.md").exists()


def test_copy_artifacts_skills(tmp_path):
    """Test copying skill directories."""
    # Create source structure
    source_dir = tmp_path / "source" / "base"
    skills_src = source_dir / "skills"
    maestro_skill = skills_src / "maestro"
    maestro_skill.mkdir(parents=True)

    # Create test skill files
    (maestro_skill / "SKILL.md").write_text("# Maestro Skill")
    (maestro_skill / "TEMPLATES.md").write_text("# Templates")

    # Create target structure
    target_dir = tmp_path / "target"

    # Copy artifacts
    result = copy_artifacts(source_dir, target_dir)

    assert is_successful(result)
    files_copied = result.unwrap()
    assert files_copied >= 2

    # Verify skill copied
    assert (target_dir / "skills" / "maestro" / "SKILL.md").exists()
    assert (target_dir / "skills" / "maestro" / "TEMPLATES.md").exists()


def test_copy_artifacts_source_not_found(tmp_path):
    """Test error when source directory doesn't exist."""
    source_dir = tmp_path / "nonexistent"
    target_dir = tmp_path / "target"

    result = copy_artifacts(source_dir, target_dir)

    assert not is_successful(result)
    error = str(result.failure())
    assert "not found" in error.lower()


def test_backup_existing_installation(tmp_path):
    """Test backup of existing installation."""
    # Create fake OpenCode structure
    config_dir = tmp_path / ".config" / "opencode"
    command_dir = config_dir / "command"
    agent_dir = config_dir / "agent"
    skills_dir = config_dir / "skills" / "maestro"

    command_dir.mkdir(parents=True)
    agent_dir.mkdir(parents=True)
    skills_dir.mkdir(parents=True)

    # Create test files
    (command_dir / "rp1-base:test.md").write_text("# Test")
    (agent_dir / "kb-test.md").write_text("# Test Agent")
    (skills_dir / "SKILL.md").write_text("# Skill")
    (config_dir / "opencode.json").write_text("{}")

    # Mock home directory
    with patch("pathlib.Path.home", return_value=tmp_path):
        result = backup_existing_installation()

        assert is_successful(result)
        backup_path = result.unwrap()

        # Verify backup created
        assert backup_path.exists()
        assert (backup_path / "command" / "rp1-base:test.md").exists()
        assert (backup_path / "agent" / "kb-test.md").exists()
        assert (backup_path / "skills" / "maestro" / "SKILL.md").exists()
        assert (backup_path / "opencode.json").exists()
        assert (backup_path / "manifest.json").exists()


def test_backup_no_existing_installation(tmp_path):
    """Test backup when no installation exists."""
    with patch("pathlib.Path.home", return_value=tmp_path):
        result = backup_existing_installation()

        # Should succeed but create empty backup
        assert is_successful(result)
        backup_path = result.unwrap()
        assert backup_path.exists()


def test_install_rp1_multiple_plugins(tmp_path, capsys):
    """Test installing multiple plugins dynamically."""
    # Create source plugins
    base_dir = tmp_path / "base"
    dev_dir = tmp_path / "dev"

    base_cmd = base_dir / "command"
    dev_cmd = dev_dir / "command"

    base_cmd.mkdir(parents=True)
    dev_cmd.mkdir(parents=True)

    (base_cmd / "cmd1.md").write_text("# Cmd1")
    (dev_cmd / "cmd2.md").write_text("# Cmd2")

    # Mock home directory
    with patch("pathlib.Path.home", return_value=tmp_path):
        result = install_rp1([base_dir, dev_dir], skip_skills=True)

        assert is_successful(result)
        total_files = result.unwrap()
        assert total_files == 2  # 1 command from base, 1 from dev

        # Verify printed output mentions both plugins
        captured = capsys.readouterr()
        assert "base" in captured.out
        assert "dev" in captured.out
