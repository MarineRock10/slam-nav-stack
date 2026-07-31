#!/usr/bin/env python3
"""slam-nav-stack :: waypoint navigation planner (stub).

Grid-based path planning for the field navigation stack.
Provides Dijkstra / A* search over an occupancy grid plus a
simple follow-the-path controller used by the navigation node.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from .graph_slam import Pose


@dataclass
class Waypoint:
    """A navigational waypoint (landmark) in the map frame."""
    id: int
    pose: Pose
    label: str = ""
    meta: dict = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.meta is None:
            self.meta = {}


class OccupancyGrid:
    """Simple 2D occupancy grid with cost-weighted A* search."""

    def __init__(self, width: int, height: int, resolution: float = 0.05) -> None:
        self.width = width
        self.height = height
        self.resolution = resolution
        self.cells: List[float] = [0.0] * (width * height)  # 0 free, 1 occupied

    def index(self, x: int, y: int) -> int:
        return y * self.width + x

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def occupied(self, x: int, y: int) -> bool:
        return self.in_bounds(x, y) and self.cells[self.index(x, y)] >= 0.6

    def set_cost(self, x: int, y: int, cost: float) -> None:
        if self.in_bounds(x, y):
            self.cells[self.index(x, y)] = max(0.0, min(1.0, cost))

    def world_to_cell(self, pose: Pose) -> Tuple[int, int]:
        return (int(pose.x / self.resolution), int(pose.y / self.resolution))


def plan_path(grid: OccupancyGrid, start: Pose, goal: Pose) -> Optional[List[Pose]]:
    """A* search returning a list of waypoint poses, or None if unreachable."""
    sx, sy = grid.world_to_cell(start)
    gx, gy = grid.world_to_cell(goal)
    if not grid.in_bounds(sx, sy) or not grid.in_bounds(gx, gy):
        return None
    if grid.occupied(gx, gy):
        return None

    def h(x: int, y: int) -> float:
        return abs(x - gx) + abs(y - gy)

    open_set = [(h(sx, sy), 0, sx, sy, None)]  # (f, g, x, y, parent)
    came_from = {}
    g_score = {(sx, sy): 0}

    while open_set:
        _, g, x, y, parent = heapq.heappop(open_set)
        if (x, y) in came_from:
            continue
        came_from[(x, y)] = parent
        if (x, y) == (gx, gy):
            break
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not grid.in_bounds(nx, ny) or grid.occupied(nx, ny):
                continue
            ng = g + 1
            if ng < g_score.get((nx, ny), float("inf")):
                g_score[(nx, ny)] = ng
                heapq.heappush(open_set, (ng + h(nx, ny), ng, nx, ny, (x, y)))

    if (gx, gy) not in came_from:
        return None

    path = []
    cur = (gx, gy)
    while cur is not None:
        path.append(Pose(cur[0] * grid.resolution, cur[1] * grid.resolution, 0.0))
        cur = came_from[cur]
    path.reverse()
    return path


class WaypointQueue:
    """Ordered queue of waypoints for the navigation mission."""

    def __init__(self) -> None:
        self._items: List[Waypoint] = []
        self._cursor = 0

    def push(self, wp: Waypoint) -> None:
        self._items.append(wp)

    def extend(self, wps: Sequence[Waypoint]) -> None:
        self._items.extend(wps)

    def current(self) -> Optional[Waypoint]:
        return self._items[self._cursor] if self._cursor < len(self._items) else None

    def advance(self) -> Optional[Waypoint]:
        """Move to the next waypoint; returns None when the queue is exhausted."""
        self._cursor += 1
        return self.current()

    def requeue(self) -> None:
        """Re-insert the current waypoint at the end of the queue."""
        if self._cursor < len(self._items):
            self._items.append(self._items[self._cursor])

    def progress(self) -> Tuple[int, int]:
        return (self._cursor, len(self._items))

    def clear(self) -> None:
        self._items.clear()
        self._cursor = 0


__all__ = ["Waypoint", "OccupancyGrid", "WaypointQueue", "plan_path"]
