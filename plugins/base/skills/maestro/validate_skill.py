#!/usr/bin/env python3
"""
Skill Validation Script

Validates Claude Code skills for structural correctness and best practices.

Usage:
    python validate_skill.py <path-to-SKILL.md>

Examples:
    python validate_skill.py ./my-skill/SKILL.md
    python validate_skill.py ~/.claude/skills/my-skill/SKILL.md

Returns:
    Exit code 0 if validation passes
    Exit code 1 if validation fails
"""

import re
import sys
from pathlib import Path
from typing import List, Dict


class SkillValidator:
    """Validates skill files for structure and best practices."""

    def __init__(self, skill_path: str):
        """Initialize validator with path to SKILL.md file."""
        self.skill_path = Path(skill_path)
        self.skill_dir = self.skill_path.parent
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.info: List[str] = []
        self.frontmatter: Dict[str, str] = {}
        self.content: str = ""

    def validate(self) -> bool:
        """Run all validations. Returns True if all pass."""
        print(f"Validating skill: {self.skill_path}\n")

        # Critical checks
        if not self._check_file_exists():
            return False

        if not self._parse_frontmatter():
            return False

        self._validate_name()
        self._validate_description()
        self._validate_content_length()
        self._validate_paths()
        self._validate_references()
        self._check_best_practices()
        self._check_anti_patterns()

        # Report results
        self._print_report()

        return len(self.errors) == 0

    def _check_file_exists(self) -> bool:
        """Check if SKILL.md exists."""
        if not self.skill_path.exists():
            self.errors.append(f"File not found: {self.skill_path}")
            return False
        if not self.skill_path.is_file():
            self.errors.append(f"Not a file: {self.skill_path}")
            return False
        return True

    def _parse_frontmatter(self) -> bool:
        """Parse YAML frontmatter from SKILL.md."""
        try:
            with open(self.skill_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            self.errors.append(f"Cannot read file: {e}")
            return False

        # Find frontmatter between --- markers
        pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
        match = re.match(pattern, content, re.DOTALL)

        if not match:
            self.errors.append(
                "Invalid or missing YAML frontmatter (must start and end with ---)"
            )
            return False

        frontmatter_text = match.group(1)
        self.content = match.group(2)

        # Parse frontmatter (simple YAML parsing for our use case)
        for line in frontmatter_text.split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            # Handle key: value or key: [list]
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip()
                value = value.strip()
                self.frontmatter[key] = value

        return True

    def _validate_name(self):
        """Validate skill name."""
        if "name" not in self.frontmatter:
            self.errors.append("Missing 'name' field in frontmatter")
            return

        name = self.frontmatter["name"]

        # Check length
        if len(name) > 64:
            self.errors.append(f"Name too long: {len(name)} chars (max 64)")

        # Check format: lowercase, hyphens, numbers only
        if not re.match(r"^[a-z0-9-]+$", name):
            self.errors.append(
                f"Name must be lowercase letters, numbers, and hyphens only: '{name}'"
            )

        # Check for XML tags
        if "<" in name or ">" in name:
            self.errors.append(f"Name contains XML tags: '{name}'")

        # Check for vague names
        vague_names = ["helper", "utility", "tool", "misc", "utils"]
        if name in vague_names:
            self.warnings.append(f"Vague name '{name}' - consider more specific name")

    def _validate_description(self):
        """Validate skill description."""
        if "description" not in self.frontmatter:
            self.errors.append("Missing 'description' field in frontmatter")
            return

        desc = self.frontmatter["description"]

        # Check empty
        if not desc or desc.strip() == "":
            self.errors.append("Description is empty")
            return

        # Check length
        if len(desc) > 1024:
            self.errors.append(f"Description too long: {len(desc)} chars (max 1024)")

        # Check for XML tags
        if "<" in desc or ">" in desc:
            self.errors.append("Description contains XML tags")

        # Check for trigger terms (best practice)
        trigger_phrases = [
            "use when",
            "when user",
            "when working",
            "mentions",
            "requests",
        ]
        has_trigger = any(phrase in desc.lower() for phrase in trigger_phrases)
        if not has_trigger:
            self.warnings.append(
                "Description lacks trigger terms (consider adding 'Use when...' or 'when user mentions...')"
            )

        # Check for vague descriptions
        vague_terms = ["helps with", "utility for", "tool for"]
        if any(term in desc.lower() for term in vague_terms):
            self.warnings.append(
                "Description seems vague - be more specific about capabilities"
            )

    def _validate_content_length(self):
        """Check SKILL.md content length."""
        lines = self.content.split("\n")
        line_count = len(lines)

        if line_count > 500:
            self.errors.append(f"SKILL.md too long: {line_count} lines (max 500)")
            self.info.append(
                "Consider splitting content into supporting files (TEMPLATES.md, EXAMPLES.md, etc.)"
            )
        elif line_count > 400:
            self.warnings.append(
                f"SKILL.md approaching length limit: {line_count} lines (ideal: <400)"
            )
        else:
            self.info.append(f"Content length: {line_count} lines ✓")

    def _validate_paths(self):
        """Check for Windows-style paths."""
        # Check for backslashes (Windows paths)
        if "\\" in self.content:
            backslash_count = self.content.count("\\")
            self.errors.append(
                f"Found {backslash_count} Windows-style backslashes - use forward slashes"
            )
            self.info.append("Auto-fix: Replace \\ with /")

    def _validate_references(self):
        """Check referenced files exist."""
        # Find markdown file references
        # Patterns: [text](FILE.md), see FILE.md, FILE.md for details
        patterns = [
            r"\[.*?\]\(([\w/-]+\.md)\)",  # [text](file.md)
            r"[Ss]ee ([\w/-]+\.md)",  # see file.md
            r"([\w/-]+\.md) for",  # file.md for
        ]

        referenced_files = set()
        for pattern in patterns:
            matches = re.finditer(pattern, self.content)
            for match in matches:
                referenced_files.add(match.group(1))

        # Check if referenced files exist
        for ref_file in referenced_files:
            ref_path = self.skill_dir / ref_file
            if not ref_path.exists():
                self.warnings.append(f"Referenced file not found: {ref_file}")

        if referenced_files:
            self.info.append(f"Found {len(referenced_files)} file reference(s)")

    def _check_best_practices(self):
        """Check best practice adherence."""
        content_lower = self.content.lower()

        # Check for progressive disclosure
        if len(self.content.split("\n")) > 300:
            support_files = [
                "TEMPLATES.md",
                "EXAMPLES.md",
                "REFERENCE.md",
                "WORKFLOWS.md",
            ]
            has_support = any((self.skill_dir / f).exists() for f in support_files)
            if not has_support:
                self.warnings.append(
                    "Long SKILL.md without supporting files - consider using progressive disclosure"
                )

        # Check for consistent terminology
        # (This is simplified - real check would be more sophisticated)
        if (
            "endpoint" in content_lower
            and "url" in content_lower
            and "path" in content_lower
        ):
            self.warnings.append(
                "Multiple terms for similar concepts (endpoint/URL/path) - consider consistent terminology"
            )

    def _check_anti_patterns(self):
        """Check for common anti-patterns."""
        # Check for time-sensitive information
        time_patterns = [
            r"\b20\d{2}\b",  # Years like 2024
            r"\bcurrent(ly)?\b",  # "current" or "currently"
            r"\bas of\b",  # "as of"
            r"\brecent(ly)?\b",  # "recent" or "recently"
        ]

        for pattern in time_patterns:
            if re.search(pattern, self.content, re.IGNORECASE):
                self.warnings.append(
                    f"Possible time-sensitive content found (pattern: {pattern})"
                )
                break

        # Check for magic numbers in referenced scripts
        script_files = [
            f
            for f in self.skill_dir.glob("*.py")
            if f.name != "validate_skill.py" and not f.name.startswith("test_")
        ]

        for script in script_files:
            try:
                with open(script, "r") as f:
                    script_content = f.read()
                    # Simple check for numbers without context
                    numbers = re.findall(r"\b\d+\b", script_content)
                    if len(numbers) > 10:
                        self.warnings.append(
                            f"Script {script.name} may contain magic numbers - ensure they're documented"
                        )
            except Exception:
                pass

    def _print_report(self):
        """Print validation report."""
        print("=" * 60)
        print("VALIDATION REPORT")
        print("=" * 60)

        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"  - {error}")

        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  - {warning}")

        if self.info:
            print(f"\nℹ️  INFO ({len(self.info)}):")
            for info_item in self.info:
                print(f"  - {info_item}")

        print("\n" + "=" * 60)

        if self.errors:
            print("❌ VALIDATION FAILED")
            print(f"   {len(self.errors)} error(s) must be fixed")
        else:
            print("✅ VALIDATION PASSED")
            if self.warnings:
                print(f"   {len(self.warnings)} warning(s) - consider addressing")
            else:
                print("   No issues found!")

        print("=" * 60)


def main():
    """Main entry point."""
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    skill_path = sys.argv[1]
    validator = SkillValidator(skill_path)

    success = validator.validate()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
