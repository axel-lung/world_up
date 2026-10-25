"""Step 8: builds the game's cards: rarity, editorial flags, photo, excerpt and series.

Usage: python scripts/build_cards.py data
Reads data/catalogue_base.json, data/raw/{views,commons,extracts,type_labels}.json,
scripts/photo_overrides.csv and scripts/twentieth_century_cleared.csv, and writes data/cards.json.
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

OVERRIDES = Path(__file__).with_name("photo_overrides.csv")
CLEARED = Path(__file__).with_name("twentieth_century_cleared.csv")

# Share of the catalogue in each rarity, rarest first (the study's tiers). The
# default pack odds are these shares; an imported card keeps its rarity.
RARITY_SHARES = [("legendary", 0.0025), ("ultra", 0.025), ("super", 0.07),
                 ("rare", 0.20), ("uncommon", 0.20), ("common", 0.5025)]

REGIONS = {
    "Auvergne-Rhône-Alpes": "01 03 07 15 26 38 42 43 63 69 73 74",
    "Bourgogne-Franche-Comté": "21 25 39 58 70 71 89 90",
    "Bretagne": "22 29 35 56",
    "Centre-Val de Loire": "18 28 36 37 41 45",
    "Corse": "2A 2B 20",
    "Grand Est": "08 10 51 52 54 55 57 67 68 88",
    "Hauts-de-France": "02 59 60 62 80",
    "Île-de-France": "75 77 78 91 92 93 94 95",
    "Normandie": "14 27 50 61 76",
    "Nouvelle-Aquitaine": "16 17 19 23 24 33 40 47 64 79 86 87",
    "Occitanie": "09 11 12 30 31 32 34 46 48 65 66 81 82",
    "Pays de la Loire": "44 49 53 72 85",
    "Provence-Alpes-Côte d'Azur": "04 05 06 13 83 84",
}
DEPT_REGION = {d: r for r, ds in REGIONS.items() for d in ds.split()}
OVERSEAS = "Outre-mer"

# Monument families, by priority (keywords in the label of the Wikidata type).
# Cards matching none are in OTHER_FAMILY, which is not a series.
FAMILIES = [
    ("Cathédrales & basiliques", ["cathédrale", "basilique"]),
    ("Abbayes & couvents", ["abbaye", "couvent", "prieuré", "monastère", "chartreuse", "commanderie", "abbatiale", "communauté religieuse"]),
    ("Châteaux & forteresses", ["château", "manoir", "maison forte", "logis seigneurial", "donjon", "fort", "citadelle",
                               "rempart", "porte de ville", "enceinte", "muraille", "motte castrale", "tour", "oppidum", "palais"]),
    ("Préhistoire & Antiquité", ["dolmen", "menhir", "mégalith", "allée couverte", "tumulus", "polissoir", "alignement",
                                "archéologique", "romain", "aqueduc", "grotte", "roche ornée", "borne milliaire"]),
    ("Églises & chapelles", ["église", "chapelle", "collégiale", "temple", "synagogue", "presbytère"]),
    ("Petit patrimoine", ["croix", "calvaire", "fontaine", "lavoir", "puits", "colombier", "moulin", "banc-reposoir",
                         "lanterne des morts", "monument aux morts", "statue", "sculpture", "obélisque", "halle"]),
    ("Ponts, phares & ouvrages", ["pont", "phare", "canal", "écluse", "viaduc", "barrage"]),
    ("Patrimoine industriel", ["usine", "mine", "forge", "manufacture", "cheminée d'usine", "gare", "station de métro", "atelier"]),
    ("Maisons & hôtels particuliers", ["maison", "hôtel particulier", "immeuble", "villa", "ferme", "pavillon", "domaine"]),
]
OTHER_FAMILY = "Autres"
UNESCO_SERIES = ("patrimoine-mondial", "Patrimoine mondial de l'UNESCO")
ENDANGERED_SERIES = ("patrimoine-en-peril", "Patrimoine en péril")

# "Patrimoine du XXe siècle" and "Architecture contemporaine remarquable" labels
TWENTIETH_CENTURY_LABELS = {"Q3214312", "Q44078976"}
# French copyright lasts 70 years after the author's death
COPYRIGHT_YEARS = 70
# Places of remembrance, kept out of packs (camps, necropolises, prisons…)
MEMORIAL = re.compile(r"(?<!\w)(camp de concentration|camp d'internement|camp de transit|camp des milles|camp de rivesaltes|"
                      r"camp de gurs|nécropole|ossuaire|mémorial|prison|maison centrale|maison d'arrêt|"
                      r"cimetière militaire|fusillés|déportation)", re.I)
# Businesses still trading, whose name is often a brand (cafés, hotels, shops…)
COMMERCIAL_TYPES = {"Q27686", "Q11707", "Q30022", "Q216107", "Q41253", "Q1475066"}
# Monuments chosen by the Mission patrimoine en péril (2018 to 2026)
ENDANGERED = {"Q54556283", "Q62018102", "Q96755602", "Q106392009", "Q111244206", "Q117191197",
              "Q125030295", "Q133861957", "Q139372508"}
# Monuments inside a "domaine national" (Code du patrimoine, art. L621-42): using
# their image commercially needs the authorisation of the domain's manager. The
# domains come from the decrees of 2 May 2017, 10 September 2021, 22 June 2022
# and 24 May 2024, and their perimeters were matched by hand: doubtful cards are
# in too, since the flag only sends them to review. Check for new decrees before
# each re-import.
NATIONAL_DOMAINS = {
    "Q188190", "Q3145892",  # Élysée, with the hôtel de Marigny
    "Q205367", "Q50189833",  # Chambord
    "Q1075988", "Q818517",  # Louvre and Tuileries
    "Q1048155",  # Angers
    "Q1480604",  # Pau
    "Q643186",  # palais du Rhin, Strasbourg
    "Q329948", "Q3527809",  # Palais-Royal, with its theatre
    "Q193193", "Q138101", "Q143080", "Q3113466",  # palais de la Cité
    "Q663673", "Q2324947", "Q3464208",  # Vincennes
    "Q576534",  # Coucy
    "Q376699",  # Pierrefonds
    "Q1626747",  # Meudon
    "Q2030715",  # Saint-Cloud
    "Q2971336",  # Malmaison (the Petite Malmaison, at its edge)
    "Q516697",  # Compiègne
    "Q2971015",  # Villers-Cotterêts
    "Q201428",  # Fontainebleau
    "Q648534",  # Rambouillet
    "Q1520841", "Q2967955",  # Saint-Germain-en-Laye
    "Q2946", "Q2340684", "Q1542972", "Q3377428", "Q1542566", "Q805255", "Q3399930",  # Versailles
    "Q3034629", "Q736185", "Q1466299",  # Marly
}

# Photos with a shorter long side, or under the GFDL or the GPL alone (both want
# their full text with every copy), are rejected
MIN_LONG_SIDE = 1000
# Commons accounts that transferred files for their authors ("File Upload Bot")
BOT = re.compile(r"Bot\b")
ATTRIBUTION_MAX = 120
EXCERPT_MIN = 300
EXCERPT_MAX = 600


def read_list(path):
    """The rows of a list kept by hand: separated by ";", with a header and "#" comments."""
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader((line for line in f if line.strip() and not line.startswith("#")), delimiter=";"))


def read_photo_overrides(path=OVERRIDES):
    """Photos chosen by hand: Wikidata ID -> Commons file name."""
    return {row["wikidata_id"].strip(): row["photo"].strip() for row in read_list(path)}


def read_cleared(path=CLEARED):
    """Wikidata IDs of the 20th-century cards reviewed and shown: their authors' copyright has run out."""
    return {row["wikidata_id"].strip() for row in read_list(path)}


def slugify(text):
    text = text.replace("_", " ").replace("œ", "oe").replace("Œ", "Oe").replace("æ", "ae").replace("Æ", "Ae")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def family(types, labels):
    names = [labels.get(t, "") for t in types]
    for name, keys in FAMILIES:
        if any(k in n for n in names for k in keys):
            return name
    return OTHER_FAMILY


def department(insee):
    if not insee:
        return None
    return insee[:3] if insee[:2] in ("97", "98") else insee[:2]


def license_family(name):
    name = (name or "").lower()
    if not name:
        return "none"
    if "public domain" in name or "domaine public" in name or name.startswith("pd"):
        return "public_domain"
    if "cc0" in name:
        return "cc0"
    if "by-sa" in name:
        return "cc_by_sa"
    if name.startswith("cc by") or "cc-by" in name:
        return "cc_by"
    if "gpl" in name:
        return "gpl"
    if "gfdl" in name or "gnu" in name:
        return "gfdl"
    if "art libre" in name or "free art" in name:
        return "free_art"
    return "other"


def photo_problem(info):
    """Why a photo can't go on a card, or None."""
    if not info or not info.get("width") or not info.get("sha1"):
        return "missing"
    if max(info["width"], info["height"]) < MIN_LONG_SIDE:
        return "too_small"
    family = license_family(info.get("license"))
    if family in ("gfdl", "gpl", "none"):
        return "license"
    # These licences want the author named: without one, the card can't credit the photo
    if family in ("cc_by", "cc_by_sa", "free_art") and not photo_author(info):
        return "license"
    return None


def needs_letterbox(width, height):
    """Shown whole on a blurred copy instead of cropped to 4:3, as the card component does."""
    ratio = width / height
    return ratio < 1.1 or ratio > 1.9


def clean_author(text):
    """Simplifies the author lines Commons generates, None when unknown."""
    text = re.sub(r"No machine-readable author provided\. (.+?) assumed \(based on copyright claims\)\.?",
                  lambda m: m.group(1), text or "")
    text = re.sub(r"\s+", " ", re.sub(r"(Unknown author)+", "", text, flags=re.I)).strip(" .,")
    return text or None


def clean_attribution(text):
    """The credit line an author asks for, without the "I, " of the licence templates.
    None for a long text: instructions to the reuser rather than a credit line."""
    text = re.sub(r"^I,\s+", "", clean_author(text) or "")
    return text if 0 < len(text) <= ATTRIBUTION_MAX else None


def photo_author(info):
    """The credit line the author asked for, else the author, else whoever uploaded the
    file's first version (unless a bot that transferred it): the licences want the author named."""
    uploader = info.get("uploader")
    return clean_attribution(info.get("attribution")) or clean_author(info.get("artist")) \
        or (uploader if uploader and not BOT.search(uploader) else None)


def clean_paragraph(text):
    # Pronunciations ("[tuʁɛfɛl]") and the empty brackets their audio links leave
    text = re.sub(r"\s*\[[^\]]*\]", "", text)
    text = re.sub(r"\s*\(\s*(écouter)?\s*\)", "", text)
    return re.sub(r"\s+", " ", text).strip()


def excerpt(text):
    """The start of the article's introduction: whole paragraphs until EXCERPT_MIN
    characters (a first paragraph is often a single sentence that only says where
    the monument is), cut after a sentence when over EXCERPT_MAX."""
    paragraphs = [p for p in (clean_paragraph(p) for p in (text or "").split("\n")) if p]
    result = ""
    for paragraph in paragraphs:
        if len(result) >= EXCERPT_MIN:
            break
        result = f"{result} {paragraph}".strip()
    if len(result) <= EXCERPT_MAX:
        return result or None
    cut = result[:EXCERPT_MAX]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[:end + 1] if end > EXCERPT_MAX // 3 else cut.rsplit(" ", 1)[0] + "…"


def twentieth_century(item, today):
    """Possibly still under the architect's copyright: to review before showing it."""
    return bool(TWENTIETH_CENTURY_LABELS & set(item["designations"])) or (item["inception"] or 0) >= 1900 \
        or any((y or 0) >= today.year - COPYRIGHT_YEARS for y in item["architect_deaths"])


def assign_rarities(cards):
    """Ranks by visits, then by number of wikis, and cuts the ranking by RARITY_SHARES."""
    cards.sort(key=lambda c: (-c["views"], -c["wikis"], c["name"]))
    bounds, acc = [], 0.0
    for rarity, share in RARITY_SHARES:
        acc += share
        bounds.append((rarity, round(acc * len(cards))))
    for rank, card in enumerate(cards):
        card["rank"] = rank + 1
        card["rarity"] = next(rarity for rarity, bound in bounds if rank < bound)


def build(base, views, commons, extracts, labels, overrides, today, cleared=frozenset()):
    cards, slugs = [], set()
    for it in base["items"].values():
        if not (it["article"] and it["image"]):
            continue
        dept = department(it["insee"])
        file = overrides.get(it["qid"], it["image"])
        info = commons.get(file)
        problem = photo_problem(info)
        article = extracts.get(it["article"]) or {}
        flags = {
            "memorial": bool(MEMORIAL.search(it["label"] or it["article"])),
            "commercial": bool(COMMERCIAL_TYPES & set(it["types"])),
            "national_domain": it["qid"] in NATIONAL_DOMAINS,
            "twentieth_century": twentieth_century(it, today),
        }
        # A reviewed 20th-century card keeps its flag but is shown
        hiding = {**flags, "twentieth_century": flags["twentieth_century"] and it["qid"] not in cleared}
        cards.append({
            "wikidata_id": it["qid"],
            "name": it["label"] or it["article"].replace("_", " "),
            "views": views.get(it["article"], 0), "wikis": it["sitelinks"],
            "protection": it["protection"], "unesco": it["unesco"],
            "endangered": any(d in ENDANGERED for d in it["designations"]),
            "family": family(it["types"], labels),
            "department_code": dept, "department": (base["depts"].get(dept) or {}).get("label") if dept else None,
            "region": DEPT_REGION.get(dept, OVERSEAS if dept and dept[:2] in ("97", "98") else None),
            "inception": it["inception"],
            # The last known death among the architects: what copyright depends on
            "architect_death": max((y for y in it["architect_deaths"] if y is not None), default=None),
            "article": {"title": article.get("title") or it["article"].replace("_", " "), "revision": article.get("revision")},
            "excerpt": excerpt(article.get("extract")),
            "photo": None if problem else {
                "commons_file": file, "sha1": info["sha1"], "download_url": info["download_url"],
                "width": info["width"], "height": info["height"], "author": photo_author(info),
                "license": info.get("license"), "license_url": info.get("license_url"),
            },
            "photo_problem": problem,
            **flags,
            # Most lasting reason first: an approved 20th-century card still needs a photo
            "hidden_reason": next((r for r in ("memorial", "commercial", "national_domain", "twentieth_century") if hiding[r]),
                                  "photo" if problem else None),
        })

    assign_rarities(cards)
    series = {}
    for card in cards:
        # Article titles are unique; the most visited card gets the plain slug
        slug = slugify(card["article"]["title"]) or card["wikidata_id"].lower()
        card["slug"] = slug if slug not in slugs else f"{slug}-{card['wikidata_id'].lower()}"
        slugs.add(card["slug"])
        memberships = [("region", card["region"]), ("family", card["family"] != OTHER_FAMILY and card["family"])]
        card["series"] = []
        for kind, name in memberships:
            if name:
                series.setdefault(slugify(name), {"slug": slugify(name), "type": kind, "name": name})
                card["series"].append(slugify(name))
        for kind, flag, (slug, name) in (("unesco", card["unesco"], UNESCO_SERIES),
                                         ("endangered", card["endangered"], ENDANGERED_SERIES)):
            if flag:
                series.setdefault(slug, {"slug": slug, "type": kind, "name": name})
                card["series"].append(slug)
    return cards, sorted(series.values(), key=lambda s: (s["type"], s["name"]))


def main(data_dir):
    data = Path(data_dir)
    raw = data / "raw"
    def read(path):
        return json.loads(path.read_text(encoding="utf-8"))
    cards, series = build(read(data / "catalogue_base.json"), read(raw / "views.json"), read(raw / "commons.json"),
                          read(raw / "extracts.json"), read(raw / "type_labels.json"), read_photo_overrides(),
                          date.today(), read_cleared())
    out = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "rarity_shares": dict(RARITY_SHARES), "series": series, "cards": cards}
    (data / "cards.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"{len(cards)} cards, {len(series)} series")
    print("rarities: " + ", ".join(f"{r} {n}" for r, n in Counter(c["rarity"] for c in cards).items()))
    print("hidden: " + ", ".join(f"{r} {n}" for r, n in Counter(c["hidden_reason"] for c in cards if c["hidden_reason"]).items()))
    print("photo problems: " + ", ".join(f"{p} {n}" for p, n in Counter(c["photo_problem"] for c in cards if c["photo_problem"]).items()))


if __name__ == "__main__":
    main(sys.argv[1])
