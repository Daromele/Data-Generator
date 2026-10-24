#!/bin/sh
# Package this skill as a .skill file (a zip with the skill folder at the top
# level), the form Claude accepts as an upload.
#
# The repo copy is the source of truth; a .skill is a snapshot of it. Re-run
# this after changing the skill rather than editing an extracted copy, or the
# two drift apart.
#
# Usage:  sh scripts/package_skill.sh [output-dir]
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
name=$(basename "$here")
out=${1:-$here/..}
cd "$here/.."
rm -f "$out/$name.skill"
zip -r -q "$out/$name.skill" "$name" -x '*.DS_Store' '*__pycache__*' '*.pyc'
echo "wrote $out/$name.skill ($(unzip -l "$out/$name.skill" | tail -1 | awk '{print $2}') files)"
