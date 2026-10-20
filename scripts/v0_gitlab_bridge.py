"""Mirror owned v0 branches and open GitLab MRs without running branch code."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request

GITHUB_REPOSITORY = 'ilyaKhim/skladno-ui'
GITLAB_PROJECT = '87833614'
GITLAB_REPOSITORY = 'https://gitlab.com/ilyaKhim/godeck.git'


def source_branch(event, event_name):
    if event_name == 'push':
        if event.get('deleted'):
            return None
        ref = event.get('ref', '')
        branch = ref.removeprefix('refs/heads/') if ref.startswith('refs/heads/') else ''
    elif event_name == 'pull_request_target':
        pr = event['pull_request']
        if pr['head']['repo']['full_name'] != GITHUB_REPOSITORY or pr['base']['ref'] != 'main':
            return None
        branch = pr['head']['ref']
    elif event_name == 'workflow_dispatch':
        branch = event.get('inputs', {}).get('branch', '')
    else:
        return None
    if not branch.startswith('v0/'):
        return None
    return branch


def git(*args, env=None, allow_failure=False):
    result = subprocess.run(['git', *args], text=True, capture_output=True, env=env)
    if result.returncode and not allow_failure:
        # Do not print credentials, subprocess environment or authenticated URLs.
        raise RuntimeError('Git operation failed: ' + args[0] + '\n' + result.stderr)
    return result


def api(path, token, method='GET', payload=None):
    request = urllib.request.Request(
        'https://gitlab.com/api/v4/projects/' + GITLAB_PROJECT + path,
        headers={'PRIVATE-TOKEN': token, 'Content-Type': 'application/json'},
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'GitLab API {method} {path}: HTTP {error.code}') from None


def main():
    if os.environ.get('GITHUB_REPOSITORY') != GITHUB_REPOSITORY:
        raise RuntimeError('Unexpected source repository')
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    branch = source_branch(event, os.environ['GITHUB_EVENT_NAME'])
    if branch is None:
        print('No eligible v0 branch to synchronize')
        return
    git('check-ref-format', 'refs/heads/' + branch)
    token = os.environ['GITLAB_BRIDGE_TOKEN']
    if not token:
        raise RuntimeError('GITLAB_BRIDGE_TOKEN is missing')
    target_branch = 'v0/github/' + branch[len('v0/'):]
    with tempfile.TemporaryDirectory() as directory:
        # Credentials are supplied in a temporary config, not command arguments.
        config = Path(directory) / 'gitconfig'
        github_auth = base64.b64encode(('x-access-token:' + os.environ['GH_READ_TOKEN']).encode()).decode()
        gitlab_auth = base64.b64encode(('oauth2:' + token).encode()).decode()
        config.write_text(
            '[http "https://github.com/"]\n\textraHeader = Authorization: Basic ' + github_auth + '\n'
            '[http "https://gitlab.com/"]\n\textraHeader = Authorization: Basic ' + gitlab_auth + '\n'
        )
        config.chmod(0o600)
        env = {**os.environ, 'GIT_CONFIG_GLOBAL': str(config), 'GIT_TERMINAL_PROMPT': '0'}
        git('fetch', '--no-tags', 'https://github.com/' + GITHUB_REPOSITORY + '.git',
            '+refs/heads/' + branch + ':refs/remotes/bridge/source', env=env)
        git('fetch', '--no-tags', GITLAB_REPOSITORY,
            '+refs/heads/main:refs/remotes/bridge/main', env=env)
        source = git('rev-parse', 'refs/remotes/bridge/source').stdout.strip()
        if git('merge-base', '--is-ancestor', source, 'refs/remotes/bridge/main', allow_failure=True).returncode == 0:
            print('This branch is already included in GitLab main; nothing to open')
            return
        git('merge-base', source, 'refs/remotes/bridge/main')
        existing = git('ls-remote', GITLAB_REPOSITORY, 'refs/heads/' + target_branch, env=env).stdout.strip()
        previous = existing.split()[0] if existing else ''
        git('push', '--force-with-lease=refs/heads/' + target_branch + ':' + previous,
            GITLAB_REPOSITORY, source + ':refs/heads/' + target_branch, env=env)
    query = urllib.parse.urlencode({'state': 'opened', 'source_branch': target_branch, 'target_branch': 'main'})
    opened = api('/merge_requests?' + query, token)
    pr = event.get('pull_request')
    title = pr['title'] if pr else 'v0: ' + re.sub(r'[-_]+', ' ', branch[len('v0/'):])
    if not opened:
        payload = {
            'source_branch': target_branch, 'target_branch': 'main', 'title': title[:255],
            'description': 'Изменения из v0. Исходная ветка: https://github.com/' + GITHUB_REPOSITORY
                + '/tree/' + urllib.parse.quote(branch, safe='/')
                + '\n\nЭтот MR автоматически получает новые коммиты исходной ветки. '
                  'Проверяйте и сливайте изменения в GitLab. После слияния main синхронизируется с GitHub.',
            'remove_source_branch': True,
        }
        mr = api('/merge_requests', token, 'POST', payload)
    else:
        mr = opened[0]
        # Preserve reviewer edits when the event is just another branch push.
        if pr and mr['title'] != title[:255]:
            mr = api('/merge_requests/' + str(mr['iid']), token, 'PUT', {'title': title[:255]})
    print('GitLab merge request: ' + mr['web_url'])
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('[Открыть merge request в GitLab](' + mr['web_url'] + ')\n')


if __name__ == '__main__':
    main()
