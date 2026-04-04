#!/bin/sh

branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null) || exit 0

case "$branch" in
  main|master)
    echo "Direct commits to $branch are not allowed."
    echo "Create a feature branch and open a pull request instead."
    exit 1
    ;;
esac

exit 0
