#!/bin/sh
# Starts Gotenberg in the background, waits for it to be healthy, then runs
# Caddy in the foreground. Gotenberg uses its default port (3000) inside the
# container; only Caddy's port is exposed publicly.

set -e

gotenberg &
GOTENBERG_PID=$!

# Wait for Gotenberg to come up so Caddy doesn't 502 on the first request.
for _ in $(seq 1 40); do
    if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# If Gotenberg dies, exit the container so Cloud Run restarts us.
( while kill -0 "$GOTENBERG_PID" 2>/dev/null; do sleep 5; done; kill -TERM 1 ) &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
