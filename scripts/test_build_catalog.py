"""Tests of the Wikidata merge: python -m unittest discover -s scripts"""
import unittest

import build_catalog as bcat


def row(coord, rank="NormalRank", precision="2.7777777777778E-5"):
    r = {"item": {"value": "http://www.wikidata.org/entity/Q1"},
         "coord": {"value": coord}, "rank": {"value": f"http://wikiba.se/ontology#{rank}"}}
    if precision is not None:
        r["precision"] = {"value": precision}
    return r


class CoordinatesTest(unittest.TestCase):
    def test_reads_a_wikidata_point_longitude_first(self):
        self.assertEqual(bcat.point(row("Point(2.2945 48.8584)")), (48.8584, 2.2945, False, 2.7777777777778e-05))
        self.assertEqual(bcat.point(row("Point(2 48)", rank="PreferredRank", precision=None)), (48.0, 2.0, True, None))

    def test_skips_unknown_values_and_other_globes(self):
        self.assertIsNone(bcat.point(row("http://www.wikidata.org/.well-known/genid/b9102e0f")))
        self.assertIsNone(bcat.point(row("<http://www.wikidata.org/entity/Q405> Point(2 48)")))

    def test_prefers_the_preferred_rank_then_the_finest_precision(self):
        coarse, fine = (48.0, 2.0, False, 0.01), (48.1, 2.1, False, 1e-5)
        preferred = (47.0, 1.0, True, 0.01)
        self.assertEqual(bcat.best_point([coarse, fine]), {"lat": 48.1, "lon": 2.1, "precision": 1e-5})
        self.assertEqual(bcat.best_point([fine, preferred])["lat"], 47.0)
        self.assertEqual(bcat.best_point([(48.0, 2.0, False, None), coarse])["precision"], 0.01)

    def test_the_choice_does_not_depend_on_the_order(self):
        a, b = (48.2, 2.0, False, 1e-5), (48.1, 2.5, False, 1e-5)
        self.assertEqual(bcat.best_point([a, b]), bcat.best_point([b, a]))
        self.assertIsNone(bcat.best_point([]))


if __name__ == "__main__":
    unittest.main()
