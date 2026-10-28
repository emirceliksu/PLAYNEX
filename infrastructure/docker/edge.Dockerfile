FROM caddy:2.10.2-alpine

COPY infrastructure/edge/Caddyfile /etc/caddy/Caddyfile

# The stock binary carries cap_net_bind_service as a file capability, which cannot be exec'd once
# compose drops every capability. The proxy listens on 8080, so the capability is not needed.
RUN apk add --no-cache libcap \
  && setcap -r /usr/bin/caddy \
  && apk del libcap

# Caddy keeps state under /data and /config; both are tmpfs in production, so any uid works.
USER 65534:65534
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD ["wget", "-qO-", "http://127.0.0.1:8080/edge-health"]
