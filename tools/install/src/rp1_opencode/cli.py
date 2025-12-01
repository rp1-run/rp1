"""CLI interface for rp1-opencode installation tool."""

import json
from pathlib import Path

import typer
from returns.pipeline import is_successful
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from rp1_opencode import __version__
from rp1_opencode.config import update_opencode_config
from rp1_opencode.installer import install_rp1
from rp1_opencode.manifest import discover_plugins
from rp1_opencode.prerequisites import (
    check_opencode_installed,
    check_opencode_skills_plugin,
    check_opencode_version,
    check_write_permissions,
    install_opencode_skills_plugin,
)
from rp1_opencode.verifier import verify_installation

app = typer.Typer(name="rp1-opencode", help="Installation tool for managing rp1 plugins on OpenCode platform")
console = Console()


def print_banner() -> None:
    """Print the rp1 ASCII banner."""
    import importlib.resources

    console.print()  # Add empty line before logo

    try:
        # Try to get logo from package resources
        logo_path = importlib.resources.files("rp1_opencode.assets") / "logo.txt"
        if logo_path.is_file():
            logo_content = logo_path.read_text(encoding="utf-8")
            console.print(f"[bold blue]{logo_content}[/bold blue]")
            return
    except Exception:
        pass

    # Fallback to local dev path
    try:
        local_logo = Path(__file__).parent / "assets" / "logo.txt"
        if local_logo.exists():
            console.print(f"[bold blue]{local_logo.read_text(encoding='utf-8')}[/bold blue]")
    except Exception:
        pass


@app.callback()
def main() -> None:
    """Installation tool for managing rp1 plugins on OpenCode platform."""
    print_banner()


def get_bundled_artifacts_dir() -> Path:
    """Get path to bundled artifacts within installed package.

    Returns:
        Path to bundled artifacts (either from package or local dev)
    """
    import importlib.resources

    try:
        # Try to get bundled artifacts (when installed via uvx/pip)
        artifacts_ref = importlib.resources.files("rp1_opencode") / "artifacts"
        if artifacts_ref.is_dir():
            return Path(str(artifacts_ref))
    except Exception:
        pass

    # Fallback to local dist/opencode/ (development mode)
    return Path(__file__).parent.parent.parent / "dist" / "opencode"


@app.command()
def install(
    artifacts_dir: Path | None = typer.Option(
        None,
        "--artifacts-dir",
        "-a",
        help="Path to OpenCode artifacts directory (default: bundled artifacts)",
    ),
    skip_skills: bool = typer.Option(False, "--skip-skills", help="Skip skills installation"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Show what would be installed without installing"),
) -> None:
    """Install rp1 plugins to OpenCode."""
    console.print(Panel.fit("🚀 rp1-opencode Installation", style="bold blue"))

    # Determine artifacts directory
    if artifacts_dir is None:
        artifacts_dir = get_bundled_artifacts_dir()
        console.print(f"[dim]Using bundled artifacts: {artifacts_dir}[/dim]")

    # Verify artifacts directory exists
    if not artifacts_dir.exists():
        console.print(f"[red]✗ Artifacts directory not found: {artifacts_dir}[/red]")
        console.print("[yellow]Tip: Build artifacts first with: uvx rp1-opencode-builder build[/yellow]")
        raise typer.Exit(1)

    # Check prerequisites
    console.print("\n[bold]Checking prerequisites...[/bold]")

    # Check OpenCode installed
    result_version = check_opencode_installed()
    if not is_successful(result_version):
        console.print(f"[red]✗ {result_version.failure()}[/red]")
        raise typer.Exit(1)

    version_str = result_version.unwrap()
    console.print(f"[green]✓ OpenCode found: {version_str}[/green]")

    # Check OpenCode version
    result_check = check_opencode_version(version_str)
    if not is_successful(result_check):
        console.print(f"[red]✗ {result_check.failure()}[/red]")
        raise typer.Exit(1)

    console.print("[green]✓ OpenCode version supported[/green]")

    # Check opencode-skills plugin
    result_skills = check_opencode_skills_plugin()
    if is_successful(result_skills):
        has_skills_plugin = result_skills.unwrap()
        if has_skills_plugin:
            console.print("[green]✓ opencode-skills plugin detected[/green]")
        else:
            console.print("[yellow]⚠ opencode-skills plugin not configured[/yellow]")
            if not skip_skills:
                # Offer to install automatically
                console.print("\n[bold]Install opencode-skills plugin?[/bold]")
                console.print("[dim]This plugin is required for rp1 skills (maestro, mermaid, etc.)[/dim]")
                console.print("[dim]Installation: Adds 'opencode-skills' to opencode.json[/dim]")
                console.print("[dim]OpenCode will auto-download on next startup[/dim]")
                response = typer.confirm("Add opencode-skills to configuration?", default=True)

                if response:
                    config_path = Path.home() / ".config" / "opencode" / "opencode.json"
                    install_result = install_opencode_skills_plugin(config_path)
                    if is_successful(install_result):
                        was_added = install_result.unwrap()
                        if was_added:
                            console.print("[green]✓ opencode-skills added to configuration[/green]")
                        else:
                            console.print("[green]✓ opencode-skills already configured[/green]")
                        console.print("[dim]Note: OpenCode will download the plugin on next startup[/dim]")
                    else:
                        console.print(f"[red]✗ Failed to configure plugin: {install_result.failure()}[/red]")
                        skip_skills = True
                else:
                    console.print("[yellow]Skipping opencode-skills installation[/yellow]")
                    skip_skills = True

    # Check write permissions
    target_dir = Path.home() / ".config" / "opencode"
    result_permissions = check_write_permissions(target_dir)
    if not is_successful(result_permissions):
        console.print(f"[red]✗ {result_permissions.failure()}[/red]")
        raise typer.Exit(1)

    console.print(f"[green]✓ Write permissions OK: {target_dir}[/green]")

    if dry_run:
        console.print("\n[bold yellow]DRY RUN MODE - No files will be modified[/bold yellow]")
        console.print(f"\nWould install from: {artifacts_dir}")
        console.print("  • Base plugin: commands, agents, skills")
        console.print("  • Dev plugin: commands, agents")
        return

    # Discover plugins dynamically
    console.print("\n[bold]Discovering plugins...[/bold]")

    result_plugins = discover_plugins(artifacts_dir)
    if not is_successful(result_plugins):
        console.print(f"[red]✗ {result_plugins.failure()}[/red]")
        raise typer.Exit(1)

    plugins = result_plugins.unwrap()
    console.print(f"[green]✓ Found {len(plugins)} plugin(s): {', '.join(p.plugin for p in plugins)}[/green]")

    # Collect all skills across all plugins
    all_skills = []
    for plugin in plugins:
        all_skills.extend(plugin.skills)

    if all_skills:
        console.print(f"[dim]  Skills to install: {', '.join(all_skills)}[/dim]")

    # Install artifacts
    console.print("\n[bold]Installing rp1 artifacts...[/bold]")

    # Get plugin directories
    plugin_dirs = [artifacts_dir / plugin.plugin.replace("rp1-", "") for plugin in plugins]

    try:
        total_files = install_rp1(plugin_dirs, skip_skills=skip_skills).unwrap()
        console.print(f"[green]✓ Installed {total_files} total files across {len(plugins)} plugins[/green]")
    except Exception as e:
        console.print(f"[red]✗ Installation failed: {e}[/red]")
        raise typer.Exit(1) from e

    # Update config
    console.print("\n[bold]Validating configuration...[/bold]")

    config_path = Path.home() / ".config" / "opencode" / "opencode.json"

    # Get latest version from first plugin (they should be aligned)
    latest_version = plugins[0].version if plugins else __version__

    # Ensure plugin array exists (idempotent operation)
    update_opencode_config(config_path, latest_version, all_skills).unwrap()
    console.print("[green]✓ Configuration validated[/green]")

    # Run verification with artifacts_dir for name-based checking
    console.print("\n[bold]Verifying installation...[/bold]")
    result_verify = verify_installation(artifacts_dir=artifacts_dir)
    if not is_successful(result_verify):
        console.print(f"[red]✗ Verification failed: {result_verify.failure()}[/red]")
        raise typer.Exit(1)

    report = result_verify.unwrap()
    if report.is_healthy:
        console.print("[green bold]✓ Installation complete and verified![/green bold]")
        console.print(f"\n[dim]Commands: {report.commands_found}/{report.commands_expected}[/dim]")
        console.print(f"[dim]Agents: {report.agents_found}/{report.agents_expected}[/dim]")
        console.print(f"[dim]Skills: {report.skills_found}/{report.skills_expected}[/dim]")
    else:
        console.print("[yellow]⚠ Installation complete with warnings[/yellow]")
        for issue in report.issues:
            console.print(f"  [yellow]• {issue}[/yellow]")


@app.command()
def verify(
    artifacts_dir: Path = typer.Option(
        None,
        "--artifacts-dir",
        help="Path to artifacts directory for name-based verification (optional)",
    ),
) -> None:
    """Verify rp1 installation health."""
    console.print(Panel.fit("🔍 Verifying rp1 Installation", style="bold blue"))

    result = verify_installation(artifacts_dir=artifacts_dir)
    if not is_successful(result):
        console.print(f"[red]✗ Verification failed: {result.failure()}[/red]")
        raise typer.Exit(1)

    report = result.unwrap()

    # Create table
    table = Table(title="Installation Status", show_header=True, header_style="bold cyan")
    table.add_column("Component", style="dim")
    table.add_column("Found", justify="right")
    table.add_column("Expected", justify="right")
    table.add_column("Status")

    # Commands
    commands_ok = report.commands_found == report.commands_expected
    table.add_row("Commands", str(report.commands_found), str(report.commands_expected), "✓" if commands_ok else "✗")

    # Agents
    agents_ok = report.agents_found == report.agents_expected
    table.add_row("Agents", str(report.agents_found), str(report.agents_expected), "✓" if agents_ok else "✗")

    # Skills
    skills_ok = report.skills_found == report.skills_expected
    table.add_row("Skills", str(report.skills_found), str(report.skills_expected), "✓" if skills_ok else "⚠")

    console.print(table)

    if report.issues:
        console.print("\n[bold yellow]Issues Found:[/bold yellow]")
        for issue in report.issues:
            console.print(f"  [yellow]• {issue}[/yellow]")
        raise typer.Exit(1)
    else:
        console.print("\n[green bold]✓ Installation is healthy![/green bold]")


@app.command()
def list_commands() -> None:
    """List installed rp1 commands."""
    console.print(Panel.fit("📋 Installed rp1 Commands", style="bold blue"))

    command_dir = Path.home() / ".config" / "opencode" / "command"
    if not command_dir.exists():
        console.print("[red]✗ No commands directory found[/red]")
        raise typer.Exit(1)

    rp1_commands = sorted(command_dir.glob("rp1-*.md"))

    if not rp1_commands:
        console.print("[yellow]No rp1 commands found[/yellow]")
        return

    # Create table
    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("Plugin", style="dim")
    table.add_column("Command")
    table.add_column("Description")

    for command_file in rp1_commands:
        # Parse command name from filename
        cmd_name = command_file.stem  # e.g., "rp1-base:knowledge-build"

        # Extract plugin (base or dev)
        if "base:" in cmd_name:
            plugin = "base"
        elif "dev:" in cmd_name:
            plugin = "dev"
        else:
            plugin = "unknown"

        # Try to extract description from frontmatter
        try:
            content = command_file.read_text()
            if content.startswith("---"):
                import yaml

                parts = content.split("---", 2)
                if len(parts) >= 3:
                    frontmatter = yaml.safe_load(parts[1])
                    description = frontmatter.get("description", "No description")
                else:
                    description = "No description"
            else:
                description = "No description"
        except Exception:
            description = "Error reading file"

        table.add_row(plugin, cmd_name, description[:60])

    console.print(table)
    console.print(f"\n[dim]Total: {len(rp1_commands)} commands[/dim]")


@app.command()
def version() -> None:
    """Display installed rp1 version."""
    console.print(Panel.fit(f"rp1-opencode v{__version__}", style="bold blue"))

    version_file = Path.home() / ".opencode-rp1" / "version.json"
    if version_file.exists():
        with open(version_file) as f:
            version_data = json.load(f)

        table = Table(show_header=False, box=None)
        table.add_column("Field", style="dim")
        table.add_column("Value")

        table.add_row("Version", version_data.get("version", "unknown"))
        table.add_row("Installed", version_data.get("install_date", "unknown"))
        table.add_row("Source", version_data.get("artifact_source", "unknown"))

        console.print(table)
    else:
        console.print("[yellow]No version information found (rp1 may not be installed)[/yellow]")


@app.command()
def update(
    version_str: str | None = typer.Option(None, "--version", "-v", help="Specific version to install"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Show what would be updated"),
) -> None:
    """Update rp1 to latest or specified version."""
    console.print(Panel.fit("🔄 Updating rp1", style="bold blue"))

    if dry_run:
        console.print("[bold yellow]DRY RUN MODE[/bold yellow]")

    console.print("[yellow]Update functionality not yet implemented[/yellow]")
    console.print("[dim]Planned features:[/dim]")
    console.print("[dim]  • Download latest artifacts from GitHub[/dim]")
    console.print("[dim]  • Backup existing installation[/dim]")
    console.print("[dim]  • Replace artifacts[/dim]")
    console.print("[dim]  • Update config safely[/dim]")


@app.command()
def uninstall(
    keep_config: bool = typer.Option(False, "--keep-config", help="Keep OpenCode configuration"),
) -> None:
    """Uninstall rp1 from OpenCode."""
    console.print(Panel.fit("🗑️  Uninstalling rp1", style="bold red"))

    console.print("[yellow]Uninstall functionality not yet implemented[/yellow]")
    console.print("[dim]Planned features:[/dim]")
    console.print("[dim]  • Create final backup[/dim]")
    console.print("[dim]  • Remove commands, agents, skills[/dim]")
    console.print("[dim]  • Optionally remove config entries[/dim]")


@app.command()
def rollback() -> None:
    """Rollback to previous rp1 installation."""
    console.print(Panel.fit("⏮️  Rolling back rp1", style="bold yellow"))

    backup_dir = Path.home() / ".opencode-rp1-backups"
    if not backup_dir.exists():
        console.print("[red]✗ No backups found[/red]")
        raise typer.Exit(1)

    backups = sorted(backup_dir.iterdir(), reverse=True)
    if not backups:
        console.print("[red]✗ No backups available[/red]")
        raise typer.Exit(1)

    console.print("\n[bold]Available backups:[/bold]")
    for i, backup in enumerate(backups[:5], 1):  # Show last 5
        console.print(f"  {i}. {backup.name}")

    console.print("\n[yellow]Rollback functionality not yet implemented[/yellow]")
    console.print("[dim]Planned features:[/dim]")
    console.print("[dim]  • List available backups[/dim]")
    console.print("[dim]  • Prompt user to select backup[/dim]")
    console.print("[dim]  • Restore artifacts and config[/dim]")
    console.print("[dim]  • Verify after restore[/dim]")


if __name__ == "__main__":
    app()
