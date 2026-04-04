#!/bin/sh

remote_name=$1
remote_url=$2

branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null) || branch=""

while IFS=' ' read -r local_ref local_oid remote_ref remote_oid; do
  case "$remote_ref" in
    refs/heads/main|refs/heads/master)
      echo "Pushes targeting ${remote_ref#refs/heads/} are not allowed."
      echo "Current branch: ${branch:-detached HEAD}"
      echo "Remote: ${remote_name:-unknown} (${remote_url:-unknown})"
      echo "Push a feature branch and open a pull request instead."
      exit 1
      ;;
  esac
done

exit 0
