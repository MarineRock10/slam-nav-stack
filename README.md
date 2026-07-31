# slam-nav-stack

[![ROS2](https://img.shields.io/badge/ROS2-Humble-blue)](https://docs.ros.org/en/humble/)
[![Python](https://img.shields.io/badge/python-3.8%2B-blue)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-GPL--3.0-green)](LICENSE)
[![Live Console](https://img.shields.io/badge/console-live-35c8e8)](https://marinerock10.github.io/slam-nav-stack/)
[![Pages](https://img.shields.io/badge/docs-GitHub%20Pages-35c8e8)](https://pages.github.com/)

Graph-based **SLAM** (Simultaneous Localization and Mapping) and **waypoint
navigation** stack for 2D LiDAR field robots. Maintains a global pose-graph
from odometry and scan matches, optimizes loop closures, and drives the
robot along planned paths through a costmap.

The companion **field navigation console** (telemetry web app, published to
GitHub Pages from `docs/`) provides live mission monitoring: map coverage,
waypoint queues, and sensor telemetry — no ROS installation required to
browse it.

## Features

- **Graph SLAM backend** — pose-graph construction and Gauss-Newton
  relaxation (`src/slam/graph_slam.py`)
- **Scan matching front-end** — ICP configuration for 10 Hz 2D LiDAR
- **Occupancy grid mapping** — 5 cm resolution, 40 × 40 m field map
- **A\* path planning** — costmap-aware shortest path search
- **Waypoint queueing** — sequenced mission execution with retry policy
- **Loop closure** — radius-based candidate search with score gating
- **Web telemetry console** — zero-dependency static app in `docs/`,
  styled as a mission HUD (map coverage, telemetry charts, sensor log)

## Layout

```
├── config/            # ROS2-style parameter files (slam, navigation)
├── docs/              # Field navigation console (GitHub Pages source)
├── scripts/           # Build / demo helpers
└── src/slam/          # Python package: graph SLAM + navigation
    ├── graph_slam.py  # pose graph, edges, relaxation
    └── navigation.py  # occupancy grid, A*, waypoint queue
```

## Build

Requires ROS2 Humble (or a plain Python 3.8+ environment for the
pure-Python modules).

```bash
./scripts/build.sh
source install/setup.bash
```

Python-only usage:

```bash
python3 -c "
from slam.graph_slam import Pose, build_graph
from slam.navigation import OccupancyGrid, plan_path
g = OccupancyGrid(200, 200)
path = plan_path(g, Pose(1.0, 1.0), Pose(5.0, 4.0))
print('path waypoints:', len(path) if path else 'unreachable')
"
```

## Demo / Web Console

```bash
./scripts/launch_demo.sh     # serves docs/ at http://localhost:8080
```

The web console is a static site — deploy it anywhere (e.g. GitHub
Pages, `Settings → Pages → Deploy from branch → main /docs`). It reads no
external services and stores mission state locally in the browser.

## Parameters

Tuning knobs live in `config/slam_params.yaml` (scan matcher, graph
optimization, grid resolution) and `config/nav_params.yaml` (planner,
controller limits, watchdog). See file headers for field descriptions.

## License

GPL-3.0 — see [LICENSE](LICENSE). Vocabulary dataset embedded in
`docs/assets/js/words/` aggregates word lists from the
[qwerty-learner](https://github.com/Kaiyiwing/qwerty-learner) project
(GPL-3.0); see the header of `ielts-data.js` for attribution.

## Roadmap

- [x] Pose graph SLAM backend
- [x] A* planner + waypoint queue
- [x] Web telemetry console
- [ ] 3D LiDAR (Livox) front-end
- [ ] Dynamic obstacle layer
- [ ] Multi-robot map merging
