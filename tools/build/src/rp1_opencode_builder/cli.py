"""CLI interface for rp1-opencode-builder.

This module provides the command-line interface using Typer with Rich formatting.
"""

import shutil
import sys
from pathlib import Path

import typer
from returns.pipeline import is_successful
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from . import __version__
from .generator import (
    generate_agent_file,
    generate_command_file,
    generate_manifest,
    generate_skill_file,
)
from .parser import parse_agent, parse_command, parse_skill
from .registry import load_registry
from .transformations import transform_agent, transform_command, transform_skill
from .validator import (
    validate_agent_schema,
    validate_agent_syntax,
    validate_command_schema,
    validate_command_syntax,
    validate_skill_schema,
    validate_skill_syntax,
)

app = typer.Typer(
    name="rp1-opencode-builder",
    help="Build tool to generate OpenCode artifacts from Claude Code sources",
    add_completion=False,
)
console = Console()


def get_project_root() -> Path:
    """Get the rp1 project root directory."""
    # Assume we're in tools/build/, so go up to project root
    current_file = Path(__file__).resolve()
    build_dir = current_file.parent.parent.parent  # Go up from src/pkg/cli.py to tools/build/
    tools_dir = build_dir.parent  # Go up from tools/build/ to tools/
    project_root = tools_dir.parent  # Go up from tools/ to rp1/
    return project_root


@app.command()
def build(
    output_dir: str | None = typer.Option(
        None,
        "--output-dir",
        "-o",
        help="Output directory for generated artifacts (default: dist/opencode/)",
    ),
    target_install_tool: bool = typer.Option(
        False,
        "--target-install-tool",
        help="Generate artifacts under install-tool/dist/ for bundling",
    ),
    plugin: str | None = typer.Option(
        None,
        "--plugin",
        "-p",
        help="Build specific plugin only (base, dev, or all)",
    ),
    json_output: bool = typer.Option(
        False,
        "--json",
        help="Output results as JSON for CI/CD",
    ),
) -> None:
    """Build OpenCode artifacts from Claude Code sources."""
    # Determine output directory
    if target_install_tool:
        # Generate artifacts under tools/install/dist/opencode/
        project_root = get_project_root()
        output_path = project_root / "tools" / "install" / "dist" / "opencode"
    elif output_dir:
        output_path = Path(output_dir)
    else:
        output_path = Path("dist/opencode")

    console.print(f"[dim]Output directory: {output_path}[/dim]")

    # Determine which plugins to build
    plugins_to_build = ["base", "dev"] if not plugin or plugin == "all" else [plugin]

    # Load platform registry
    registry_result = load_registry()
    if not is_successful(registry_result):
        console.print(f"[red]✗ Failed to load platform registry: {registry_result.failure()}[/red]")
        sys.exit(1)
    registry = registry_result.unwrap()

    # Get project root
    project_root = get_project_root()

    # Track statistics
    total_commands = 0
    total_agents = 0
    total_skills = 0
    errors = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        for plugin_name in plugins_to_build:
            task = progress.add_task(f"Building {plugin_name} plugin...", total=None)

            # Build paths (plugins are now in plugins/ directory)
            plugin_dir = project_root / "plugins" / plugin_name
            plugin_output_dir = output_path / plugin_name

            # Clean and create output directories with subdirectory namespacing
            if plugin_output_dir.exists():
                shutil.rmtree(plugin_output_dir)
            # Create namespaced subdirectories: command/rp1-base/, agent/rp1-base/
            (plugin_output_dir / "command" / f"rp1-{plugin_name}").mkdir(parents=True, exist_ok=True)
            (plugin_output_dir / "agent" / f"rp1-{plugin_name}").mkdir(parents=True, exist_ok=True)
            (plugin_output_dir / "skills").mkdir(parents=True, exist_ok=True)

            # Process commands
            commands_dir = plugin_dir / "commands"
            command_names = []
            if commands_dir.exists():
                for cmd_file in commands_dir.glob("*.md"):
                    # Parse
                    parse_result = parse_command(cmd_file)
                    if not is_successful(parse_result):
                        errors.append(f"Parse error in {cmd_file.name}: {parse_result.failure()}")
                        continue
                    cc_cmd = parse_result.unwrap()

                    # Transform
                    transform_result = transform_command(cc_cmd, registry)
                    if not is_successful(transform_result):
                        errors.append(f"Transform error in {cmd_file.name}: {transform_result.failure()}")
                        continue
                    oc_cmd = transform_result.unwrap()

                    # Generate
                    generate_result = generate_command_file(oc_cmd, cc_cmd.name)
                    if not is_successful(generate_result):
                        errors.append(f"Generate error for {cmd_file.name}: {generate_result.failure()}")
                        continue
                    filename, content = generate_result.unwrap()

                    # Write to namespaced subdirectory
                    output_file = plugin_output_dir / "command" / f"rp1-{plugin_name}" / filename
                    output_file.write_text(content)
                    command_names.append(cc_cmd.name)
                    total_commands += 1

            # Process agents
            agents_dir = plugin_dir / "agents"
            agent_names = []
            if agents_dir.exists():
                for agent_file in agents_dir.glob("*.md"):
                    # Parse
                    agent_parse_result = parse_agent(agent_file)
                    if not is_successful(agent_parse_result):
                        errors.append(f"Parse error in {agent_file.name}: {agent_parse_result.failure()}")
                        continue
                    cc_agent = agent_parse_result.unwrap()

                    # Transform
                    agent_transform_result = transform_agent(cc_agent, registry)
                    if not is_successful(agent_transform_result):
                        errors.append(f"Transform error in {agent_file.name}: {agent_transform_result.failure()}")
                        continue
                    oc_agent = agent_transform_result.unwrap()

                    # Generate agent file (no prefix needed, using subdirectories)
                    agent_generate_result = generate_agent_file(oc_agent)
                    if not is_successful(agent_generate_result):
                        errors.append(f"Generate error for {agent_file.name}: {agent_generate_result.failure()}")
                        continue
                    filename, content = agent_generate_result.unwrap()

                    # Write to namespaced subdirectory
                    output_file = plugin_output_dir / "agent" / f"rp1-{plugin_name}" / filename
                    output_file.write_text(content)
                    agent_names.append(cc_agent.name)
                    total_agents += 1

            # Process skills (only in base plugin)
            skills_dir = plugin_dir / "skills"
            skill_names = []
            if skills_dir.exists() and plugin_name == "base":
                for skill_dir_path in skills_dir.iterdir():
                    if skill_dir_path.is_dir() and (skill_dir_path / "SKILL.md").exists():
                        # Parse
                        skill_parse_result = parse_skill(skill_dir_path)
                        if not is_successful(skill_parse_result):
                            errors.append(f"Parse error in {skill_dir_path.name}: {skill_parse_result.failure()}")
                            continue
                        cc_skill = skill_parse_result.unwrap()

                        # Transform
                        skill_transform_result = transform_skill(cc_skill, registry)
                        if not is_successful(skill_transform_result):
                            errors.append(
                                f"Transform error in {skill_dir_path.name}: {skill_transform_result.failure()}"
                            )
                            continue
                        oc_skill = skill_transform_result.unwrap()

                        # Generate
                        skill_generate_result = generate_skill_file(oc_skill)
                        if not is_successful(skill_generate_result):
                            errors.append(
                                f"Generate error for {skill_dir_path.name}: {skill_generate_result.failure()}"
                            )
                            continue
                        skill_dir_name, skill_md_content, _supporting_files = skill_generate_result.unwrap()

                        # Write
                        skill_output_dir = plugin_output_dir / "skills" / skill_dir_name
                        skill_output_dir.mkdir(parents=True, exist_ok=True)
                        (skill_output_dir / "SKILL.md").write_text(skill_md_content)

                        # Copy supporting files
                        for support_file in cc_skill.supporting_files:
                            src = skill_dir_path / support_file
                            dst = skill_output_dir / support_file
                            dst.parent.mkdir(parents=True, exist_ok=True)
                            if src.exists():
                                shutil.copy2(src, dst)

                        skill_names.append(cc_skill.name)
                        total_skills += 1

            # Generate manifest
            manifest_result = generate_manifest(
                f"rp1-{plugin_name}",
                "1.0.0",  # TODO: Read from plugin.json
                command_names,
                agent_names,
                skill_names,
            )
            if is_successful(manifest_result):
                manifest_content = manifest_result.unwrap()
                (plugin_output_dir / "manifest.json").write_text(manifest_content)

            progress.update(task, completed=True)

    # Print summary
    if not json_output:
        console.print("\n[bold green]✓ Build complete![/bold green]\n")

        table = Table(title="Generated Artifacts")
        table.add_column("Plugin", style="cyan")
        table.add_column("Commands", justify="right", style="green")
        table.add_column("Agents", justify="right", style="green")
        table.add_column("Skills", justify="right", style="green")

        for plugin_name in plugins_to_build:
            plugin_output_dir = output_path / plugin_name
            # Use rglob to recurse into subdirectories
            cmd_count = (
                len(list((plugin_output_dir / "command").rglob("*.md")))
                if (plugin_output_dir / "command").exists()
                else 0
            )
            agent_count = (
                len(list((plugin_output_dir / "agent").rglob("*.md"))) if (plugin_output_dir / "agent").exists() else 0
            )
            skill_count = (
                len(list((plugin_output_dir / "skills").iterdir())) if (plugin_output_dir / "skills").exists() else 0
            )
            table.add_row(f"rp1-{plugin_name}", str(cmd_count), str(agent_count), str(skill_count))

        console.print(table)
        console.print(f"\nOutput directory: [cyan]{output_path.absolute()}[/cyan]")

        if errors:
            console.print(f"\n[yellow]⚠ {len(errors)} errors occurred:[/yellow]")
            for error in errors[:5]:  # Show first 5
                console.print(f"  • {error}")
            if len(errors) > 5:
                console.print(f"  ... and {len(errors) - 5} more")
    else:
        import json

        result = {
            "status": "success" if not errors else "partial",
            "commands": total_commands,
            "agents": total_agents,
            "skills": total_skills,
            "errors": errors,
        }
        print(json.dumps(result, indent=2))

    sys.exit(0 if not errors else 1)


@app.command()
def validate(
    artifacts_dir: str | None = typer.Option(
        None,
        "--artifacts-dir",
        "-a",
        help="Directory containing artifacts to validate (default: dist/opencode/)",
    ),
) -> None:
    """Validate generated OpenCode artifacts (L1 + L2)."""
    artifacts_path = Path(artifacts_dir) if artifacts_dir else Path("dist/opencode")

    if not artifacts_path.exists():
        console.print(f"[red]✗ Artifacts directory not found: {artifacts_path}[/red]")
        sys.exit(1)

    errors = []
    validated_count = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Validating artifacts...", total=None)

        # Validate commands
        for cmd_file in artifacts_path.rglob("command/*.md"):
            content = cmd_file.read_text()

            # L1: Syntax
            syntax_result = validate_command_syntax(content)
            if not is_successful(syntax_result):
                errors.append(f"{cmd_file.name}: Syntax error - {syntax_result.failure()}")
                continue

            # L2: Schema
            schema_result = validate_command_schema(content)
            if not is_successful(schema_result):
                errors.append(f"{cmd_file.name}: Schema error - {schema_result.failure()}")
                continue

            validated_count += 1

        # Validate agents
        for agent_file in artifacts_path.rglob("agent/*.md"):
            content = agent_file.read_text()

            # L1: Syntax
            syntax_result = validate_agent_syntax(content)
            if not is_successful(syntax_result):
                errors.append(f"{agent_file.name}: Syntax error - {syntax_result.failure()}")
                continue

            # L2: Schema
            schema_result = validate_agent_schema(content)
            if not is_successful(schema_result):
                errors.append(f"{agent_file.name}: Schema error - {schema_result.failure()}")
                continue

            validated_count += 1

        # Validate skills
        for skill_file in artifacts_path.rglob("skills/*/SKILL.md"):
            content = skill_file.read_text()

            # L1: Syntax
            syntax_result = validate_skill_syntax(content)
            if not is_successful(syntax_result):
                errors.append(f"{skill_file.parent.name}/SKILL.md: Syntax error - {syntax_result.failure()}")
                continue

            # L2: Schema
            schema_result = validate_skill_schema(content)
            if not is_successful(schema_result):
                errors.append(f"{skill_file.parent.name}/SKILL.md: Schema error - {schema_result.failure()}")
                continue

            validated_count += 1

        progress.update(task, completed=True)

    # Print results
    if not errors:
        console.print("\n[bold green]✓ All artifacts valid![/bold green]")
        console.print(f"Validated {validated_count} artifacts (commands, agents, skills)")
    else:
        console.print("\n[bold red]✗ Validation failed![/bold red]")
        console.print(f"Validated {validated_count} artifacts successfully")
        console.print(f"\n[yellow]{len(errors)} errors found:[/yellow]")
        for error in errors[:10]:  # Show first 10
            console.print(f"  • {error}")
        if len(errors) > 10:
            console.print(f"  ... and {len(errors) - 10} more")
        sys.exit(1)


@app.command()
def clean(
    output_dir: str | None = typer.Option(
        None,
        "--output-dir",
        "-o",
        help="Output directory to clean (default: dist/opencode/)",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Skip confirmation prompt",
    ),
) -> None:
    """Remove generated artifacts."""
    output_path = Path(output_dir) if output_dir else Path("dist/opencode")

    if not output_path.exists():
        console.print(f"[yellow]Directory does not exist: {output_path}[/yellow]")
        return

    if not force:
        confirm = typer.confirm(f"Remove {output_path} and all contents?")
        if not confirm:
            console.print("[yellow]Cancelled[/yellow]")
            return

    shutil.rmtree(output_path)
    console.print(f"[green]✓ Removed {output_path}[/green]")


@app.command()
def diff() -> None:
    """Preview what would be generated (dry-run)."""
    console.print("[yellow]Diff command not yet implemented[/yellow]")
    console.print("Tip: Use 'build' command to generate, then inspect the output")


@app.command()
def version() -> None:
    """Show version information."""
    console.print(f"rp1-opencode-builder version {__version__}")


if __name__ == "__main__":
    app()
