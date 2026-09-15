# Keycloak with the dev realm baked in. Baked rather than bind-mounted because a mount needs the
# file on the Docker daemon's host, which is not true whenever DOCKER_HOST points elsewhere; a
# build context is sent over the API and always works.
#
# glossa-realm.json cannot carry comments, so its two non-obvious choices live here:
#  - the `glossa` client enables the password grant, so an API or MCP call can be tested with a
#    real token and no browser;
#  - it accepts redirects on both :5173 (the Vite dev server, which proxies /auth to Flash) and
#    :8080 (Flash reached directly) — Flash derives redirect_uri from the request's Host header.
FROM quay.io/keycloak/keycloak:26.4
COPY glossa-realm.json /opt/keycloak/data/import/glossa-realm.json
