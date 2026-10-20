"""Tests of the card rules: python -m unittest discover -s scripts"""
import unittest
from datetime import date

import build_cards as bc

TODAY = date(2026, 10, 20)


def item(qid="Q1", label="château de Test", article="Château_de_Test", **extra):
    return {"qid": qid, "label": label, "article": article, "image": f"{qid}.jpg", "sitelinks": 1,
            "designations": [], "types": [], "insee": "41034", "inception": 1519, "architect_deaths": [],
            "protection": "classe", "unesco": False, **extra}


def photo(width=4000, height=3000, license="CC BY-SA 4.0", sha1="ab" * 20):
    return {"width": width, "height": height, "sha1": sha1, "license": license, "license_url": None,
            "artist": "Jean Photo", "download_url": "https://upload.example/x.jpg"}


def build(*items, commons=None, overrides=None, views=None):
    base = {"items": {i["qid"]: i for i in items}, "depts": {"41": {"label": "Loir-et-Cher"}}}
    commons = commons if commons is not None else {i["image"]: photo() for i in items}
    return bc.build(base, views or {}, commons, {}, {}, overrides or {}, TODAY)


class RarityTest(unittest.TestCase):
    def test_tiers_follow_the_shares(self):
        cards = [{"name": f"c{n}", "views": 10_000 - n, "wikis": 0} for n in range(10_000)]
        bc.assign_rarities(cards)
        counts = {r: sum(c["rarity"] == r for c in cards) for r, _ in bc.RARITY_SHARES}
        self.assertEqual(counts, {"legendary": 25, "ultra": 250, "super": 700, "rare": 2000, "uncommon": 2000, "common": 5025})
        self.assertEqual(cards[0]["rank"], 1)

    def test_most_visited_is_rarest_and_wikis_break_ties(self):
        cards = [{"name": "a", "views": 5, "wikis": 1}, {"name": "b", "views": 5, "wikis": 9}, {"name": "c", "views": 50, "wikis": 0}]
        bc.assign_rarities(cards)
        self.assertEqual([c["name"] for c in cards], ["c", "b", "a"])


class PhotoTest(unittest.TestCase):
    def test_rejects_small_photos_and_gfdl_alone(self):
        self.assertIsNone(bc.photo_problem(photo(width=1000, height=700)))
        self.assertEqual(bc.photo_problem(photo(width=999, height=700)), "too_small")
        self.assertEqual(bc.photo_problem(photo(license="GFDL")), "license")
        self.assertEqual(bc.photo_problem(photo(license="")), "license")
        self.assertEqual(bc.photo_problem(None), "missing")

    def test_rejected_photo_hides_the_card(self):
        [card], _ = build(item(), commons={"Q1.jpg": photo(width=640, height=480)})
        self.assertIsNone(card["photo"])
        self.assertEqual((card["hidden_reason"], card["photo_problem"]), ("photo", "too_small"))

    def test_override_replaces_the_wikidata_photo(self):
        commons = {"Q1.jpg": photo(width=640, height=480), "Better.jpg": photo(sha1="cd" * 20)}
        [card], _ = build(item(), commons=commons, overrides={"Q1": "Better.jpg"})
        self.assertEqual(card["photo"]["commons_file"], "Better.jpg")
        self.assertIsNone(card["hidden_reason"])

    def test_cleans_generated_author_lines(self):
        self.assertEqual(bc.clean_author("No machine-readable author provided. Calips assumed (based on copyright claims)."), "Calips")
        self.assertIsNone(bc.clean_author("Unknown authorUnknown author"))


class EditorialTest(unittest.TestCase):
    def test_hides_places_of_remembrance_and_businesses(self):
        cards, _ = build(item("Q1", label="camp des Milles"), item("Q2", types=["Q27686"]))
        self.assertEqual([c["hidden_reason"] for c in cards], ["memorial", "commercial"])

    def test_twentieth_century_goes_to_review(self):
        self.assertTrue(bc.twentieth_century(item(inception=1931), TODAY))
        self.assertTrue(bc.twentieth_century(item(architect_deaths=[1956]), TODAY))
        self.assertFalse(bc.twentieth_century(item(architect_deaths=[1955, None]), TODAY))
        self.assertTrue(bc.twentieth_century(item(designations=["Q3214312"]), TODAY))

    def test_review_reason_comes_before_a_missing_photo(self):
        [card], _ = build(item(inception=1931), commons={})
        self.assertEqual((card["hidden_reason"], card["photo_problem"]), ("twentieth_century", "missing"))


class SeriesAndSlugTest(unittest.TestCase):
    def test_slug_comes_from_the_article_title(self):
        self.assertEqual(bc.slugify("Château_de_Chambord"), "chateau-de-chambord")
        self.assertEqual(bc.slugify("Abbaye Saint-Œuvre (Lœuilly)"), "abbaye-saint-oeuvre-loeuilly")

    def test_same_slug_goes_to_the_most_visited_card(self):
        cards, _ = build(item("Q1", article="Église_Saint-Martin"), item("Q2", article="Église Saint-Martin"),
                         views={"Église_Saint-Martin": 10})
        self.assertEqual([c["slug"] for c in cards], ["eglise-saint-martin", "eglise-saint-martin-q2"])

    def test_series_by_region_family_and_label(self):
        [card], series = build(item(types=["Q1"], unesco=True, designations=["Q54556283"]))
        self.assertEqual(card["series"], ["centre-val-de-loire", "patrimoine-mondial", "patrimoine-en-peril"])
        self.assertEqual({s["type"] for s in series}, {"region", "unesco", "endangered"})
        self.assertEqual(card["department"], "Loir-et-Cher")

    def test_overseas_departments(self):
        self.assertEqual(bc.department("97411"), "974")
        self.assertEqual(bc.department("2A004"), "2A")


class ExcerptTest(unittest.TestCase):
    def test_keeps_a_long_enough_first_paragraph(self):
        first = ("Le château de Test est un château de la Renaissance. " * 7).strip()
        self.assertEqual(bc.excerpt(f"{first}\n\nSecond paragraphe."), first)

    def test_adds_paragraphs_to_a_short_first_one(self):
        second = ("Construit au XVIe siècle, il a abrité la cour du roi, puis une école et un musée. " * 4).strip()
        self.assertEqual(bc.excerpt(f"Le château de Test est situé à Test.\n{second}\nTroisième."),
                         f"Le château de Test est situé à Test. {second}")

    def test_drops_pronunciations(self):
        self.assertEqual(bc.excerpt("La tour Eiffel [tuʁɛfɛl]  est une tour ( écouter) de fer."),
                         "La tour Eiffel est une tour de fer.")

    def test_cuts_a_long_paragraph_after_a_sentence(self):
        text = "Une phrase assez longue pour compter. " * 30
        result = bc.excerpt(text)
        self.assertLessEqual(len(result), bc.EXCERPT_MAX)
        self.assertTrue(result.endswith("compter."))


if __name__ == "__main__":
    unittest.main()
