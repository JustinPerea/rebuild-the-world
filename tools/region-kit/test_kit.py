#!/usr/bin/env python3
"""Offline tests of the world grid and the region kit: no network, no numpy.

    python3 tools/region-kit/test_kit.py
"""
import json, math, sys, unittest
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
            cell = grid.cell_of(lat, lon)
            self.assertEqual(grid.parse_id(grid.cell_id(*cell)), cell)
        self.assertEqual(grid.cell_id(*grid.cell_of(*PLACES["Lisbon"])), "c17-62211-50227")
        self.assertEqual(grid.cell_id(*grid.cell_of(*PLACES["Oshiage"])), "c17-116439-51599")
        self.assertEqual(grid.cell_id(*grid.cell_of(*PLACES["Helsinki"])), "c16-37307-18969")
        for bad in ("c13-1-2", "c18-1-2", "c17-1", "c17-1-2-3", "c17-a-2", "c17-131072-0", "../c17-1-2", "c17--1-2", "c-1-2", "x17-1-2", "c1\u0667-1-2"):
            with self.assertRaises(ValueError, msg=bad):
                grid.parse_id(bad)

    def test_a_tile_at_the_wrong_level_for_its_latitude_is_not_a_cell(self):
        z, x, y = grid.cell_of(*PLACES["Helsinki"])
        self.assertEqual(z, 16)
        with self.assertRaises(ValueError):
            grid.parse_id(f"c17-{x * 2}-{y * 2}")              # one of its four quarters
        z, x, y = grid.cell_of(*PLACES["Lisbon"])
        with self.assertRaises(ValueError):
            grid.parse_id(f"c16-{x // 2}-{y // 2}")            # the tile that holds it and three others

    def test_the_level_follows_latitude_the_same_north_and_south(self):
        rows = 2 ** grid.COARSEST
        levels = [grid.level_of_row(r) for r in range(rows)]
        self.assertEqual(levels, levels[::-1])
        self.assertEqual(sorted(set(levels)), [14, 15, 16, 17])
        self.assertTrue(all(abs(a - b) <= 1 for a, b in zip(levels, levels[1:])))      # never two levels at one edge
        self.assertEqual([grid.level_at(lat) for lat in (0, 35.7, 54, 56, 73, 74, 81, 83, -56)], [17, 17, 17, 16, 16, 15, 15, 14, 16])

    def test_every_cell_is_between_177_and_354_m_wide(self):
        for r in range(2 ** grid.COARSEST):
            z = grid.level_of_row(r)
            for edge in (r, r + 1):
                lat = grid._row_lat(edge, grid.COARSEST)
                self.assertTrue(176.5 < grid.side_m(z, lat) < 354, (r, z, lat))

    def test_neighbours_share_an_edge_exactly(self):
        cell = grid.cell_of(*PLACES["Lisbon"])
        me, nb = grid.describe(*cell), grid.neighbours(*cell)
        self.assertEqual({k: len(v) for k, v in nb.items()}, {"east": 1, "west": 1, "north": 1, "south": 1})
        self.assertEqual(grid.describe(*nb["east"][0])["bounds"]["west"], me["bounds"]["east"])
        self.assertEqual(grid.describe(*nb["west"][0])["bounds"]["east"], me["bounds"]["west"])
        self.assertEqual(grid.describe(*nb["north"][0])["bounds"]["south"], me["bounds"]["north"])
        self.assertEqual(grid.describe(*nb["south"][0])["bounds"]["north"], me["bounds"]["south"])

    def test_where_the_level_changes_a_big_cell_has_two_small_neighbours(self):
        rows = 2 ** grid.COARSEST
        first16 = next(r for r in range(rows // 2, rows) if grid.level_of_row(r) == 16)   # the first level-16 row south of the equator
        big = (16, 1000, first16 << 2)                          # its top row of level-16 cells
        self.assertEqual(grid.parse_id(grid.cell_id(*big)), big)
        north = grid.neighbours(*big)["north"]
        self.assertEqual(len(north), 2)
        me = grid.describe(*big)["bounds"]
        small = [grid.describe(*c)["bounds"] for c in north]
        self.assertEqual([c[0] for c in north], [17, 17])
        self.assertTrue(all(b["south"] == me["north"] for b in small))
        self.assertEqual((small[0]["west"], small[1]["east"]), (me["west"], me["east"]))
        self.assertEqual(small[0]["east"], small[1]["west"])
        for c in north:                                         # and each small cell names the big one back
            self.assertEqual(grid.neighbours(*c)["south"], [big])

    def test_east_and_west_wrap_and_the_top_row_has_no_north(self):
        self.assertEqual(grid.neighbours(14, 2 ** 14 - 1, 5)["east"], [(14, 0, 5)])
        self.assertEqual(grid.neighbours(14, 0, 5)["west"], [(14, 2 ** 14 - 1, 5)])
        self.assertNotIn("north", grid.neighbours(14, 3, 0))
        self.assertNotIn("south", grid.neighbours(14, 3, 2 ** 14 - 1))

    def test_nothing_is_built_near_the_poles(self):
        for lat in (86, -86, 90):
            with self.assertRaises(ValueError):
                grid.cell_of(lat, 0)

    def test_cells_are_square(self):
        size = lambda name: grid.describe(*grid.cell_of(*PLACES[name]))["size_m"]
        for name in PLACES:
            self.assertAlmostEqual(size(name)["east_west"], size(name)["north_south"], delta=2.0, msg=name)
        self.assertAlmostEqual(size("Quito")["east_west"], 305.7, delta=0.5)
        self.assertAlmostEqual(size("Oshiage")["east_west"], 248.5, delta=0.5)
        self.assertAlmostEqual(size("Helsinki")["east_west"], 304.9, delta=0.5)

    def test_the_levels_are_the_ones_in_the_spec_data(self):
        spec = json.loads((REPO / "spec" / "spec.json").read_text(encoding="utf-8"))["grid"]
        self.assertEqual((grid.FINEST, grid.COARSEST, grid.TARGET_M), (spec["finest_level"], spec["coarsest_level"], spec["target_side_m"]))
        self.assertEqual(grid.cell_id(17, 1, 2), spec["id_form"].replace("<level>", "17").replace("<x>", "1").replace("<y>", "2"))


class Kit(unittest.TestCase):
    def test_a_region_record_is_the_cell(self):
        z, x, y = grid.cell_of(*PLACES["Lisbon"])
        r = kit.region_record(z, x, y, "Alfama, Lisbon", "openstreetmap")
        self.assertEqual(r["id"], "c17-62211-50227")
        self.assertEqual(r["cell"], {"grid": "web-mercator", "zoom": 17, "x": x, "y": y})
        self.assertEqual(r["frame"], "tangent-plane")
        b = r["bounds"]
        self.assertAlmostEqual(r["origin"]["lat"], (b["south"] + b["north"]) / 2, places=6)
        self.assertGreaterEqual(r["square_m"], max(r["size_m"].values()))
        self.assertLess(r["start_block"]["x_m"][0], -r["size_m"]["east_west"] / 2)       # the start block is the whole cell

    def test_a_building_on_a_shared_edge_goes_to_one_cell_only(self):
        cell = grid.cell_of(*PLACES["Lisbon"])
        here = kit.region_record(*cell, "a", "openstreetmap")
        east = kit.region_record(*grid.neighbours(*cell)["east"][0], "b", "openstreetmap")
        lat, lon = here["origin"]["lat"], here["bounds"]["east"]                         # exactly on the edge
        keeps = [osm_block.inside(r, lat, lon, 0, 0) for r in (here, east)]
        self.assertEqual(keeps, [False, True])

    def test_a_cells_buildings_are_placed_on_the_plane_that_touches_the_earth_there(self):
        import plateau_block
        cell = grid.cell_of(*PLACES["Helsinki"])
        r = kit.region_record(*cell, "a", "openstreetmap")
        o, b = r["origin"], r["bounds"]
        local = osm_block.tangent(o["lat"], o["lon"])
        self.assertEqual(local(o["lat"], o["lon"]), (0.0, 0.0))
        x, z = local(b["north"], b["east"])                                              # the north-east corner: +x east, -z north
        self.assertAlmostEqual(x, r["size_m"]["east_west"] / 2, delta=0.5)
        self.assertAlmostEqual(z, -r["size_m"]["north_south"] / 2, delta=0.5)
        m_lat, m_lon = grid.metres_per_degree(o["lat"])                                  # the shortcut it replaces is millimetres off here
        short = ((b["east"] - o["lon"]) * m_lon, -(b["north"] - o["lat"]) * m_lat)
        self.assertLess(math.hypot(x - short[0], z - short[1]), 0.01)
        self.assertGreater(math.hypot(x - short[0], z - short[1]), 0.001)
        self.assertEqual(plateau_block.tangent(o["lat"], o["lon"])(b["north"], b["east"]), (x, z))
        way = {"type": "way", "id": 7, "tags": {"building": "yes"}, "geometry": [{"lat": la, "lon": lo} for la, lo in
               ((b["north"], b["east"]), (b["north"], o["lon"]), (o["lat"], o["lon"]), (o["lat"], b["east"]), (b["north"], b["east"]))]}
        out, _ = osm_block.build(r, {"elements": [way]})
        self.assertEqual(out[0]["footprint_m"][0], [round(x, 3), round(z, 3)])

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
