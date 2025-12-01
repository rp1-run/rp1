"""Installation verification module."""

from dataclasses import dataclass
from pathlib import Path

import yaml
from returns.pipeline import is_successful
from returns.result import safe

from rp1_opencode.manifest import discover_plugins


class VerifierError(Exception):
    """Base class for verifier errors."""

    pass


@dataclass
class VerificationReport:
    """Report of installation verification results."""

    commands_found: int
    commands_expected: int
    agents_found: int
    agents_expected: int
    skills_found: int
    skills_expected: int
    issues: list[str]

    @property
    def is_healthy(self) -> bool:
        """Check if installation is healthy (no critical issues).

        Note: Skills are optional (require opencode-skills plugin), so skills_found < skills_expected
        doesn't make installation unhealthy if the only issue is missing skills.
        """
        # Filter out skills-only issues for health check
        critical_issues = [i for i in self.issues if "skills" not in i.lower()]

        return (
            len(critical_issues) == 0
            and self.commands_found == self.commands_expected
            and self.agents_found == self.agents_expected
        )


@safe
def verify_installation(artifacts_dir: Path | None = None) -> VerificationReport:
    """Verify rp1 installation health.

    Args:
        artifacts_dir: Optional path to artifacts for discovering expected counts.
                      If None, uses default expected counts.

    Returns:
        VerificationReport with findings

    Raises:
        VerifierError: If verification process fails
    """
    config_dir = Path.home() / ".config" / "opencode"

    if not config_dir.exists():
        raise VerifierError(
            "OpenCode configuration directory not found.\nExpected: ~/.config/opencode/\nPlease install OpenCode first."
        )

    issues: list[str] = []

    # Discover expected artifacts from manifests if available
    expected_commands: set[str] = set()
    expected_agents: set[str] = set()
    expected_skills: set[str] = set()

    if artifacts_dir and artifacts_dir.exists():
        result_plugins = discover_plugins(artifacts_dir)
        if is_successful(result_plugins):
            plugins = result_plugins.unwrap()
            for plugin in plugins:
                expected_commands.update(plugin.commands)
                expected_agents.update(plugin.agents)
                expected_skills.update(plugin.skills)

    # Fallback expected counts if manifest not available
    commands_expected = len(expected_commands) if expected_commands else 20
    agents_expected = len(expected_agents) if expected_agents else 17
    skills_expected = len(expected_skills) if expected_skills else 4

    # Check commands (use rglob to handle subdirectory namespacing)
    command_dir = config_dir / "command"
    rp1_commands = list(command_dir.rglob("*.md")) if command_dir.exists() else []
    commands_found = len(rp1_commands)

    # If we have expected command names from manifests, check for missing specific commands
    if expected_commands:
        installed_command_names = {cmd.stem for cmd in rp1_commands}
        missing_commands = expected_commands - installed_command_names
        if missing_commands:
            issues.append(
                f"Missing commands ({len(missing_commands)}): {', '.join(sorted(missing_commands))}. "
                f"Re-run installation to fix."
            )
    elif commands_found < commands_expected:
        # Fallback to count-based check if no manifest
        issues.append(
            f"Missing commands: found {commands_found}, expected {commands_expected}. "
            f"Re-run installation to fix."
        )

    # Validate command file syntax
    for command_file in rp1_commands:
        file_issues = check_file_health(command_file).unwrap()
        issues.extend(file_issues)

    # Check agents (expect 17: 8 base + 9 dev)
    # Use rglob to handle subdirectory namespacing (agent/rp1-base/, agent/rp1-dev/)
    agent_dir = config_dir / "agent"
    rp1_agents = []
    if agent_dir.exists():
        # Find all markdown files in subdirectories (rglob searches recursively)
        for agent_file in agent_dir.rglob("*.md"):
            rp1_agents.append(agent_file)

    agents_found = len(rp1_agents)

    # If we have expected agent names from manifests, check for missing specific agents
    if expected_agents:
        installed_agent_names = {agent.stem for agent in rp1_agents}
        missing_agents = expected_agents - installed_agent_names
        if missing_agents:
            issues.append(
                f"Missing agents ({len(missing_agents)}): {', '.join(sorted(missing_agents))}. "
                f"Re-run installation to fix."
            )
    elif agents_found < agents_expected:
        # Fallback to count-based check if no manifest
        issues.append(
            f"Missing agents: found {agents_found}, expected {agents_expected}. Re-run installation to fix."
        )

    # Validate agent file syntax
    for agent_file in rp1_agents:
        file_issues = check_file_health(agent_file).unwrap()
        issues.extend(file_issues)

    # Check skills (dynamically discovered from manifests or fallback to known skills)
    skills_dir = config_dir / "skills"
    skills_found = 0
    missing_skill_names: list[str] = []

    # Get expected skill names from manifests (prefer) or installed skills
    skill_names_to_check: set[str] = (
        expected_skills if expected_skills else {"maestro", "mermaid", "markdown-preview", "knowledge-base-templates"}
    )

    # Count installed skills and identify missing ones
    if skills_dir.exists():
        for skill_name in skill_names_to_check:
            skill_dir = skills_dir / skill_name
            if skill_dir.exists() and (skill_dir / "SKILL.md").exists():
                skills_found += 1
                # Validate SKILL.md syntax
                file_issues = check_file_health(skill_dir / "SKILL.md").unwrap()
                issues.extend(file_issues)
            else:
                missing_skill_names.append(skill_name)

    if missing_skill_names:
        issues.append(
            f"Missing skills ({len(missing_skill_names)}): {', '.join(sorted(missing_skill_names))}. "
            f"Note: Skills require opencode-skills plugin. "
            f"Re-run installation to fix."
        )

    return VerificationReport(
        commands_found=commands_found,
        commands_expected=commands_expected,
        agents_found=agents_found,
        agents_expected=agents_expected,
        skills_found=skills_found,
        skills_expected=skills_expected,
        issues=issues,
    )


@safe
def check_file_health(file_path: Path) -> list[str]:
    """Check if file exists, is readable, and has valid YAML frontmatter.

    Args:
        file_path: Path to file to check

    Returns:
        List of issues found (empty if healthy)

    Raises:
        VerifierError: If file check process fails
    """
    issues: list[str] = []

    # Check file exists
    if not file_path.exists():
        issues.append(f"File not found: {file_path}")
        return issues

    # Check file is readable
    try:
        content = file_path.read_text()
    except Exception as e:
        issues.append(f"Cannot read {file_path.name}: {e}")
        return issues

    # Check YAML frontmatter syntax
    if not content.startswith("---"):
        issues.append(f"Missing YAML frontmatter in {file_path.name}")
        return issues

    try:
        parts = content.split("---", 2)
        if len(parts) < 3:
            issues.append(f"Invalid frontmatter structure in {file_path.name}")
            return issues

        frontmatter_text = parts[1]
        yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as e:
        issues.append(f"Invalid YAML in {file_path.name}: {e}")

    return issues
