#!/usr/bin/env bash
# Update https://danielsknowledge.com/halloween/ . The server that hosts the
# knowledge site serves this repo's visualizer/ folder through an Apache
# Alias from a plain clone of this public repo, so deploying is a push here
# and a pull there. The server address and key are not in the repo: they
# come from tools/deploy_site.env (gitignored), which sets DEPLOY_SSH to the
# full ssh command prefix, for example
#     DEPLOY_SSH="ssh -i ~/.ssh/<key>.pem <user>@<host>"
#
#     tools/deploy_site.sh        push main, pull on the server, probe the URL
set -euo pipefail
cd "$(dirname "$0")/.."
source tools/deploy_site.env
git push -q origin main
$DEPLOY_SSH -o BatchMode=yes \
  'cd ~/git/halloween_display && git pull -q --ff-only && git log -1 --format="server at %h %s"' \
  2>&1 | grep -v "post-quantum\|store now\|openssh.com/pq" || true
curl -s -o /dev/null -w "https://danielsknowledge.com/halloween/ -> HTTP %{http_code}\n" \
  https://danielsknowledge.com/halloween/
