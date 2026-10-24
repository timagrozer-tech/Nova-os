#!/usr/bin/env bash
# Publish small CI results (reports, contact sheets, log tails) to an orphan
# branch ci/<name> so they can be read with plain git (artifacts need a browser).
# Usage (GitHub Actions only): bash tools/ci_publish.sh <name> <dir>
set -Eeuo pipefail
name="$1"; src="$2"
[[ "$name" =~ ^[a-z0-9-]+$ ]] || { echo "bad name" >&2; exit 2; }
[[ -d "$src" ]] || { echo "nothing to publish: $src" >&2; exit 0; }
[[ -n "${GITHUB_TOKEN:-}" && -n "${GITHUB_REPOSITORY:-}" ]] || { echo 'not in GitHub Actions' >&2; exit 0; }
tmp="$(mktemp -d)"
cp -a "$src"/. "$tmp"/
# keep the branch small: drop anything bigger than 4 MB
find "$tmp" -type f -size +4M -print -delete
cd "$tmp"
git init -q
git checkout -q --orphan "ci/$name"
git add -A
git -c user.name='github-actions[bot]' -c user.email='github-actions[bot]@users.noreply.github.com' \
  commit -q -m "CI results: $name (run ${GITHUB_RUN_ID:-?}, ${GITHUB_SHA:-?})"
git push -q --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "HEAD:refs/heads/ci/$name"
echo "Published to branch ci/$name"
