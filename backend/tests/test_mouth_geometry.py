"""Dependency-free regression tests for the shared landmark pairing."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("aura_ear", Path(__file__).parents[1] / "app/ml/ear.py")
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)


def mouth_points(opening):
    points = [(0.0, 0.0)] * 478
    for index, value in {
        61: (0, 0), 291: (1, 0),
        81: (0.25, -opening / 2), 311: (0.75, -opening / 2),
        178: (0.25, opening / 2), 402: (0.75, opening / 2),
    }.items():
        points[index] = value
    return points


class MouthGeometryTests(unittest.TestCase):
    def test_closed_lips_are_not_diagonal_distances(self):
        self.assertAlmostEqual(geometry.mouth_aspect(mouth_points(0.04)), 0.04, places=5)

    def test_wide_opening(self):
        self.assertAlmostEqual(geometry.mouth_aspect(mouth_points(0.8)), 0.8, places=5)

    def test_browser_landmark_order_matches_python(self):
        js = (Path(__file__).parents[2] / 'frontend/src/lib/vision.js').read_text()
        self.assertIn(f'export const MOUTH = {list(geometry.MOUTH)};', js)


if __name__ == '__main__':
    unittest.main()
