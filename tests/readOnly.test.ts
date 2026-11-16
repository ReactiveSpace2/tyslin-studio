// Command classification for Ask first (read-only auto-allow) and Auto mode. Classification only: nothing is run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isReadOnlyCommand, isRiskyCommand, shellSegments } from '../src/main/readOnly'

test('read-only: commands that only look still pass', () => {
  for (const c of [
    'git status', 'git log --oneline -5', 'git diff main..HEAD', 'git --no-pager diff', 'git branch', 'git branch -a',
    'git branch --show-current', 'git remote', 'git remote -v', 'git remote get-url origin', 'git tag', 'git tag -l v1*',
    'git stash list', 'git config --get user.name', 'git config --list', 'ls src', 'cat package.json',
    "sed -n '1,120p' src/a.ts", "sed -n '/foo/p' a.txt", "sed 's/a/b/g' f.txt", "sed -n '$p' f.txt", "awk '{print $NF}' f.txt",
    "awk -F: '{print $1}' f.txt", 'grep -rn "a|b" src', 'node -v', 'which pnpm', 'pnpm ls', 'find . -name "*.ts"',
    'date +%F', 'sort a.txt', 'uniq a.txt', 'head -n 5 a.txt | wc -l'
  ]) assert.equal(isReadOnlyCommand(c), true, c)
})

test('read-only: the reported mutations ask (16 Nov 2026 QA)', () => {
  for (const c of ['git branch -D release', 'git remote remove origin', "sed 'w copy.txt' input.txt"]) assert.equal(isReadOnlyCommand(c), false, c)
})

test('read-only: other writes, programs and unknown forms ask', () => {
  for (const c of [
    // git: new names, deletes, renames, settings, remotes, global options
    'git branch newname', 'git branch -m a b', 'git branch -d x', 'git branch --set-upstream-to=o/x', 'git tag v1', 'git tag -d v1',
    'git remote add o https://x', 'git remote set-url o u', 'git remote show origin', 'git remote get-url --push o x',
    'git config user.name x', 'git config --get a b', 'git stash drop', 'git stash', 'git -C /x status', 'git -c core.pager=x log',
    'git diff --output=x', 'git diff --ext-diff',
    // sed: write, execute, in place, script files
    "sed 's/a/b/w out' f", "sed -n '1p;e touch x' f", "sed -i 's/a/b/' f", 'sed -f script.sed f', "sed 'r /etc/passwd' f", "sed '1W out' f",
    "sed -n --expression='w x' f",
    // other lookers' writing or program-running options
    'sort -o out a', 'sort --output=out a', 'sort --compress-program=sh a', 'uniq a b', 'find . -delete', 'find . -execdir touch x ;',
    "awk 'BEGIN{system(\"touch x\")}'", "awk '{print | \"sh\"}' f", 'awk -f p.awk f', 'awk -i inplace 1 f',
    'tree -o out', 'file -C -m m', 'rg --pre ./x foo', 'date -s 2020-01-01', 'date 010101012020',
    // programs disguised or changed by the environment
    'LD_PRELOAD=x.so ls', 'GIT_EXTERNAL_DIFF=./x git diff', './ls', '/tmp/x/ls', 'command touch x', 'xargs touch', 'less f',
    // outside the folder
    'echo $HOME', 'cat "$HOME/.bashrc"', 'cat ../x', 'grep --file=/etc/passwd x', 'cat ~/.ssh/id_rsa'
  ]) assert.equal(isReadOnlyCommand(c), false, c)
})

test('risky: deleting outside the folder asks, however it is quoted (16 Nov 2026 QA)', () => {
  for (const c of [
    'rm -rf "/outside-team"', 'rm -rf -- /outside-team', "rm -rf '/outside-team'", 'rm -rf -- "/outside team"', 'rm -r -f -- ~/x',
    'rm -rf "$HOME"', 'rm -rf "${HOME}/x"', 'rm -r ../x', 'rm -rf "../x"', 'rm -rf .', 'rm -rf *', 'rm -rf ./', 'rm --recursive -- "*"',
    'cd x && rm -rf "/a b"', "bash -c 'rm -rf \"/x\"'", 'sh -c "rm -rf -- /x"', '`rm -rf /x`', '/bin/rm -rf /x', '\\rm -rf /x'
  ]) assert.equal(isRiskyCommand(c), true, c)
})

test('risky: deleting inside the folder still runs in Auto mode', () => {
  for (const c of ['rm -rf node_modules', 'rm -f build/a.js', 'rm -rf dist/', 'rm -- -weird-name', 'rm "a b.txt"', 'git rm -r --cached .', 'ls -la /'])
    assert.equal(isRiskyCommand(c), false, c)
})

test('shellSegments reads quotes, escapes and separators like the shell', () => {
  assert.deepEqual(shellSegments(`rm -rf "/a b" && echo 'x;y' | wc -l; a\\ b`), [['rm', '-rf', '/a b'], ['echo', 'x;y'], ['wc', '-l'], ['a b']])
})
