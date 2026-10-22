"""Step 10: writes the export the game imports, import/catalog.json, next to import/images/.

Usage: python scripts/export.py data/cards.json import
A card whose photo files are missing (failed download) is exported without its
photo and hidden, so that the back-office lists it among the photos to replace.
"""
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from fetch_images import WIDTHS, done, image_name

FORMAT = 1
COLLECTION = "heritage"
# What the game stores of each card; the rest of data/cards.json only serves the pipeline
CARD_FIELDS = ("wikidata_id", "slug", "name", "rank", "rarity", "protection", "unesco", "endangered", "family",
               "department_code", "department", "region", "inception", "architect_death", "excerpt", "article",
               "photo_problem", "memorial", "commercial", "national_domain", "twentieth_century", "hidden_reason",
               "series")
PHOTO_FIELDS = ("commons_file", "width", "height", "author", "license", "license_url")


def export_card(card, images):
    out = {k: card[k] for k in CARD_FIELDS}
    photo = card["photo"]
    if photo and done(photo, images):
        out["photo"] = {**{k: photo[k] for k in PHOTO_FIELDS},
                        "files": {str(w): image_name(photo, w) for w in WIDTHS}}
    else:
        out["photo"] = None
        if photo:
            out["photo_problem"] = "download"
            out["hidden_reason"] = out["hidden_reason"] or "photo"
    return out


def main(cards_file, out):
    source = json.loads(Path(cards_file).read_text(encoding="utf-8"))
    out_dir = Path(out)
    cards = [export_card(c, out_dir / "images") for c in source["cards"]]
    catalog = {
        "format": FORMAT,
        "collection": COLLECTION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rarity_shares": source["rarity_shares"],
        "series": source["series"],
        "cards": cards,
    }
    (out_dir / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False), encoding="utf-8")
    hidden = Counter(c["hidden_reason"] for c in cards if c["hidden_reason"])
    print(f"{len(cards)} cards exported, {len(cards) - sum(hidden.values())} visible; hidden: "
          + ", ".join(f"{r} {n}" for r, n in hidden.items()))


if __name__ == "__main__":
    main(*sys.argv[1:3])
