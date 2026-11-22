"""The map of France by department (the game's "Carte" page): SVG paths of the
metropolitan departments and of the five overseas ones, drawn as insets, with
each department's bounding box for zooming on it.

Usage: python scripts/build_france_map.py src/lib/map/france-departments.json

The contours are IGN's Admin Express COG (2018 edition, Licence Ouverte), as
GeoJSON from github.com/gregoiredavid/france-geojson: its simplified
metropolitan file, and the overseas departments of its full file, simplified
here. Run it again only to change the drawing: the departments don't move.
"""
import json
import math
import sys
from pathlib import Path

import requests

SOURCE = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
METRO_FILE = "departements-version-simplifiee.geojson"
FULL_FILE = "departements-avec-outre-mer.geojson"
OVERSEAS = ("971", "972", "973", "974", "976")
ATTRIBUTION = "IGN, Admin Express COG 2018 (Licence Ouverte), via github.com/gregoiredavid/france-geojson"

# Metropolitan France is 600 units wide; an inset, 100
METRO_WIDTH = 600
INSET_WIDTH = 100
# Points closer than this to the simplified line are dropped, in drawing units
TOLERANCE = {"metro": 0.8, "inset": 0.6}
DECIMALS = 1
# Smaller rings are left out, in square drawing units
MIN_AREA = 1.5


def rings(geometry):
    """The outer and inner rings of a Polygon or MultiPolygon, as lists of (lon, lat)."""
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [ring for polygon in polygons for ring in polygon]


def bbox(features):
    lons = [p[0] for f in features for r in rings(f["geometry"]) for p in r]
    lats = [p[1] for f in features for r in rings(f["geometry"]) for p in r]
    return min(lons), min(lats), max(lons), max(lats)


def projection(west, south, east, north, width):
    """Equirectangular, longitudes shortened by the cosine of the middle latitude:
    true to shape at France's scale. Returns the function and the drawing's height."""
    k = math.cos(math.radians((south + north) / 2))
    scale = width / ((east - west) * k)
    height = (north - south) * scale

    def project(lon, lat):
        return (lon - west) * k * scale, (north - lat) * scale

    return project, height


def simplify(points, tolerance):
    """Douglas-Peucker, keeping the ring's first and last point."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        (ax, ay), (bx, by) = points[start], points[end]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        farthest, index = 0.0, None
        for i in range(start + 1, end):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / length if length else math.hypot(px - ax, py - ay)
            if d > farthest:
                farthest, index = d, i
        if index is not None and farthest > tolerance:
            keep[index] = True
            stack += [(start, index), (index, end)]
    return [p for p, k in zip(points, keep) if k]


def area(points):
    """Signed area of a ring (shoelace formula)."""
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1])) / 2


def number(value):
    """A coordinate as short as SVG allows: "0.5" is ".5", "-0.5" is "-.5", "2.0" is "2"."""
    text = f"{value:.{DECIMALS}f}".rstrip("0").rstrip(".")
    text = "0" if text in ("", "-0") else text
    return text.replace("0.", ".", 1) if text.startswith(("0.", "-0.")) else text


def pair(x, y):
    """Two coordinates in tenths of a unit; a minus sign separates them by itself."""
    second = number(y / 10 ** DECIMALS)
    return number(x / 10 ** DECIMALS) + ("" if second.startswith("-") else " ") + second


def path(features, project, tolerance):
    """One SVG path for a department's rings, in relative coordinates: each ring
    starts with a move ("m", from the previous ring's start, which "z" returns to)
    and goes on with lines. The steps are taken between points rounded to a grid,
    so that no rounding error adds up."""
    parts, start = [], (0, 0)
    for feature in features:
        for ring in rings(feature["geometry"]):
            points = simplify([project(lon, lat) for lon, lat in ring], tolerance)
            grid = []
            for x, y in points:
                p = (round(x * 10 ** DECIMALS), round(y * 10 ** DECIMALS))
                if not grid or grid[-1] != p:
                    grid.append(p)
            # A ring reduced to a speck (a small island) isn't drawn
            if len(grid) < 4 or abs(area(points)) < MIN_AREA:
                continue
            steps = [(grid[0][0] - start[0], grid[0][1] - start[1])]
            steps += [(x - px, y - py) for (px, py), (x, y) in zip(grid, grid[1:])]
            parts.append("m" + " ".join(pair(*step) for step in steps) + "z")
            start = grid[0]
    return "".join(parts)


def department(feature, d):
    west, south, east, north = bbox([feature])
    return {"code": feature["properties"]["code"], "name": feature["properties"]["nom"], "d": d,
            "bbox": [round(west, 3), round(south, 3), round(east, 3), round(north, 3)]}


def build(metro, full):
    metro_features = sorted(metro["features"], key=lambda f: f["properties"]["code"])
    project, height = projection(*bbox(metro_features), METRO_WIDTH)
    departments = [department(f, path([f], project, TOLERANCE["metro"])) for f in metro_features]

    insets = []
    by_code = {f["properties"]["code"]: f for f in full["features"]}
    for code in OVERSEAS:
        feature = by_code[code]
        project, inset_height = projection(*bbox([feature]), INSET_WIDTH)
        insets.append({**department(feature, path([feature], project, TOLERANCE["inset"])),
                       "width": INSET_WIDTH, "height": round(inset_height, 1)})
    return {"attribution": ATTRIBUTION,
            "metro": {"width": METRO_WIDTH, "height": round(height, 1), "departments": departments},
            "overseas": insets}


def main(out):
    session = requests.Session()
    metro, full = (session.get(SOURCE + name, timeout=120).json() for name in (METRO_FILE, FULL_FILE))
    data = build(metro, full)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(data['metro']['departments'])} departments and {len(data['overseas'])} insets, "
          f"{Path(out).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1])
