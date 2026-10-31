#!/usr/bin/env bash
# Lance Niger City dans le navigateur (serveur local nécessaire pour les modules ES).
cd "$(dirname "$0")"
PORT=${1:-8080}
echo "Niger City → http://localhost:$PORT"
(sleep 1; xdg-open "http://localhost:$PORT" >/dev/null 2>&1) &
python3 -m http.server "$PORT"
