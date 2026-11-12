#!/bin/bash
# Creates the starter issues from starter-issues.json on ReactiveSpace2/tyslin-studio. Safe to rerun: skips titles that exist.
set -e
REPO=ReactiveSpace2/tyslin-studio
DIR=$(cd "$(dirname "$0")/.." && pwd)/docs
gh label create "agency template" --repo $REPO --color 7DB800 --description "A new or changed agency template" 2>/dev/null || true
existing=$(gh issue list --repo $REPO --state all --limit 200 --json title -q '.[].title')
n=$(node -e 'console.log(require(process.argv[1]).length)' "$DIR/starter-issues.json")
for ((i=0;i<n;i++)); do
  title=$(node -e 'console.log(require(process.argv[1])[process.argv[2]].title)' "$DIR/starter-issues.json" $i)
  if grep -Fxq "$title" <<<"$existing"; then echo "skip: $title"; continue; fi
  labels=$(node -e 'console.log(require(process.argv[1])[process.argv[2]].labels.join(","))' "$DIR/starter-issues.json" $i)
  node -e 'process.stdout.write(require(process.argv[1])[process.argv[2]].body)' "$DIR/starter-issues.json" $i > "${TMPDIR:-/tmp}/tyslin-issue-body.md"
  gh issue create --repo $REPO --title "$title" --label "$labels" --body-file "${TMPDIR:-/tmp}/tyslin-issue-body.md"
done
