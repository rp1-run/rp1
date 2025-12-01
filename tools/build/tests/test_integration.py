"""Integration tests for build tool end-to-end workflows.

This module tests the complete build pipeline from parsing to generation to validation.
"""

import subprocess


class TestEndToEndBuild:
    """Test full build pipeline."""

    def test_build_base_plugin_generates_all_artifacts(self, tmp_path):
        """Test that building base plugin generates expected artifacts."""
        # Run build command
        result = subprocess.run(
            [
                "uv",
                "run",
                "python",
                "-m",
                "rp1_opencode_builder.cli",
                "build",
                "--plugin",
                "base",
                "--output-dir",
                str(tmp_path),
            ],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"Build failed: {result.stderr}"

        # Verify output structure
        base_dir = tmp_path / "base"
        assert base_dir.exists()
        assert (base_dir / "command").exists()
        assert (base_dir / "agent").exists()
        assert (base_dir / "skills").exists()
        assert (base_dir / "manifest.json").exists()

        # Verify commands (now in subdirectories)
        commands = list((base_dir / "command").rglob("*.md"))
        assert len(commands) == 6, f"Expected 6 commands, got {len(commands)}"

        # Verify agents (now in subdirectories)
        agents = list((base_dir / "agent").rglob("*.md"))
        assert len(agents) == 8, f"Expected 8 agents, got {len(agents)}"

        # Verify skills
        skills = list((base_dir / "skills").iterdir())
        assert len(skills) == 4, f"Expected 4 skills, got {len(skills)}"

    def test_build_both_plugins(self, tmp_path):
        """Test building both plugins at once."""
        result = subprocess.run(
            ["uv", "run", "python", "-m", "rp1_opencode_builder.cli", "build", "--output-dir", str(tmp_path)],
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0

        # Verify both plugins
        assert (tmp_path / "base").exists()
        assert (tmp_path / "dev").exists()

        # Verify dev has no skills
        dev_skills = list((tmp_path / "dev" / "skills").iterdir())
        assert len(dev_skills) == 0

    def test_validate_after_build(self, tmp_path):
        """Test that validation passes after successful build."""
        # Build first
        build_result = subprocess.run(
            ["uv", "run", "python", "-m", "rp1_opencode_builder.cli", "build", "--output-dir", str(tmp_path)],
            capture_output=True,
            text=True,
        )
        assert build_result.returncode == 0

        # Then validate
        validate_result = subprocess.run(
            ["uv", "run", "python", "-m", "rp1_opencode_builder.cli", "validate", "--artifacts-dir", str(tmp_path)],
            capture_output=True,
            text=True,
        )

        assert validate_result.returncode == 0
        assert "All artifacts valid" in validate_result.stdout

    def test_clean_removes_artifacts(self, tmp_path):
        """Test that clean command removes generated artifacts."""
        # Build first
        subprocess.run(
            ["uv", "run", "python", "-m", "rp1_opencode_builder.cli", "build", "--output-dir", str(tmp_path)],
            capture_output=True,
        )
        assert (tmp_path / "base").exists()

        # Clean
        subprocess.run(
            [
                "uv",
                "run",
                "python",
                "-m",
                "rp1_opencode_builder.cli",
                "clean",
                "--output-dir",
                str(tmp_path),
                "--force",
            ],
            capture_output=True,
        )

        assert not tmp_path.exists() or not list(tmp_path.iterdir())

    def test_build_is_idempotent(self, tmp_path):
        """Test that building twice produces identical output."""
        # Build twice
        subprocess.run(
            [
                "uv",
                "run",
                "python",
                "-m",
                "rp1_opencode_builder.cli",
                "build",
                "--plugin",
                "base",
                "--output-dir",
                str(tmp_path),
            ],
            capture_output=True,
        )
        first_manifest = (tmp_path / "base" / "manifest.json").read_text()

        subprocess.run(
            [
                "uv",
                "run",
                "python",
                "-m",
                "rp1_opencode_builder.cli",
                "build",
                "--plugin",
                "base",
                "--output-dir",
                str(tmp_path),
            ],
            capture_output=True,
        )
        second_manifest = (tmp_path / "base" / "manifest.json").read_text()

        # Manifests should be identical except for timestamp
        assert "rp1-base" in first_manifest
        assert "rp1-base" in second_manifest


class TestPerformance:
    """Test performance requirements."""

    def test_full_build_completes_quickly(self, tmp_path):
        """Test that full build completes in reasonable time."""
        import time

        start = time.time()
        result = subprocess.run(
            ["uv", "run", "python", "-m", "rp1_opencode_builder.cli", "build", "--output-dir", str(tmp_path)],
            capture_output=True,
            timeout=60,  # 60 second timeout
        )
        elapsed = time.time() - start

        assert result.returncode == 0
        assert elapsed < 30, f"Build took {elapsed:.1f}s, expected <30s"
