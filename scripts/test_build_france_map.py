"""Tests of the map of France: python -m unittest discover -s scripts"""
import unittest

import build_france_map as bfm

SQUARE = {"type": "Polygon", "coordinates": [[[0.0, 46.0], [1.0, 46.0], [1.0, 47.0], [0.0, 47.0], [0.0, 46.0]]]}


class MapTest(unittest.TestCase):
    def test_writes_numbers_as_short_as_svg_allows(self):
        self.assertEqual([bfm.number(v) for v in (0.5, -0.5, 2.0, 0.0, -0.04, 12.34)], [".5", "-.5", "2", "0", "0", "12.3"])
        # Tenths of a unit; a minus sign separates two numbers by itself
        self.assertEqual(bfm.pair(15, -32), "1.5-3.2")
        self.assertEqual(bfm.pair(-15, 32), "-1.5 3.2")

    def test_simplifies_a_line_within_the_tolerance(self):
        line = [(0, 0), (1, 0.1), (2, -0.1), (3, 5), (4, 6), (5, 7), (6, 8)]
        self.assertEqual(bfm.simplify(line, 0.5), [(0, 0), (2, -0.1), (3, 5), (6, 8)])
        self.assertEqual(bfm.simplify(line[:2], 0.5), line[:2])

    def test_projects_true_to_shape(self):
        project, height = bfm.projection(0, 46, 1, 47, 100)
        self.assertEqual(project(0, 47), (0, 0))
        # A degree of longitude is shorter than one of latitude at 46.5°
        self.assertAlmostEqual(height, 100 / 0.6884, delta=0.5)

    def test_draws_a_ring_in_relative_coordinates(self):
        project, _ = bfm.projection(0, 46, 1, 47, 10)
        # A move to the first corner, then each side as a step, back to the start
        self.assertEqual(bfm.path([{"geometry": SQUARE}], project, 0.1), "m0 14.5 10 0 0-14.5 -10 0 0 14.5z")

    def test_leaves_out_a_speck(self):
        project, _ = bfm.projection(0, 46, 1, 47, 1)
        self.assertEqual(bfm.path([{"geometry": SQUARE}], project, 0.01), "")

    def test_keeps_each_department_bounding_box(self):
        feature = {"geometry": SQUARE, "properties": {"code": "41", "nom": "Loir-et-Cher"}}
        self.assertEqual(bfm.department(feature, "m0 0z"), {"code": "41", "name": "Loir-et-Cher", "d": "m0 0z", "bbox": [0.0, 46.0, 1.0, 47.0]})


if __name__ == "__main__":
    unittest.main()
