#!/usr/bin/env bash
# slam-nav-stack :: launch demo (mapping + navigation)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${ROOT_DIR}/config"

echo "[slam-nav-stack] launching field nav demo..."
echo "[slam-nav-stack]   slam:    $(realpath ${CONFIG_DIR}/slam_params.yaml)"
echo "[slam-nav-stack]   nav:     $(realpath ${CONFIG_DIR}/nav_params.yaml)"
echo "[slam-nav-stack]   console: http://localhost:8080 (serve docs/ via any static server)"

# Real launch would invoke: ros2 launch slam_nav_stack demo.launch.py
# Static console preview (no ROS required):
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server 8080 --directory "${ROOT_DIR}/docs" &
  SERVER_PID=$!
  trap 'kill ${SERVER_PID} 2>/dev/null || true' EXIT
  echo "[slam-nav-stack] serving docs/ at http://localhost:8080 — Ctrl+C to stop"
  wait ${SERVER_PID}
else
  echo "[slam-nav-stack] python3 not found; serve docs/ with your preferred static server." >&2
fi
