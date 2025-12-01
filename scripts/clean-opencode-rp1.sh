#!/usr/bin/env bash
set -euf -o pipefail

find ~/.config/opencode/ -type d -name 'rp1-*' -exec rm -rf {} +
rm -rf ~/.config/opencode/skills
