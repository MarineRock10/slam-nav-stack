#!/usr/bin/env python3
"""slam-nav-stack :: graph-based SLAM backend (stub).

Pose-graph optimization for 2D LiDAR SLAM. This module exposes the
public API of the backend used by the field navigation console.
Builds the pose graph from odometry + scan matches and solves it
with a Gauss-Newton style relaxation.

NOTE: this is the C++ extension shim; the optimized core lives in
the `slam_core` package (see `colcon` build). Python bindings are
provided for tooling and the web telemetry bridge.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

try:
    import numpy as np
except ImportError:  # pragma: no cover - optional dev dependency
    np = None


@dataclass
class Pose:
    """2D robot pose in the global frame (x, y, theta)."""
    x: float = 0.0
    y: float = 0.0
    theta: float = 0.0

    def as_tuple(self) -> Tuple[float, float, float]:
        return (self.x, self.y, self.theta)

    def distance_to(self, other: "Pose") -> float:
        return math.hypot(self.x - other.x, self.y - other.y)


@dataclass
class ScanMatch:
    """A LiDAR scan matched against the local map."""
    pose: Pose
    score: float = 1.0
    inliers: int = 0


@dataclass
class GraphEdge:
    """Constraint between two pose nodes (relative transform)."""
    from_id: int
    to_id: int
    dx: float
    dy: float
    dtheta: float
    info: float = 1.0


class PoseGraph:
    """Minimal pose-graph container with relaxation solver."""

    def __init__(self) -> None:
        self._nodes: Dict[int, Pose] = {}
        self._edges: List[GraphEdge] = []
        self._next_id: int = 0

    def add_node(self, pose: Pose) -> int:
        nid = self._next_id
        self._next_id += 1
        self._nodes[nid] = pose
        return nid

    def add_edge(self, edge: GraphEdge) -> None:
        self._edges.append(edge)

    def optimize(self, iterations: int = 20) -> float:
        """Run Gauss-Newton relaxation; returns residual error."""
        if np is None:
            raise RuntimeError("numpy required for graph optimization")
        residual = 0.0
        for _ in range(iterations):
            residual = self._relax_once()
        return residual

    def _relax_once(self) -> float:
        total = 0.0
        for e in self._edges:
            f = self._nodes.get(e.from_id)
            t = self._nodes.get(e.to_id)
            if f is None or t is None:
                continue
            # simplified error: deviation from relative constraint
            err = math.hypot((t.x - f.x) - e.dx, (t.y - f.y) - e.dy)
            total += err * err * e.info
        return math.sqrt(total / max(1, len(self._edges)))

    def nodes(self) -> Dict[int, Pose]:
        return dict(self._nodes)

    def __len__(self) -> int:
        return len(self._nodes)


def build_graph(odometry: List[Pose], matches: List[ScanMatch],
                loop_closures: Optional[List[GraphEdge]] = None) -> PoseGraph:
    """Assemble a pose graph from an odometry trace and scan matches."""
    graph = PoseGraph()
    prev_id = -1
    for i, (odo, m) in enumerate(zip(odometry, matches)):
        nid = graph.add_node(m.pose)
        if prev_id >= 0:
            dx = odo.x - odometry[i - 1].x
            dy = odo.y - odometry[i - 1].y
            dth = odo.theta - odometry[i - 1].theta
            graph.add_edge(GraphEdge(prev_id, nid, dx, dy, dth, info=1.0))
        prev_id = nid
    for lc in loop_closures or []:
        graph.add_edge(lc)
    return graph


__all__ = ["Pose", "ScanMatch", "GraphEdge", "PoseGraph", "build_graph"]
