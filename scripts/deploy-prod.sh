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

echo "==> Health checks"
curl -fsS http://localhost:3010/health >/dev/null
curl -fsS http://localhost:8010/health >/dev/null
echo "OK: frontend y backend saludables"

if [[ "${1:-}" == "--domain-check" ]]; then
  echo "==> Health checks por dominio"
  curl -fsS https://marinasuite.com.mx >/dev/null
  curl -fsS https://marinasuite.com.mx/api/health >/dev/null
  echo "OK: dominio y API por HTTPS saludables"
fi
