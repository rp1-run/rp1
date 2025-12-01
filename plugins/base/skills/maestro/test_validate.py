#!/usr/bin/env python3
"""
Tests for validate_skill.py

Usage:
    python test_validate.py
"""

import tempfile
import shutil
from pathlib import Path
from validate_skill import SkillValidator


class TestRunner:
    """Simple test runner for validation tests."""

    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.temp_dir = None

    def setup(self):
        """Create temporary directory for test files."""
        self.temp_dir = Path(tempfile.mkdtemp())

    def teardown(self):
        """Clean up temporary directory."""
        if self.temp_dir and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

    def create_skill_file(self, content: str) -> Path:
        """Create a temporary SKILL.md file with given content."""
        skill_path = self.temp_dir / "SKILL.md"
        with open(skill_path, "w") as f:
            f.write(content)
        return skill_path

    def test(self, name: str, skill_content: str, should_pass: bool):
        """Run a test case."""
        print(f"\nTesting: {name}")

        skill_path = self.create_skill_file(skill_content)
        validator = SkillValidator(str(skill_path))

        result = validator.validate()

        if result == should_pass:
            print("  ✅ PASS")
            self.passed += 1
        else:
            print(
                f"  ❌ FAIL (expected {'pass' if should_pass else 'fail'}, got {'pass' if result else 'fail'})"
            )
            self.failed += 1

    def report(self):
        """Print test summary."""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Total:  {self.passed + self.failed}")
        print("=" * 60)

        if self.failed == 0:
            print("✅ ALL TESTS PASSED")
        else:
            print("❌ SOME TESTS FAILED")


def run_tests():
    """Run all validation tests."""
    runner = TestRunner()
    runner.setup()

    # Test 1: Valid minimal skill
    runner.test(
        "Valid minimal skill",
        """---
name: test-skill
description: A test skill that does something. Use when user mentions 'test'.
---

# Test Skill

This is a test skill.
""",
        should_pass=True,
    )

    # Test 2: Missing name field
    runner.test(
        "Missing name field",
        """---
description: A test skill without a name.
---

# Test Skill

Content here.
""",
        should_pass=False,
    )

    # Test 3: Missing description field
    runner.test(
        "Missing description field",
        """---
name: test-skill
---

# Test Skill

Content here.
""",
        should_pass=False,
    )

    # Test 4: Name too long
    runner.test(
        "Name exceeds 64 characters",
        """---
name: this-is-a-very-long-skill-name-that-exceeds-the-maximum-allowed-length-of-sixty-four-characters
description: Test skill with too long name.
---

# Test Skill

Content here.
""",
        should_pass=False,
    )

    # Test 5: Invalid name format (uppercase)
    runner.test(
        "Name with uppercase letters",
        """---
name: TestSkill
description: Test skill with invalid name format.
---

# Test Skill

Content here.
""",
        should_pass=False,
    )

    # Test 6: Description too long
    runner.test(
        "Description exceeds 1024 characters",
        """---
name: test-skill
description: """
        + "A" * 1025
        + """
---

# Test Skill

Content here.
""",
        should_pass=False,
    )

    # Test 7: Invalid frontmatter (no closing ---)
    runner.test(
        "Invalid frontmatter format",
        """---
name: test-skill
description: Test skill.

# Test Skill

Content here without closing frontmatter delimiter.
""",
        should_pass=False,
    )

    # Test 8: Valid skill with allowed-tools
    runner.test(
        "Valid skill with allowed-tools",
        """---
name: test-skill
description: Test skill with tool restrictions. Use when testing.
allowed-tools: [Read, Grep]
---

# Test Skill

This skill has tool restrictions.
""",
        should_pass=True,
    )

    # Test 9: Valid skill with trigger terms
    runner.test(
        "Valid skill with good trigger terms",
        """---
name: pdf-processor
description: Processes PDF files by extracting text and images. Use when working with PDFs or when user mentions 'PDF', 'document', 'extract'.
---

# PDF Processor

Processes PDF documents.
""",
        should_pass=True,
    )

    # Test 10: Empty description
    runner.test(
        "Empty description",
        """---
name: test-skill
description:
---

# Test Skill

Content here.
""",
        should_pass=False,
    )

    runner.teardown()
    runner.report()

    return runner.failed == 0


if __name__ == "__main__":
    import sys

    success = run_tests()
    sys.exit(0 if success else 1)
