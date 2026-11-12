"""The world grid: one fixed set of cells over the Earth, so neighbouring areas meet without gaps or overlaps.

A cell is a Web Mercator map tile, the numbering web maps use. Tiles form a tree: each splits into
four at the next level. A tile's side on the ground shrinks with latitude, so the level of a cell
follows its latitude: the level, from COARSEST to FINEST, whose tiles are nearest TARGET_M wide there.
Cells are then 180 to 350 m across everywhere. Standard library only.
"""
import math

FINEST = 17                # the level used from the equator to about 55 degrees
COARSEST = 14              # the level used nearest the poles; a cell's level is decided per row of this level
TARGET_M = 250.0           # the side a cell should have on the ground
MAX_LAT = 85.0511287       # the scheme stops here (its exact limit is 85.05112878); nothing is built nearer the poles
EQUATOR_M = 2 * math.pi * 6378137.0    # a level-0 tile's side on the ground at the equator


def _row(lat, z):
    n = 2 ** z
    y = int(math.floor((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n))
    return min(max(y, 0), n - 1)


def _row_lat(row, z):
    """Latitude of the top edge of a row at level z. Half rows are allowed."""
    return math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * row / 2 ** z))))


def side_m(z, lat):
    """A level-z tile's side on the ground at a latitude."""
    return EQUATOR_M / 2 ** z * math.cos(math.radians(lat))


def level_of_row(coarse_row):
    """The level of every cell inside one row of level COARSEST: the one whose tiles are nearest TARGET_M wide
    at the row's middle. Deciding per coarse row makes every change of level fall on an edge all levels share."""
    lat = _row_lat(coarse_row + 0.5, COARSEST)
    return min(range(COARSEST, FINEST + 1), key=lambda z: abs(math.log(side_m(z, lat) / TARGET_M)))


def level_at(lat):
    if not -MAX_LAT < lat < MAX_LAT:
        raise ValueError(f"latitude {lat} is outside the grid (it covers {-MAX_LAT} to {MAX_LAT})")
    return level_of_row(_row(lat, COARSEST))


def cell_of(lat, lon):
    """The (level, x, y) of the cell that holds a point. x counts east from longitude -180, y south from the top."""
    z = level_at(lat)
    n = 2 ** z
    return z, int(math.floor((lon + 180.0) / 360.0 * n)) % n, _row(lat, z)


def bounds(z, x, y):
    """A cell's edges in degrees: south, west, north, east. A point within about 1e-14 degrees of an edge can be
    given by cell_of to the cell on the other side of it. Which cell a building belongs to is decided from these
    edges rounded to 7 decimals (describe), which both neighbours share, so no building is held twice."""
    lon = lambda col: col / 2 ** z * 360.0 - 180.0
    return _row_lat(y + 1, z), lon(x), _row_lat(y, z), lon(x + 1)


def cell_id(z, x, y):
    return f"c{z}-{x}-{y}"


def parse_id(text):
    """(level, x, y) from a cell ID such as c17-116439-51599. Refuses a tile that is not a cell at its latitude."""
    parts = text.split("-")
    if len(parts) != 3 or parts[0][:1] != "c" or not all(p.isdigit() and p.isascii() for p in (parts[0][1:], parts[1], parts[2])):
        raise ValueError(f"{text!r} is not a cell ID (c<level>-<x>-<y>)")
    z, x, y = int(parts[0][1:]), int(parts[1]), int(parts[2])
    if not COARSEST <= z <= FINEST:
        raise ValueError(f"{text!r} is not a cell ID: levels run from {COARSEST} to {FINEST}")
    if not (0 <= x < 2 ** z and 0 <= y < 2 ** z):
        raise ValueError(f"{text!r} is outside the grid")
    want = level_of_row(y >> (z - COARSEST))
    if want != z:
        raise ValueError(f"{text!r} is not a cell: cells at its latitude are level {want}")
    if cell_id(z, x, y) != text:        # one spelling per cell: the ID names a folder and, later, a claim
        raise ValueError(f"{text!r} is not written the way cell IDs are: {cell_id(z, x, y)}")
    return z, x, y


def neighbours(z, x, y):
    """The cells that share an edge with this one, as {"north": [(level, x, y), ...], ...}. East and west wrap
    round. Where the level changes, a cell has two neighbours on that side, or shares its neighbour with another."""
    n = 2 ** z
    out = {"east": [(z, (x + 1) % n, y)], "west": [(z, (x - 1) % n, y)]}
    for side, yy in (("north", y - 1), ("south", y + 1)):
        if not 0 <= yy < n:
            continue
        zn = level_of_row(yy >> (z - COARSEST))
        if zn == z:
            out[side] = [(z, x, yy)]
        elif zn < z:
            k = z - zn
            out[side] = [(zn, x >> k, yy >> k)]
        else:
            k = zn - z
            row = (yy << k) + (2 ** k - 1 if side == "north" else 0)      # the finer row that touches this cell
            out[side] = [(zn, (x << k) + i, row) for i in range(2 ** k)]
    return out


def metres_per_degree(lat_deg):
    """Length of one degree of latitude and longitude on WGS 84 at this latitude."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    s = math.sin(math.radians(lat_deg))
    w = math.sqrt(1 - e2 * s * s)
    return math.radians(1) * a * (1 - e2) / w ** 3, math.radians(1) * a / w * math.cos(math.radians(lat_deg))


def describe(z, x, y):
    """A cell's record: ID, edges, centre, and its size in metres."""
    s, w, n, e = bounds(z, x, y)
    lat0, lon0 = (s + n) / 2, (w + e) / 2
    m_lat, m_lon = metres_per_degree(lat0)
    return {
        "id": cell_id(z, x, y), "zoom": z, "x": x, "y": y,
        "bounds": {"south": round(s, 7), "west": round(w, 7), "north": round(n, 7), "east": round(e, 7)},
        "centre": {"lat": round(lat0, 7), "lon": round(lon0, 7)},
        "size_m": {"east_west": round((e - w) * m_lon, 1), "north_south": round((n - s) * m_lat, 1)},
        "neighbours": {k: [cell_id(*c) for c in v] for k, v in neighbours(z, x, y).items()},
    }
