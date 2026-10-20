"""Proposes replacement photos for the rare cards whose photo was rejected.

Usage: python scripts/suggest_photos.py data/cards.json data/photo_candidates.csv [rarity ...]
For each card of the given rarities (legendary, ultra and super by default)
without a usable photo, looks at the monument's other Wikidata photos (P18)
and at the files of its Commons category (P373). Keeps those that pass the
photo rules, best first (featured, then quality images, then the ones a 4:3
card shows whole, then the largest), and writes the three best of each card.
Look at them on Commons, then put the chosen file in scripts/photo_overrides.csv
(and run the pipeline again from step 6), or set it in the back-office.
"""
import csv
import json
import sys
import time
from pathlib import Path
from urllib.parse import unquote

import wikimedia
from build_cards import needs_letterbox, photo_problem
from fetch_commons import API, BATCH, fetch_batch
from fetch_wikidata import sparql

DEFAULT_RARITIES = ("legendary", "ultra", "super")
PER_CARD = 3
CATEGORY_FILES = 60


def wikidata_photos(s, qids):
    """Wikidata ID -> (its P18 file names, its Commons category)."""
    out = {q: (set(), None) for q in qids}
    for i in range(0, len(qids), 200):
        values = " ".join("wd:" + q for q in qids[i:i + 200])
        rows = sparql(s, f"SELECT ?item ?image ?cat WHERE {{ VALUES ?item {{ {values} }} "
                         f"OPTIONAL {{ ?item wdt:P18 ?image }} OPTIONAL {{ ?item wdt:P373 ?cat }} }}")
        for row in rows:
            q = row["item"]["value"].rsplit("/", 1)[-1]
            images, cat = out[q]
            if "image" in row:
                images.add(unquote(row["image"]["value"].rsplit("/", 1)[-1]))
            out[q] = (images, cat or row.get("cat", {}).get("value"))
        time.sleep(wikimedia.PAUSE)
    return out


def category_files(s, category):
    data = {"action": "query", "format": "json", "formatversion": "2", "list": "categorymembers",
            "cmtitle": f"Category:{category}", "cmtype": "file", "cmlimit": str(CATEGORY_FILES)}
    members = wikimedia.request(s, "POST", API, data=data).json().get("query", {}).get("categorymembers", [])
    return {m["title"].removeprefix("File:") for m in members}


def rank(info):
    labels = info.get("labels", [])
    return ("fp" in labels, "qi" in labels, not needs_letterbox(info["width"], info["height"]),
            max(info["width"], info["height"]))


def main(cards_file, out, *rarities):
    rarities = rarities or DEFAULT_RARITIES
    cards = [c for c in json.loads(Path(cards_file).read_text(encoding="utf-8"))["cards"]
             if c["photo_problem"] and c["rarity"] in rarities]
    print(f"{len(cards)} cards without a usable photo", flush=True)
    s = wikimedia.session(Accept="application/sparql-results+json")
    found = wikidata_photos(s, [c["wikidata_id"] for c in cards])
    s = wikimedia.session()
    candidates = {}
    for n, card in enumerate(cards, 1):
        images, category = found[card["wikidata_id"]]
        names = set(images)
        if category:
            names |= category_files(s, category)
            time.sleep(wikimedia.PAUSE)
        candidates[card["wikidata_id"]] = names
        if n % 20 == 0:
            print(f"{n}/{len(cards)} categories read", flush=True)
    names = sorted({name.replace("_", " ") for names in candidates.values() for name in names})
    info = {}
    for i in range(0, len(names), BATCH):
        info.update(fetch_batch(s, names[i:i + BATCH]))
        time.sleep(wikimedia.PAUSE)

    rows = []
    for card in cards:
        usable = [(name, info[name]) for name in {n.replace("_", " ") for n in candidates[card["wikidata_id"]]}
                  if info.get(name) and not photo_problem(info[name])
                  and (info[name].get("mime") or "").startswith("image/") and "svg" not in info[name]["mime"]]
        for name, i in sorted(usable, key=lambda item: rank(item[1]), reverse=True)[:PER_CARD]:
            rows.append({"wikidata_id": card["wikidata_id"], "name": card["name"], "rarity": card["rarity"],
                         "rank": card["rank"], "photo": name, "size": f"{i['width']}x{i['height']}",
                         "license": i["license"], "labels": "|".join(i["labels"]),
                         "commons": "https://commons.wikimedia.org/wiki/File:" + name.replace(" ", "_")})
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["wikidata_id", "name", "rarity", "rank", "photo", "size",
                                               "license", "labels", "commons"], delimiter=";")
        writer.writeheader()
        writer.writerows(rows)
    covered = len({r["wikidata_id"] for r in rows})
    print(f"{len(rows)} candidates for {covered} of {len(cards)} cards, in {out}")


if __name__ == "__main__":
    main(*sys.argv[1:])
