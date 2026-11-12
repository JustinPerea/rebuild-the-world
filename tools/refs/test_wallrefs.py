"""Checks of the geometry in wallrefs.py. Needs numpy only:  python tools/refs/test_wallrefs.py"""
import math
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import wallrefs as w  # noqa: E402


class Geometry(unittest.TestCase):
    def test_similarity_recovers_a_known_placement(self):
        rng = np.random.default_rng(1)
        src = rng.uniform(-20, 20, (40, 2))
        ang, scale, shift = math.radians(37), 3.5, np.array([12.0, -4.0])
        rot = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        s, r, t = w.similarity_2d(src, scale * src @ rot.T + shift)
        self.assertAlmostEqual(s, scale, places=6)
        np.testing.assert_allclose(r, rot, atol=1e-9)
        np.testing.assert_allclose(t, shift, atol=1e-6)

    def test_similarity_never_mirrors(self):
        src = np.array([[0.0, 0], [4, 0], [4, 2], [0, 5]])
        _, r, _ = w.similarity_2d(src, src * [1, -1])
        self.assertAlmostEqual(float(np.linalg.det(r)), 1.0, places=9)

    def test_a_point_is_matched_only_to_a_building_tall_enough(self):
        segs = np.array([[0.0, 0, 10, 0], [0, 3, 10, 3]])      # a low building's wall, and a tall one's 3 m behind
        tops = np.array([6.0, 30.0])
        pts = np.array([[5.0, 0.4], [5.0, 0.4]])
        d, q = w.nearest_on_outlines(pts, np.array([4.0, 20.0]), segs, tops)
        np.testing.assert_allclose(d, [0.4, 2.6], atol=1e-9)
        np.testing.assert_allclose(q, [[5, 0], [5, 3]], atol=1e-9)

    def test_crosses(self):
        segs = np.array([[0.0, 0, 10, 0]])
        self.assertTrue(w.crosses(5, -3, 5, 3, segs))
        self.assertFalse(w.crosses(5, 1, 5, 3, segs))
        self.assertFalse(w.crosses(12, -3, 12, 3, segs))

    def test_wall_frame_runs_left_to_right_with_outward_on_the_viewers_side(self):
        # A wall along +X whose outside is to the north (-Z): seen from the north, left is east.
        along, outward, mid, length = w.wall_frame({"left": [10.0, 0.0], "right": [0.0, 0.0]})
        self.assertEqual((along, mid, length), ((-1.0, 0.0), (5.0, 0.0), 10.0))
        np.testing.assert_allclose(outward, (0.0, -1.0), atol=1e-12)

    def test_fit_wall_finds_the_plane_and_its_offset(self):
        rng = np.random.default_rng(2)
        edge = {"left": [10.0, 0.0], "right": [0.0, 0.0], "length_m": 10.0}
        n = 400
        s, h = rng.uniform(0, 10, n), rng.uniform(0.5, 9, n)
        wall = np.stack([10 - s, h, -0.30 + rng.normal(0, 0.02, n)], 1)          # 0.30 m outside the outline
        clutter = np.stack([rng.uniform(0, 10, 150), rng.uniform(0.5, 9, 150), rng.uniform(-3.5, 3.5, 150)], 1)
        fit = w.fit_wall(np.vstack([wall, clutter]), edge, 9.0)
        self.assertIsNotNone(fit)
        origin, along, outward, offset, rms, inliers = fit
        self.assertAlmostEqual(offset, 0.30, delta=0.03)
        self.assertLess(rms, 0.05)
        self.assertGreaterEqual(inliers, 380)
        np.testing.assert_allclose(along, (-1, 0), atol=0.02)
        self.assertIsNone(w.fit_wall(clutter[:40], edge, 9.0))

    def test_a_plane_far_from_the_outline_is_not_accepted_as_the_wall(self):
        self.assertIsNone(w.plane_problem(0.3))
        self.assertIsNone(w.plane_problem(-0.9))
        self.assertIn("2.52 m", w.plane_problem(2.52))
        self.assertIn("2.44 m", w.plane_problem(-2.44))

    def test_views_of_the_same_surface_agree_and_shifted_ones_do_not(self):
        rng = np.random.default_rng(4)
        wall = rng.integers(0, 255, (80, 120, 3)).astype(np.uint8)
        mask = np.ones((80, 120), bool)
        same = [(wall, mask)] * 4
        self.assertEqual(w.view_spread(same), 0.0)
        shifted = [(np.roll(wall, 7 * k, axis=1), mask) for k in range(4)]
        self.assertGreater(w.view_spread(shifted), w.MAX_VIEW_SPREAD)
        self.assertIsNone(w.view_spread(same[:2]))

    def test_a_point_in_the_street_shadows_the_wall_behind_it(self):
        # camera 12 m out, 1.5 m up, opposite s = 5; a point 6 m out is halfway, so its shadow is doubled
        cam = (5.0, 12.0, 1.5)
        m = w.shadow_mask(cam, [[6.0, 6.0, 2.5], [6.05, 6.0, 2.5]], 10.0, 8.0, 20)
        self.assertEqual(m.shape, (160, 200))
        self.assertTrue(m[int((8.0 - 3.5) * 20), int(7.0 * 20)])           # lands at s = 7, h = 3.5
        self.assertFalse(m[int((8.0 - 3.5) * 20), int(5.0 * 20)])          # 2 m away is outside the 0.7 m shadow
        self.assertFalse(w.shadow_mask(cam, [[6.0, 6.0, 2.5]], 10.0, 8.0, 20).any())   # one stray point blocks nothing
        # a point on the facade, or behind the camera, blocks nothing
        self.assertFalse(w.shadow_mask(cam, [[6.0, 0.8, 2.5], [6.0, 0.8, 2.6], [6.0, 14.0, 2.5], [6.0, 14.0, 2.6], [6.0, 6.0, 0.1], [6.1, 6.0, 0.1]], 10.0, 8.0, 20).any())

    def test_a_blocked_view_is_left_out_even_when_most_views_are_blocked(self):
        rng = np.random.default_rng(6)
        wall = rng.integers(60, 200, (40, 60, 3)).astype(np.uint8)
        seen = np.ones((40, 60), bool)
        truck = wall.copy(); truck[20:, :30] = 250                          # three of four views have a truck here
        patch = np.zeros((40, 60), bool); patch[20:, :30] = True
        views = [(truck, seen), (truck, seen), (truck, seen), (wall, seen)]
        plain = w.fuse(views)[1]
        self.assertTrue((plain[30, 10] == 250).all())                       # the plain median keeps the truck
        best, fused, count, clear = w.fuse(views, [patch, patch, patch, ~seen])
        np.testing.assert_array_equal(fused, wall)                          # the one clear view shows the wall
        self.assertEqual(int(clear[30, 10]), 1)
        self.assertEqual(int(count[30, 10]), 4)
        hidden = w.fuse(views[:3], [patch] * 3)                             # blocked in every view: falls back, and says so
        self.assertEqual(int(hidden[3][30, 10]), 0)
        self.assertTrue((hidden[1][30, 10] == 250).all())

    def test_a_photo_that_sees_little_is_chosen_when_it_sees_behind_what_blocks_the_rest(self):
        full = np.ones((40, 60), bool)
        behind = np.zeros((40, 60), bool); behind[20:, :30] = True         # the part a truck hides from the far photos
        far = (100.0, full, full & ~behind)
        near = (60.0, behind, behind)                                       # sees only that part, and sees it clear
        spare = (90.0, full, full & ~behind)
        order = w.choose_views([far, far, far, far, far, spare, near], limit=6)
        self.assertEqual(order[0], 0)                                       # the reference: most of the wall, sharpest
        self.assertIn(6, order)                                             # the near photo, although it ranks last on its own
        self.assertNotIn(5, order)                                          # a sixth far photo adds nothing the first five lack
        self.assertEqual(w.choose_views([far, far], limit=6), [0, 1])
        self.assertEqual(w.choose_views([]), [])

    def test_projection_matches_a_plain_pinhole_without_distortion(self):
        pts = np.array([[0.5, -0.25, 2.0], [0.0, 0.0, 1.0]])
        for model, params in (("SIMPLE_PINHOLE", [1000, 960, 540]), ("SIMPLE_RADIAL", [1000, 960, 540, 0.0]),
                              ("RADIAL", [1000, 960, 540, 0.0, 0.0]), ("PINHOLE", [1000, 1000, 960, 540])):
            cam = SimpleNamespace(model=SimpleNamespace(name=model), params=params)
            np.testing.assert_allclose(w.project(cam, pts), [[1210, 415], [960, 540]], atol=1e-9)
        cam = SimpleNamespace(model=SimpleNamespace(name="SIMPLE_RADIAL"), params=[1000, 960, 540, 0.1])
        self.assertGreater(w.project(cam, pts)[0, 0], 1210)                        # barrel term pushes points outwards

    def test_metres_per_degree_matches_the_data_pack(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("plateau_block", Path(__file__).parents[1] / "data-pack" / "plateau_block.py")
        pack = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pack)
        self.assertEqual(w.metres_per_degree(35.71216), pack.metres_per_degree(35.71216))


if __name__ == "__main__":
    unittest.main()
