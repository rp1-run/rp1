import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
sys.path.insert(0, SCRIPTS)

import project  # noqa: E402


class TestSplitFrontmatter(unittest.TestCase):
    def test_rich_block(self):
        fm, body = project.split_frontmatter(
            "---\nproducer: bug-investigator\nrp1_doc_id: abc\n---\n# Title\n\nbody\n"
        )
        self.assertEqual(fm["producer"], "bug-investigator")
        self.assertEqual(fm["rp1_doc_id"], "abc")
        self.assertEqual(body, "# Title\n\nbody\n")

    def test_no_block(self):
        fm, body = project.split_frontmatter("# Just a heading\n\ntext\n")
        self.assertEqual(fm, {})
        self.assertEqual(body, "# Just a heading\n\ntext\n")

    def test_quoted_and_indented_continuation_ignored(self):
        # A multi-line quoted value whose continuation contains a colon must not
        # create a bogus key, and surrounding quotes are stripped.
        text = (
            "---\n"
            'description: "Root cause of the Check failed: marking_done_ crash\n'
            "  spanning two lines."
            '"\n'
            "producer: bug-investigator\n"
            "---\n"
            "body\n"
        )
        fm, _ = project.split_frontmatter(text)
        self.assertEqual(fm["producer"], "bug-investigator")
        self.assertNotIn("Check failed", fm)  # continuation line not parsed as a key
        self.assertTrue(fm["description"].startswith("Root cause"))


class TestTitle(unittest.TestCase):
    def test_artifact_field_with_issue(self):
        fm = {"artifact": "investigation-report", "issue_id": "node-20-upgrade"}
        self.assertEqual(
            project.derive_title(fm, "# Anything\n", "/x/y.md"),
            "Investigation Report — node-20-upgrade",
        )

    def test_artifact_field_no_issue(self):
        self.assertEqual(
            project.derive_title({"artifact": "code-audit"}, "# H\n", "/x/y.md"),
            "Code Audit",
        )

    def test_h1_fallback(self):
        fm = {"producer": "bug-investigator"}  # no artifact field
        body = "# Follow-up: fix the thing\n\nbody\n"
        self.assertEqual(project.derive_title(fm, body, "/x/y.md"), "Follow-up: fix the thing")

    def test_producer_fallback(self):
        self.assertEqual(
            project.derive_title({"producer": "bug-investigator"}, "no heading\n", "/x/y.md"),
            "Bug Investigator",
        )

    def test_filename_fallback(self):
        self.assertEqual(
            project.derive_title({}, "no heading here\n", "/a/b/opencv_notes.md"),
            "Opencv Notes",
        )


class TestStripH1(unittest.TestCase):
    def test_strips_leading_h1_line_only(self):
        self.assertEqual(
            project.strip_leading_h1("\n# Title\n\n## Section\n\nx\n"),
            "## Section\n\nx\n",
        )

    def test_no_h1_unchanged(self):
        self.assertEqual(project.strip_leading_h1("## Section\n\nx\n"), "## Section\n\nx\n")


class TestSplitMarkerRung0(unittest.TestCase):
    """rung 0: an author-placed `<!-- rp1:split -->` line wins over every heuristic."""

    def _run(self, body):
        return project.extract_summary(body)

    def test_splits_at_marker(self):
        body = "lead prose\n\n<!-- rp1:split -->\n\n## Mechanism\n\ndetail\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "lead prose\n")
        self.assertEqual(rest, "## Mechanism\n\ndetail\n")
        self.assertIsNone(warn)

    def test_marker_line_is_dropped_from_both_sides(self):
        body = "before\n\n<!-- rp1:split -->\n\nafter\n"
        (summ, rest), _ = self._run(body)
        self.assertNotIn("rp1:split", summ)
        self.assertNotIn("rp1:split", rest)

    def test_overrides_executive_summary_heading(self):
        # Marker precedes the named-summary heading; rung 0 must beat rung 1.
        body = "intro\n\n<!-- rp1:split -->\n\n## Executive Summary\n\nstuff\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "intro\n")
        self.assertEqual(rest, "## Executive Summary\n\nstuff\n")
        self.assertIsNone(warn)

    def test_overrides_first_h2(self):
        body = "lead\n\n<!-- rp1:split -->\n\n## Background\n\nb\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "lead\n")
        self.assertIsNone(warn)  # no rung-2 "falling back to first H2" warning

    def test_first_marker_wins(self):
        body = "one\n\n<!-- rp1:split -->\n\ntwo\n\n<!-- rp1:split -->\n\nthree\n"
        (summ, rest), _ = self._run(body)
        self.assertEqual(summ, "one\n")
        self.assertEqual(rest, "two\n\n<!-- rp1:split -->\n\nthree\n")

    def test_empty_summary_warns(self):
        body = "<!-- rp1:split -->\n\nonly the rest\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "")
        self.assertEqual(rest, "only the rest\n")
        self.assertIn("no content precedes", warn)

    def test_marker_at_end_means_no_fold(self):
        body = "all summary here\n\n<!-- rp1:split -->\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "all summary here\n")
        self.assertEqual(rest, "")
        self.assertIsNone(warn)

    def test_whitespace_tolerant(self):
        body = "lead\n\n   <!--   rp1:split   -->\t\n\nrest\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "lead\n")
        self.assertEqual(rest, "rest\n")
        self.assertIsNone(warn)

    def test_inline_marker_ignored(self):
        # A marker embedded mid-line is not a split directive: rung 0 does not fire,
        # the ladder falls through to a heuristic rung, and the marker text survives.
        body = "a paragraph with <!-- rp1:split --> inside it\n\nsecond paragraph\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "a paragraph with <!-- rp1:split --> inside it\n")
        self.assertEqual(rest, "second paragraph\n")
        self.assertIn("rung 5", warn)  # fell through to the lead-paragraph rung


class TestSummaryLadder(unittest.TestCase):
    def _run(self, body):
        return project.extract_summary(body)

    def test_rung1_named_summary(self):
        body = "## Executive Summary\n\nlead\n\n## Details\n\nmore\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "lead\n")
        self.assertEqual(rest, "## Details\n\nmore\n")
        self.assertIsNone(warn)

    def test_rung1_numbered_named_summary(self):
        body = "## 1. Executive Summary\n\nlead\n\n## 2. Details\n\nmore\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "lead\n")
        self.assertEqual(rest, "## 2. Details\n\nmore\n")

    def test_rung2_first_h2(self):
        body = "## Background\n\nb\n\n## Other\n\no\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "b\n")
        self.assertEqual(rest, "## Other\n\no\n")
        self.assertIn("falling back to first H2", warn)

    def test_rung3_subheading(self):
        body = "intro text\n\n### Sub\n\ndetail\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "intro text\n")
        self.assertEqual(rest, "### Sub\n\ndetail\n")
        self.assertIn("rung 3", warn)

    def test_rung4_thematic_break(self):
        body = "lead para\n\n---\n\nafter break\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "lead para\n")
        self.assertEqual(rest, "---\n\nafter break\n")
        self.assertIn("rung 4", warn)

    def test_rung5_paragraph(self):
        body = "first paragraph\n\nsecond paragraph\n\nthird\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "first paragraph\n")
        self.assertEqual(rest, "second paragraph\n\nthird\n")
        self.assertIn("rung 5", warn)

    def test_rung6_single_block(self):
        body = "just one block of text\nwith no blank line\n"
        (summ, rest), warn = self._run(body)
        self.assertEqual(summ, "just one block of text\nwith no blank line\n")
        self.assertEqual(rest, "")
        self.assertIn("rung 6", warn)


class TestTableBannerKey(unittest.TestCase):
    def test_table_full(self):
        fm = {
            "producer": "bug-investigator", "artifact": "investigation-report",
            "issue_id": "node-20-upgrade", "status": "complete", "date": "2026-05-12",
            "rp1_doc_id": "9f27673c",
        }
        rows = project.build_table_rows(fm, "examples/x-input.md")
        self.assertEqual(rows[0], "| Field | Value |")
        self.assertEqual(rows[1], "|-------|-------|")
        self.assertIn("| Producer | `bug-investigator` |", rows)
        self.assertIn("| Artifact type | `investigation-report` |", rows)
        self.assertIn("| Doc ID | `9f27673c` |", rows)
        self.assertIn("| Source path | `examples/x-input.md` (gitignored, local to author) |", rows)
        self.assertEqual(len(rows), 9)  # header + sep + 7 data rows

    def test_table_routing_only_skips_absent(self):
        fm = {"producer": "bug-investigator", "type": "document"}
        rows = project.build_table_rows(fm, "examples/r-input.md")
        self.assertIn("| Producer | `bug-investigator` |", rows)
        self.assertIn("| Artifact type | `document` |", rows)  # falls back to `type`
        self.assertNotIn("Issue ID", "\n".join(rows))
        self.assertNotIn("Status", "\n".join(rows))
        self.assertNotIn("Doc ID", "\n".join(rows))
        # header + sep + producer + artifact-type + source path
        self.assertEqual(len(rows), 5)

    def test_table_no_frontmatter_only_source(self):
        rows = project.build_table_rows({}, "examples/n-input.md")
        self.assertEqual(len(rows), 3)  # header + sep + source path only

    def test_banner_incomplete(self):
        self.assertEqual(
            project.build_banner({"status": "incomplete"}),
            "> ⚠️ **This artifact is marked `incomplete`.** Reviewers: the analysis below may evolve.",
        )

    def test_banner_absent(self):
        self.assertIsNone(project.build_banner({"status": "complete"}))
        self.assertIsNone(project.build_banner({}))

    def test_key_prefers_doc_id(self):
        self.assertEqual(project.marker_key({"rp1_doc_id": "abc"}, "examples/x.md"), "abc")

    def test_key_falls_back_to_path(self):
        self.assertEqual(project.marker_key({}, "examples/x.md"), "path:examples/x.md")


class TestAssembleAndProject(unittest.TestCase):
    def test_assemble_no_banner_with_rest(self):
        rows = ["| Field | Value |", "|-------|-------|", "| Producer | `p` |",
                "| Source path | `examples/x.md` (gitignored, local to author) |"]
        out = project.assemble("doc1", "Title", rows, None, "lead\n", "## Rest\n\nmore\n")
        self.assertTrue(out.startswith("<!-- rp1-artifact: doc1 -->\n## \U0001F4CB rp1 Artifact: Title\n\n"))
        self.assertIn("\n\n### Executive Summary\n\nlead\n\n<details>\n", out)
        self.assertIn("\n</details>\n\n---\n<sub>", out)
        self.assertTrue(out.endswith("</sub>\n"))

    def test_assemble_banner_no_rest(self):
        rows = ["| Field | Value |", "|-------|-------|",
                "| Source path | `examples/x.md` (gitignored, local to author) |"]
        out = project.assemble("doc1", "T", rows, project.BANNER, "only summary\n", "")
        self.assertIn(project.BANNER + "\n\n### Executive Summary\n", out)
        self.assertNotIn("<details>", out)

    def test_size_check(self):
        self.assertIsNone(project.check_size("x" * 10))
        msg = project.check_size("x" * (project.MAX_BYTES + 1))
        self.assertIn("exceeds GitHub's 65 KB cap", msg)


class TestGolden(unittest.TestCase):
    EX = os.path.join(HERE, "..", "examples")
    CASES = [
        ("investigation-report", "examples/investigation-report-input.md"),
        ("incomplete-status", "examples/incomplete-status-input.md"),
        ("no-summary", "examples/no-summary-input.md"),
        ("no-doc-id", "examples/no-doc-id-input.md"),
        ("routing-only", "examples/routing-only-input.md"),
        ("no-frontmatter", "examples/no-frontmatter-input.md"),
        ("lead-split", "examples/lead-split-input.md"),
        ("split-marker", "examples/split-marker-input.md"),
    ]

    def test_golden(self):
        for name, source in self.CASES:
            with self.subTest(name=name):
                inp = os.path.join(self.EX, f"{name}-input.md")
                outp = os.path.join(self.EX, f"{name}-output.md")
                body, _ = project.project(inp, source)
                with open(outp, encoding="utf-8") as f:
                    expected = f.read()
                self.assertEqual(body, expected)


if __name__ == "__main__":
    unittest.main()
