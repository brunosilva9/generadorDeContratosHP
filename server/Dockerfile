# Single image: Gotenberg (LibreOffice/Chromium PDF API) + Caddy as a thin
# reverse proxy that adds permissive CORS so the static frontend (on GitHub
# Pages or anywhere else) can call us.
#
# Gotenberg listens on 3000 internally; Caddy on 8080 is the public port.

FROM gotenberg/gotenberg:8

USER root

# Caddy — installed from the official Cloudsmith repo for trixie.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        debian-keyring \
        debian-archive-keyring \
        apt-transport-https \
        curl \
        gnupg \
        ca-certificates && \
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && \
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends caddy && \
    rm -rf /var/lib/apt/lists/*

COPY Caddyfile /etc/caddy/Caddyfile
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Cloud Run will set PORT; we hand it to Caddy.
ENV PORT=8080
EXPOSE 8080

USER gotenberg
ENTRYPOINT ["/entrypoint.sh"]
