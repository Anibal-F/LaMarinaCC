#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env.prod" ]]; then
  echo "ERROR: .env.prod no existe en $ROOT_DIR"
  exit 1
fi

echo "==> Build + deploy (prod)"
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

echo "==> Estado de contenedores"
docker compose --env-file .env.prod -f docker-compose.prod.yml ps

wait_for_url() {
  local url="$1"
  local retries="${2:-30}"
  local delay="${3:-2}"
  local i
  for i in $(seq 1 "$retries"); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

echo "==> Health checks"
wait_for_url "http://localhost:3010/health" 40 2
wait_for_url "http://localhost:8010/health" 40 2
echo "OK: frontend y backend saludables"

if [[ "${1:-}" == "--domain-check" ]]; then
  echo "==> Health checks por dominio"
  wait_for_url "https://marinasuite.com.mx" 25 2
  wait_for_url "https://marinasuite.com.mx/api/health" 25 2
  echo "OK: dominio y API por HTTPS saludables"
fi
