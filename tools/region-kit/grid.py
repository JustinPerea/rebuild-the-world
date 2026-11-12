"""The world grid: one fixed set of cells over the Earth, so neighbouring areas meet without gaps or overlaps.

A cell is a Web Mercator map tile at zoom ZOOM, the scheme every web map uses. A cell is square
on the ground and its side shrinks with latitude: about 306 m at the equator, 248 m in Tokyo,
190 m in London. Standard library only.
"""
import math

ZOOM = 17
N = 2 ** ZOOM
MAX_LAT = 85.0511          # the scheme stops here; nothing is built nearer the poles


def cell_of(lat, lon):
    """The (x, y) of the cell that holds a point. x counts east from longitude -180, y south from the top."""
    if not -MAX_LAT < lat < MAX_LAT:
        raise ValueError(f"latitude {lat} is outside the grid (it covers {-MAX_LAT} to {MAX_LAT})")
    x = int(math.floor((lon + 180.0) / 360.0 * N)) % N
    y = int(math.floor((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * N))
    return x, min(max(y, 0), N - 1)


def bounds(x, y):
    """A cell's edges in degrees: south, west, north, east."""
    lat = lambda row: math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * row / N))))
    lon = lambda col: col / N * 360.0 - 180.0
    return lat(y + 1), lon(x), lat(y), lon(x + 1)


def cell_id(x, y):
    return f"c{ZOOM}-{x}-{y}"


def parse_id(text):
    """(x, y) from a cell ID such as c17-116437-51607."""
    parts = text.split("-")
    if len(parts) != 3 or parts[0] != f"c{ZOOM}" or not (parts[1].isdigit() and parts[2].isdigit()):
        raise ValueError(f"{text!r} is not a cell ID of this grid (c{ZOOM}-<x>-<y>)")
    x, y = int(parts[1]), int(parts[2])
    if not (0 <= x < N and 0 <= y < N):
        raise ValueError(f"{text!r} is outside the grid")
    return x, y


def neighbours(x, y):
    """The four cells that share an edge with this one, as {"north": (x, y), ...}. East and west wrap round."""
    out = {"east": ((x + 1) % N, y), "west": ((x - 1) % N, y)}
    if y > 0:
        out["north"] = (x, y - 1)
    if y < N - 1:
        out["south"] = (x, y + 1)
    return out


def metres_per_degree(lat_deg):
    """Length of one degree of latitude and longitude on WGS 84 at this latitude."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    s = math.sin(math.radians(lat_deg))
    w = math.sqrt(1 - e2 * s * s)
    return math.radians(1) * a * (1 - e2) / w ** 3, math.radians(1) * a / w * math.cos(math.radians(lat_deg))


def describe(x, y):
    """A cell's record: ID, edges, centre, and its size in metres."""
    s, w, n, e = bounds(x, y)
    lat0, lon0 = (s + n) / 2, (w + e) / 2
    m_lat, m_lon = metres_per_degree(lat0)
    return {
        "id": cell_id(x, y), "zoom": ZOOM, "x": x, "y": y,
        "bounds": {"south": round(s, 7), "west": round(w, 7), "north": round(n, 7), "east": round(e, 7)},
        "centre": {"lat": round(lat0, 7), "lon": round(lon0, 7)},
        "size_m": {"east_west": round((e - w) * m_lon, 1), "north_south": round((n - s) * m_lat, 1)},
        "neighbours": {k: cell_id(*v) for k, v in neighbours(x, y).items()},
    }
