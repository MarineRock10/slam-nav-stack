#!/usr/bin/env bash
# slam-nav-stack :: colcon build helper (ROS2 workspace)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v colcon >/dev/null 2>&1; then
  echo "[slam-nav-stack] colcon not found — run: pip install colcon-common-extensions" >&2
  exit 1
fi

echo "[slam-nav-stack] building workspace: ${ROOT_DIR}"
colcon build --symlink-install --cmake-args -DCMAKE_BUILD_TYPE=Release "$@"

echo "[slam-nav-stack] done. source:"
echo "  source ${ROOT_DIR}/install/setup.bash"
