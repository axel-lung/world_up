"""Step 3: French labels of the most frequent monument types, which give each card its family.

Usage: python scripts/fetch_type_labels.py data/catalogue_base.json data/raw/type_labels.json
"""
import json
import sys
from collections import Counter
from pathlib import Path

import wikimedia
from fetch_wikidata import sparql


def main(catalog, out):
    base = json.loads(Path(catalog).read_text(encoding="utf-8"))
    cards = [i for i in base["items"].values() if i["article"] and i["image"]]
    top = [t for t, _ in Counter(t for i in cards for t in i["types"]).most_common(120)]
    values = " ".join("wd:" + t for t in top)
    s = wikimedia.session(Accept="application/sparql-results+json")
    rows = sparql(s, f'SELECT ?t ?l WHERE {{ VALUES ?t {{ {values} }} ?t rdfs:label ?l FILTER(lang(?l) = "fr") }}')
    labels = {r["t"]["value"].rsplit("/", 1)[-1]: r["l"]["value"] for r in rows}
    Path(out).write_text(json.dumps(labels, ensure_ascii=False), encoding="utf-8")
    print(f"{len(labels)} type labels")


if __name__ == "__main__":
    main(*sys.argv[1:3])
