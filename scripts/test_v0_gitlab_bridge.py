import json
import os
from pathlib import Path
from subprocess import CompletedProcess
import tempfile
import unittest
from unittest.mock import patch

import v0_gitlab_bridge as bridge


class BridgeTests(unittest.TestCase):
    def test_eligible_events(self):
        self.assertEqual(bridge.source_branch({'ref': 'refs/heads/v0/new-page'}, 'push'), 'v0/new-page')
        self.assertEqual(bridge.source_branch({'inputs': {'branch': 'v0/new-page'}}, 'workflow_dispatch'), 'v0/new-page')
        self.assertIsNone(bridge.source_branch({'ref': 'refs/heads/main'}, 'push'))
        self.assertIsNone(bridge.source_branch({'ref': 'refs/heads/v0/new-page', 'deleted': True}, 'push'))
        self.assertIsNone(bridge.source_branch({}, 'unknown'))

    def test_fork_pr_is_rejected(self):
        pr = {'head': {'repo': {'full_name': 'someone/fork'}, 'ref': 'v0/new-page'}, 'base': {'ref': 'main'}}
        self.assertIsNone(bridge.source_branch({'pull_request': pr}, 'pull_request_target'))

    def exercise(self, opened=False, merged=False):
        calls = []
        def fake_git(*args, **kwargs):
            if args[:2] == ('merge-base', '--is-ancestor'):
                return CompletedProcess(args, 0 if merged else 1, '', '')
            if args[0] in ('rev-parse', 'merge-base'):
                return CompletedProcess(args, 0, 'a' * 40 + '\n', '')
            if args[0] == 'ls-remote':
                return CompletedProcess(args, 0, 'b' * 40 + '\trefs/heads/v0/github/new-page\n', '')
            return CompletedProcess(args, 0, '', '')
        def fake_api(path, token, method='GET', payload=None):
            calls.append((path, method, payload))
            mr = {'iid': 1, 'title': 'Reviewer title', 'web_url': 'https://gitlab.com/example/-/merge_requests/1'}
            return ([mr] if opened else []) if method == 'GET' else mr
        with tempfile.TemporaryDirectory() as directory:
            event = Path(directory) / 'event.json'
            event.write_text(json.dumps({'ref': 'refs/heads/v0/new-page'}))
            env = {'GITHUB_REPOSITORY': bridge.GITHUB_REPOSITORY, 'GITHUB_EVENT_PATH': str(event),
                   'GITHUB_EVENT_NAME': 'push', 'GITLAB_BRIDGE_TOKEN': 'test-only', 'GH_READ_TOKEN': 'test-only'}
            with patch.dict(os.environ, env), patch.object(bridge, 'git', side_effect=fake_git) as git_mock, patch.object(bridge, 'api', side_effect=fake_api), patch('builtins.print'):
                bridge.main()
            return calls, git_mock.call_args_list

    def test_creates_mr_for_owned_mirror_only(self):
        calls, commands = self.exercise()
        payload = next(payload for _, method, payload in calls if method == 'POST')
        self.assertEqual(payload['source_branch'], 'v0/github/new-page')
        self.assertEqual(payload['target_branch'], 'main')
        pushes = [c.args for c in commands if c.args[0] == 'push']
        self.assertEqual(len(pushes), 1)
        self.assertIn('--force-with-lease=refs/heads/v0/github/new-page:' + 'b' * 40, pushes[0])
        self.assertTrue(pushes[0][-1].endswith(':refs/heads/v0/github/new-page'))

    def test_updates_branch_without_duplicate_mr_or_overwriting_reviewer_title(self):
        calls, _ = self.exercise(opened=True)
        self.assertEqual([method for _, method, _ in calls], ['GET'])

    def test_merged_branch_does_not_reopen_mr(self):
        calls, commands = self.exercise(merged=True)
        self.assertEqual(calls, [])
        self.assertFalse(any(c.args[0] == 'push' for c in commands))


if __name__ == '__main__':
    unittest.main()
