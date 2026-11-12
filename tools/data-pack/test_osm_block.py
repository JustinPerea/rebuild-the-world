"""Tests for osm_block.py that need no network: python3 tools/data-pack/test_osm_block.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import osm_block as o  # noqa: E402

REGION = {"id": "t", "origin": {"lat": 38.7118, "lon": -9.13}, "square_m": 300, "start_block": {"x_m": [-150, 0], "z_m": [0, 150]}}


def way(i, lat, lon, tags, size=0.0001):
    g = [{"lat": lat, "lon": lon}, {"lat": lat, "lon": lon + size}, {"lat": lat + size, "lon": lon + size}, {"lat": lat + size, "lon": lon}, {"lat": lat, "lon": lon}]
    return {"type": "way", "id": i, "tags": tags, "geometry": g}


class Pack(unittest.TestCase):
    def test_a_height_is_read_from_its_tag_in_metres_or_feet(self):
        self.assertEqual(o.metres("12"), 12.0)
        self.assertEqual(o.metres("12,5 m"), 12.5)
        self.assertAlmostEqual(o.metres("40 ft"), 12.192)
        for bad in ("tall", "", None, "0", "12;14", "-3"):
            self.assertIsNone(o.metres(bad))

    def test_height_falls_back_to_storeys_then_to_the_assumed_height(self):
        self.assertEqual(o.height_of({"height": "9", "building:levels": "2"}), (9.0, "tag", 2))
        self.assertEqual(o.height_of({"building:levels": "4"}), (12.0, "storeys", 4))
        self.assertEqual(o.height_of({"building:levels": "many"}), (o.ASSUMED_HEIGHT_M, "assumed", None))

    def test_buildings_are_kept_by_their_centre_and_placed_in_local_metres(self):
        answer = {"elements": [
            way(1, 38.7118, -9.13, {"building": "yes", "height": "10"}),
            way(2, 38.7300, -9.13, {"building": "yes"}),                      # two kilometres north: outside the square
            way(3, 38.7110, -9.1310, {"building": "house"}),                  # south-west of the origin: in the start block
            way(4, 38.7118, -9.13, {"highway": "service"}),                   # not a building
            {"type": "way", "id": 5, "tags": {"building": "yes"}, "geometry": [{"lat": 38.7118, "lon": -9.13}, {"lat": 38.7119, "lon": -9.13}]},
        ]}
        out, summary = o.build(REGION, answer)
        self.assertEqual([b["place_id"] for b in out], ["osm:way/1", "osm:way/3"])
        self.assertEqual([b["source_id"] for b in out], ["way_1", "way_3"])    # names files, so no slash
        self.assertEqual(summary["buildings"], 2)
        self.assertEqual(summary["outlines_skipped"], 1)
        self.assertEqual((summary["height_tagged"], summary["height_assumed"], summary["in_start_block"]), (1, 1, 1))
        first, third = out
        self.assertEqual(len(first["footprint_m"]), 4)
        x, z = first["footprint_m"][2]                                        # the north-east corner: east is +x, north is -z
        self.assertAlmostEqual(x, 8.7, delta=0.1)
        self.assertAlmostEqual(z, -11.1, delta=0.1)
        self.assertEqual(third["usage"], "house")
        self.assertTrue(third["in_start_block"])
        self.assertFalse(first["in_start_block"])

    def test_a_grid_cell_keeps_buildings_by_its_edges_in_degrees(self):
        cell = dict(REGION, bounds={"south": 38.7115, "north": 38.7125, "west": -9.1305, "east": -9.1295})
        answer = {"elements": [
            way(1, 38.7118, -9.13, {"building": "yes"}),
            way(2, 38.7118, -9.1293, {"building": "yes"}),                    # 60 m east: inside the square, outside the cell
        ]}
        out, _ = o.build(cell, answer)
        self.assertEqual([b["source_id"] for b in out], ["way_1"])
        self.assertEqual(len(o.build(REGION, answer)[0]), 2)

    def test_metres_per_degree_matches_the_plateau_tool(self):
        import plateau_block as p
        self.assertEqual(o.metres_per_degree(35.71216), p.metres_per_degree(35.71216))


if __name__ == "__main__":
    unittest.main()
