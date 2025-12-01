"""Installer module for copying rp1 artifacts to OpenCode directories."""

import shutil
from datetime import datetime
from pathlib import Path

from returns.result import safe


class InstallerError(Exception):
    """Base class for installer errors."""

    pass


@safe
def copy_artifacts(source_dir: Path, target_dir: Path) -> int:
    """Copy rp1 artifacts from source to target directory.

    Handles subdirectory namespacing (command/rp1-base/, agent/rp1-base/).

    Args:
        source_dir: Source directory containing artifacts (dist/opencode/base/ or dist/opencode/dev/)
        target_dir: Target directory (e.g., ~/.config/opencode/)

    Returns:
        Count of files copied

    Raises:
        InstallerError: If copy operation fails
    """
    if not source_dir.exists():
        raise InstallerError(f"Source directory not found: {source_dir}")

    files_copied = 0

    # Copy commands (may have subdirectories like command/rp1-base/)
    command_src = source_dir / "command"
    if command_src.exists():
        command_dst = target_dir / "command"
        command_dst.mkdir(parents=True, exist_ok=True)

        # Copy all markdown files, preserving subdirectory structure
        for command_file in command_src.rglob("*.md"):
            # Preserve relative path (e.g., rp1-base/knowledge-build.md)
            rel_path = command_file.relative_to(command_src)
            dst_file = command_dst / rel_path
            dst_file.parent.mkdir(parents=True, exist_ok=True)

            # Warn if overwriting existing file
            if dst_file.exists():
                print(f"  ⚠ Overwriting: command/{rel_path}")

            shutil.copy2(command_file, dst_file)
            dst_file.chmod(0o644)  # rw-r--r--
            files_copied += 1

    # Copy agents (may have subdirectories like agent/rp1-base/)
    agent_src = source_dir / "agent"
    if agent_src.exists():
        agent_dst = target_dir / "agent"
        agent_dst.mkdir(parents=True, exist_ok=True)

        # Copy all markdown files, preserving subdirectory structure
        for agent_file in agent_src.rglob("*.md"):
            # Preserve relative path (e.g., rp1-base/kb-spatial-analyzer.md)
            rel_path = agent_file.relative_to(agent_src)
            dst_file = agent_dst / rel_path
            dst_file.parent.mkdir(parents=True, exist_ok=True)

            # Warn if overwriting existing file
            if dst_file.exists():
                print(f"  ⚠ Overwriting: agent/{rel_path}")

            shutil.copy2(agent_file, dst_file)
            dst_file.chmod(0o644)
            files_copied += 1

    # Copy skills
    skills_src = source_dir / "skills"
    if skills_src.exists():
        skills_dst = target_dir / "skills"
        skills_dst.mkdir(parents=True, exist_ok=True)
        for skill_dir in skills_src.iterdir():
            if skill_dir.is_dir():
                dst_skill_dir = skills_dst / skill_dir.name
                if dst_skill_dir.exists():
                    print(f"  ⚠ Replacing existing skill: {skill_dir.name}")
                    shutil.rmtree(dst_skill_dir)
                shutil.copytree(skill_dir, dst_skill_dir)
                # Set permissions recursively
                for item in dst_skill_dir.rglob("*"):
                    if item.is_file():
                        item.chmod(0o644)
                    elif item.is_dir():
                        item.chmod(0o755)
                files_copied += len(list(skill_dir.rglob("*")))

    return files_copied


@safe
def backup_existing_installation() -> Path:
    """Create backup of existing rp1 installation.

    Returns:
        Path to backup directory

    Raises:
        InstallerError: If backup operation fails
    """
    # Create backup directory
    backup_dir = Path.home() / ".opencode-rp1-backups"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"backup_{timestamp}"
    backup_path.mkdir(parents=True, exist_ok=True)

    # Backup OpenCode config
    config_dir = Path.home() / ".config" / "opencode"
    if not config_dir.exists():
        return backup_path  # No existing installation to backup

    # Backup commands (use rglob to handle subdirectory namespacing)
    command_dir = config_dir / "command"
    if command_dir.exists():
        backup_command_dir = backup_path / "command"
        backup_command_dir.mkdir(parents=True, exist_ok=True)
        for command_file in command_dir.rglob("*.md"):
            # Preserve subdirectory structure in backup
            rel_path = command_file.relative_to(command_dir)
            backup_file = backup_command_dir / rel_path
            backup_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(command_file, backup_file)

    # Backup agents (use rglob to handle subdirectory namespacing)
    agent_dir = config_dir / "agent"
    if agent_dir.exists():
        backup_agent_dir = backup_path / "agent"
        backup_agent_dir.mkdir(parents=True, exist_ok=True)
        for agent_file in agent_dir.rglob("*.md"):
            # Preserve subdirectory structure in backup
            rel_path = agent_file.relative_to(agent_dir)
            backup_file = backup_agent_dir / rel_path
            backup_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(agent_file, backup_file)

    # Backup skills
    skills_dir = config_dir / "skills"
    if skills_dir.exists():
        backup_skills_dir = backup_path / "skills"
        backup_skills_dir.mkdir(parents=True, exist_ok=True)
        # Backup known rp1 skills
        rp1_skills = ["maestro", "mermaid", "markdown-preview", "knowledge-base-templates"]
        for skill_name in rp1_skills:
            skill_dir = skills_dir / skill_name
            if skill_dir.exists():
                shutil.copytree(skill_dir, backup_skills_dir / skill_name)

    # Backup config file
    config_file = config_dir / "opencode.json"
    if config_file.exists():
        shutil.copy2(config_file, backup_path / "opencode.json")

    # Create backup manifest
    manifest = {
        "timestamp": timestamp,
        "backup_path": str(backup_path),
        "files_backed_up": len(list(backup_path.rglob("*"))),
    }

    import json

    manifest_file = backup_path / "manifest.json"
    with open(manifest_file, "w") as f:
        json.dump(manifest, f, indent=2)

    return backup_path


@safe
def install_rp1(plugin_dirs: list[Path], skip_skills: bool = False) -> int:
    """Install rp1 artifacts to OpenCode (orchestrator function).

    Args:
        plugin_dirs: List of plugin directories to install (e.g., [base/, dev/, custom/])
        skip_skills: Skip skills installation if True

    Returns:
        Total count of files installed

    Raises:
        InstallerError: If installation fails
    """
    target_dir = Path.home() / ".config" / "opencode"

    # Create backup first
    backup_path = backup_existing_installation().unwrap()
    print(f"✓ Backup created: {backup_path}")

    total_files = 0

    # Install each plugin dynamically
    for plugin_dir in plugin_dirs:
        plugin_name = plugin_dir.name
        files_copied = copy_artifacts(plugin_dir, target_dir).unwrap()
        print(f"✓ Installed {plugin_name} plugin: {files_copied} files")
        total_files += files_copied

    if skip_skills:
        print("⚠ Skills installation skipped (--skip-skills flag)")

    return total_files
