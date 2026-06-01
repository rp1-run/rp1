import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))
import parse_target  # noqa: E402


class TestParseTarget(unittest.TestCase):
    def test_pr_url(self):
        r = parse_target.parse("https://github.com/rp1-run/rp1/pull/564", "x/y")
        self.assertEqual(r, {"owner": "rp1-run", "repo": "rp1", "number": 564, "kind": "pr"})

    def test_issue_url(self):
        r = parse_target.parse("https://github.com/rp1-run/rp1/issues/576", "x/y")
        self.assertEqual(r, {"owner": "rp1-run", "repo": "rp1", "number": 576, "kind": "issue"})

    def test_bare_number_uses_current_repo_kind_unknown(self):
        r = parse_target.parse("573", "rp1-run/rp1")
        self.assertEqual(r, {"owner": "rp1-run", "repo": "rp1", "number": 573, "kind": "unknown"})

    def test_url_with_trailing_segment(self):
        r = parse_target.parse("https://github.com/o/r/pull/12/files", "x/y")
        self.assertEqual(r["number"], 12)
        self.assertEqual(r["kind"], "pr")

    def test_garbage_raises(self):
        with self.assertRaises(ValueError):
            parse_target.parse("not-a-target", "x/y")

    def test_empty_current_repo_for_bare_number_raises(self):
        with self.assertRaises(ValueError):
            parse_target.parse("573", "")


if __name__ == "__main__":
    unittest.main()
