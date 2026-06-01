import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
sys.path.insert(0, SCRIPTS)

import publish  # noqa: E402


def _c(login, cid=1, body="x", url="https://gh/c/1", updated="2026-01-01T00:00:00Z"):
    return {"user_login": login, "id": cid, "body": body,
            "html_url": url, "updated_at": updated}


class TestFindMarkerMatches(unittest.TestCase):
    def test_matches_only_when_marker_on_line_one(self):
        key = "path:examples/x.md"
        marker = publish.MARKER_FMT.format(key=key)
        hit = _c("me", body=marker + "\n## body\n")
        miss_mid = _c("me", cid=2, body="intro\n" + marker)  # marker not at start
        miss_other = _c("me", cid=3, body="<!-- rp1-artifact: other -->\n")
        matches = publish.find_marker_matches([hit, miss_mid, miss_other], key)
        self.assertEqual([m["id"] for m in matches], [1])


class TestDecideAction(unittest.TestCase):
    def test_zero_matches_posts(self):
        self.assertEqual(publish.decide_action([], "me", force=False), ("POST", None))

    def test_one_mine_patches(self):
        self.assertEqual(
            publish.decide_action([_c("me", cid=7)], "me", force=False),
            ("PATCH", 7),
        )

    def test_one_foreign_refuses_without_force(self):
        with self.assertRaises(publish.Refusal) as ctx:
            publish.decide_action([_c("someone-else")], "me", force=False)
        self.assertIn("owned by @someone-else", str(ctx.exception))

    def test_one_foreign_patches_with_force(self):
        self.assertEqual(
            publish.decide_action([_c("someone-else", cid=9)], "me", force=True),
            ("PATCH", 9),
        )

    def test_multiple_always_refuses_even_with_force(self):
        two = [_c("me", cid=1, url="u1"), _c("me", cid=2, url="u2")]
        for force in (False, True):
            with self.assertRaises(publish.Refusal) as ctx:
                publish.decide_action(two, "me", force=force)
            self.assertIn("Delete duplicates manually", str(ctx.exception))


class TestSoftDetectOrphan(unittest.TestCase):
    def test_warns_when_prior_footer_by_me_without_marker(self):
        prior = _c("me", body="stuff\n<sub>... Posted by `publish-artifact`. ...</sub>")
        warn = publish.soft_detect_orphan([prior], "me", "path:x.md")
        self.assertIn("Idempotency is broken", warn)

    def test_silent_when_footer_belongs_to_someone_else(self):
        prior = _c("other", body="Posted by `publish-artifact`")
        self.assertIsNone(publish.soft_detect_orphan([prior], "me", "path:x.md"))

    def test_silent_when_no_prior_footer(self):
        self.assertIsNone(publish.soft_detect_orphan([_c("me", body="hi")], "me", "k"))


class TestMtimeWarning(unittest.TestCase):
    def test_warns_when_local_older(self):
        comment_ts = 2_000_000_000  # comment newer than local
        warn = publish.mtime_warning(1_000_000_000, "2033-05-18T03:33:20", force=False)
        self.assertIn("older than the existing comment", warn)
        self.assertIsNotNone(comment_ts)

    def test_silent_when_local_newer(self):
        self.assertIsNone(
            publish.mtime_warning(2_000_000_000, "2001-09-09T01:46:40", force=False)
        )

    def test_force_suppresses(self):
        self.assertIsNone(
            publish.mtime_warning(0, "2033-05-18T03:33:20", force=True)
        )


class TestDiagnosticAndSuccess(unittest.TestCase):
    def test_target_line_pr_carries_base_head(self):
        self.assertEqual(
            publish.target_line("pr", 12, "OPEN", "main", "feat"),
            "#12 (OPEN, base: main, head: feat)",
        )

    def test_target_line_issue(self):
        self.assertEqual(publish.target_line("issue", 5, "OPEN", "", ""), "#5 (OPEN, issue)")

    def test_diagnostic_block_shape(self):
        d = publish.build_diagnostic(
            "issues/x.md", "path:issues/x.md", "issue", 576, "OPEN",
            "", "", 10050, "POST", "none",
        )
        self.assertTrue(d.startswith("=== publish-artifact (dry run) ===\n"))
        self.assertIn("Artifact: issues/x.md\n", d)
        self.assertIn("Doc key:  path:issues/x.md\n", d)
        self.assertIn("Target:   #576 (OPEN, issue)\n", d)
        self.assertIn(f"Size:     10050 / {publish.project.MAX_BYTES} bytes\n", d)
        self.assertIn("Action:   would POST (matched comment: none)\n", d)
        self.assertTrue(d.endswith("--- projected comment body ---\n"))

    def test_success_post_pr(self):
        msg = publish.format_success(
            "POST", "pr", 42, {"artifact": "investigation-report", "issue_id": "node-20"},
            "abc", "https://gh/c/9", 25395,
        )
        self.assertIn("✓ Posted rp1 artifact on PR #42", msg)
        self.assertIn("investigation-report / node-20 (doc_key abc)", msg)
        self.assertIn("24.8 KB / 65 KB cap", msg)

    def test_success_patch_issue_untyped(self):
        msg = publish.format_success("PATCH", "issue", 7, {}, "path:x.md",
                                     "https://gh/c/1", 1024)
        self.assertIn("✓ Updated rp1 artifact on issue #7", msg)
        self.assertIn("(untyped) / — (doc_key path:x.md)", msg)


if __name__ == "__main__":
    unittest.main()
