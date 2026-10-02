#!/usr/bin/env bash
# Deploys the Nawara Admin static frontend on the VPS. Runs ON THE SERVER, streamed out of the image being deployed (the
# Nawara Core convention, so the script always matches the image):
#
#   docker run --rm --entrypoint cat "$IMAGE" /deploy/provision-and-deploy.sh | IMAGE="$IMAGE" bash -s
#   ROLLBACK=1 bash -s < provision-and-deploy.sh          # restore the most recent previous container
#
# Scope: ONE container, nawara-admin-web, routed by Traefik on the existing edge network. It needs no secret and no env
# file. It never creates networks, never touches another service's containers, and only removes its own superseded
# containers (nawara-admin-web-previous-*), keeping the newest ones for rollback.
set -euo pipefail

APP=nawara-admin-web
NET="${DEPLOY_NETWORK:-deploy_edge}"
HOST_RULE="${ADMIN_HOST:-admin.nawara-solutions.com}"
DIR="${DEPLOY_DIR:-$HOME/nawara-admin}"
KEEP_PREVIOUS="${KEEP_PREVIOUS:-2}"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
exists() { docker inspect "$1" >/dev/null 2>&1; }

mkdir -p "$DIR"
# One deployment at a time on this server, whatever started it (the workflow also queues per target).
exec 9>"$DIR/deploy.lock"
command -v flock >/dev/null && { flock -w 300 9 || die "another Admin deployment holds $DIR/deploy.lock"; }

docker network inspect "$NET" >/dev/null 2>&1 || die "docker network '$NET' not found (Traefik's network); refusing to create it"

wait_healthy() {
  local st=""
  for _ in $(seq 1 30); do
    st=$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$APP" 2>/dev/null || true)
    [ "$st" = running/healthy ] && return 0
    [ "${st%%/*}" = running ] || break
    sleep 2
  done
  log "state: ${st:-missing}"
  return 1
}

newest_previous() {
  docker ps -a --filter "name=^${APP}-previous-" --format '{{.Names}}' | sort -r | head -n 1
}

if [ "${ROLLBACK:-}" = 1 ]; then
  PREV=$(newest_previous)
  [ -n "$PREV" ] || die "no previous container to roll back to"
  if exists "$APP"; then
    FAILED="$APP-failed-$(date +%Y%m%d%H%M%S)"
    docker stop -t 10 "$APP" >/dev/null
    docker rename "$APP" "$FAILED"
    log "current container kept stopped as $FAILED"
  fi
  docker rename "$PREV" "$APP"
  docker start "$APP" >/dev/null
  wait_healthy || die "rolled-back container is not healthy"
  log "OK  rolled back to $(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$APP")"
  exit 0
fi

: "${IMAGE:?IMAGE (full image reference to deploy) is required}"

PREV=""
if exists "$APP"; then
  PREV="$APP-previous-$(date +%Y%m%d%H%M%S)"
  log "stopping current $APP and keeping it as $PREV"
  docker stop -t 10 "$APP" >/dev/null
  docker rename "$APP" "$PREV"
fi

log "starting $APP from $IMAGE for $HOST_RULE"
docker run -d --name "$APP" --restart unless-stopped --network "$NET" \
  --read-only --tmpfs /tmp:rw,size=16m --cap-drop ALL --security-opt no-new-privileges \
  --label traefik.enable=true \
  --label "traefik.docker.network=$NET" \
  --label "traefik.http.routers.$APP.rule=Host(\`$HOST_RULE\`)" \
  --label "traefik.http.routers.$APP.entrypoints=websecure" \
  --label "traefik.http.routers.$APP.tls.certresolver=le" \
  --label "traefik.http.services.$APP.loadbalancer.server.port=8080" \
  "$IMAGE" >/dev/null

if ! wait_healthy; then
  log "new container did not become healthy; last logs follow"
  docker logs --tail 40 "$APP" >&2 || true
  docker rm -f "$APP" >/dev/null 2>&1 || true
  if [ -n "$PREV" ]; then log "rolling back to $PREV"; docker rename "$PREV" "$APP"; docker start "$APP" >/dev/null; fi
  die "deploy failed"
fi

log "OK  $APP is running/healthy"
# Keep the newest KEEP_PREVIOUS superseded Admin containers for rollback; remove older ones (Admin's own names only).
docker ps -a --filter "name=^${APP}-previous-" --format '{{.Names}}' | sort -r | tail -n +"$((KEEP_PREVIOUS + 1))" \
  | while read -r old; do docker rm "$old" >/dev/null && log "removed superseded $old"; done
docker ps -a --filter "name=^${APP}" --format '  {{.Names}}\t{{.Status}}\t{{.Image}}'
