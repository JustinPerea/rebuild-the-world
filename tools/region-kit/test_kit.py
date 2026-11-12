#!/usr/bin/env python3
"""Offline tests of the world grid and the region kit: no network, no numpy.

    python3 tools/region-kit/test_kit.py
"""
import json, sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "tools" / "data-pack"))
import grid, kit            # noqa: E402
import osm_block            # noqa: E402

PLACES = {"Oshiage": (35.71216, 139.81199), "Lisbon": (38.7118, -9.13), "Quito": (-0.2202, -78.5123),
          "Helsinki": (60.1699, 24.9384), "Wellington": (-41.2866, 174.7756), "Honolulu": (21.3069, -157.8583)}


class Grid(unittest.TestCase):
    def test_a_point_is_inside_the_cell_it_is_given(self):
        for name, (lat, lon) in PLACES.items():
            s, w, n, e = grid.bounds(*grid.cell_of(lat, lon))
            self.assertTrue(s <= lat < n and w <= lon < e, name)

    def test_ids_round_trip_and_bad_ids_are_refused(self):
        for lat, lon in PLACES.values():
            x, y = grid.cell_of(lat, lon)
            self.assertEqual(grid.parse_id(grid.cell_id(x, y)), (x, y))
        self.assertEqual(grid.cell_id(*grid.cell_of(*PLACES["Lisbon"])), "c17-62211-50227")
        for bad in ("c16-1-2", "c17-1", "c17-1-2-3", "c17-a-2", "c17-131072-0", "../c17-1-2", "c17--1-2"):
            with self.assertRaises(ValueError, msg=bad):
                grid.parse_id(bad)

    def test_neighbours_share_an_edge_exactly(self):
        x, y = grid.cell_of(*PLACES["Lisbon"])
        me, nb = grid.describe(x, y), grid.neighbours(x, y)
        self.assertEqual(grid.describe(*nb["east"])["bounds"]["west"], me["bounds"]["east"])
        self.assertEqual(grid.describe(*nb["west"])["bounds"]["east"], me["bounds"]["west"])
        self.assertEqual(grid.describe(*nb["north"])["bounds"]["south"], me["bounds"]["north"])
        self.assertEqual(grid.describe(*nb["south"])["bounds"]["north"], me["bounds"]["south"])

    def test_east_and_west_wrap_and_the_top_row_has_no_north(self):
        self.assertEqual(grid.neighbours(grid.N - 1, 5)["east"], (0, 5))
        self.assertEqual(grid.neighbours(0, 5)["west"], (grid.N - 1, 5))
        self.assertNotIn("north", grid.neighbours(3, 0))
        self.assertNotIn("south", grid.neighbours(3, grid.N - 1))

    def test_nothing_is_built_near_the_poles(self):
        for lat in (86, -86, 90):
            with self.assertRaises(ValueError):
                grid.cell_of(lat, 0)

    def test_cells_are_square_and_shrink_away_from_the_equator(self):
        size = lambda name: grid.describe(*grid.cell_of(*PLACES[name]))["size_m"]
        for name in PLACES:
            self.assertAlmostEqual(size(name)["east_west"], size(name)["north_south"], delta=2.0, msg=name)
        self.assertAlmostEqual(size("Quito")["east_west"], 305.7, delta=0.5)
        self.assertAlmostEqual(size("Oshiage")["east_west"], 248.5, delta=0.5)
        self.assertLess(size("Helsinki")["east_west"], 155)

    def test_the_zoom_is_the_one_in_the_spec_data(self):
        spec = json.loads((REPO / "spec" / "spec.json").read_text(encoding="utf-8"))
        self.assertEqual(grid.ZOOM, spec["grid"]["zoom"])
        self.assertEqual(grid.cell_id(1, 2), spec["grid"]["id_form"].replace("<x>", "1").replace("<y>", "2"))


class Kit(unittest.TestCase):
    def test_a_region_record_is_the_cell(self):
        x, y = grid.cell_of(*PLACES["Lisbon"])
        r = kit.region_record(x, y, "Alfama, Lisbon", "openstreetmap")
        self.assertEqual(r["id"], "c17-62211-50227")
        self.assertEqual(r["cell"], {"grid": "web-mercator", "zoom": 17, "x": x, "y": y})
        b = r["bounds"]
        self.assertAlmostEqual(r["origin"]["lat"], (b["south"] + b["north"]) / 2, places=6)
        self.assertGreaterEqual(r["square_m"], max(r["size_m"].values()))
        self.assertLess(r["start_block"]["x_m"][0], -r["size_m"]["east_west"] / 2)       # the start block is the whole cell

    def test_a_building_on_a_shared_edge_goes_to_one_cell_only(self):
        x, y = grid.cell_of(*PLACES["Lisbon"])
        here = kit.region_record(x, y, "a", "openstreetmap")
        east = kit.region_record(*grid.neighbours(x, y)["east"], "b", "openstreetmap")
        lat, lon = here["origin"]["lat"], here["bounds"]["east"]                         # exactly on the edge
        keeps = [osm_block.inside(r, lat, lon, 0, 0) for r in (here, east)]
        self.assertEqual(keeps, [False, True])

    def test_stored_photos_are_shared_out_between_buildings(self):
        photos = [[str(i), 0, 0, 0, 0, 0, 0, 0] for i in range(8)]
        photos[7][5] = 1                                                                 # a panorama
        data = {"photos": photos, "sees": [[[0, 90], [1, 80], [2, 70]], [[3, 60], [7, 99]], [], [[1, 50]]]}
        self.assertEqual(kit.wanted_thumbs(data, 3), ["0", "3", "1"])                    # one each before any second; the panorama waits
        self.assertEqual(kit.wanted_thumbs(data, 99), ["0", "3", "1", "2"])              # ordinary photos only where a building has one

    def test_other_peoples_text_cannot_break_out_of_the_page(self):
        nasty = '</script><script>alert(1)</script><img src=x onerror=alert(2)>&\u2028'
        data = {"photos": [], "seqs": [{"creator": nasty, "date": "2026-01-01", "n": 1}], "buildings": [], "sees": [], "info": [[nasty, 6, 0, 0, ""]],
                "outlines": "x", "refsRun": False}
        text = kit.script_json(data)
        for ch in "<>&\u2028":
            self.assertNotIn(ch, text)
        self.assertEqual(json.loads(text), data)                                         # the page still reads the same values
        page = kit.render({"id": "c17-1-2", "name": nasty + ", Nowhere"}, data)
        self.assertNotIn("</script><script>alert(1)", page)
        self.assertEqual(page.count("<script>"), 2)                                      # the data and the page's own code, nothing else
        self.assertNotIn("<img src=x", page)

    def test_only_a_plain_number_is_a_photo_id(self):
        for ok in ("1234567890", "9"):
            self.assertTrue(kit.PHOTO_ID.fullmatch(ok))
        for bad in ("../x", "12/34", "12.jpg", "", "1" * 30, "12\n"):
            self.assertFalse(kit.PHOTO_ID.fullmatch(bad), bad)


if __name__ == "__main__":
    unittest.main()
