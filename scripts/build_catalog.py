"""Step 2: merges the Wikidata extractions into one monument per entity.

Usage: python scripts/build_catalog.py data/raw data/catalogue_base.json
"""
import json
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote

CLASSE, INSCRIT, UNESCO, UNESCO_PART = "Q10387684", "Q10387575", "Q9259", "Q43113623"


def qid(binding):
    return binding["value"].rsplit("/", 1)[-1]


def year(value):
    """Year of a Wikidata date (None when unknown; BC dates become negative)."""
    if not value or value.startswith("http"):
        return None
    sign = -1 if value.startswith("-") else 1
    try:
        return sign * int(value.lstrip("+-").split("-", 1)[0])
    except ValueError:
        return None


def load(raw, name):
    return json.loads((raw / f"wd_{name}.json").read_text(encoding="utf-8"))


def main(raw, out):
    items = {}
    for row in load(raw, "core"):
        q = qid(row["item"])
        it = items.setdefault(q, {"qid": q, "label": None, "article": None, "image": None, "sitelinks": 0})
        if "label" in row:
            it["label"] = row["label"]["value"]
        if "article" in row:
            it["article"] = unquote(row["article"]["value"].rsplit("/wiki/", 1)[-1])
        if "image" in row and not it["image"]:
            it["image"] = unquote(row["image"]["value"].rsplit("/", 1)[-1])
        it["sitelinks"] = int(row["sitelinks"]["value"])

    multi = defaultdict(lambda: defaultdict(set))
    for row in load(raw, "designations"):
        multi[qid(row["item"])]["designations"].add(qid(row["d"]))
    for row in load(raw, "types"):
        multi[qid(row["item"])]["types"].add(qid(row["t"]))
    for row in load(raw, "loc"):
        multi[qid(row["item"])]["loc"].add(qid(row["loc"]))
    for row in load(raw, "partof"):
        multi[qid(row["item"])]["whs"].add(qid(row["parent"]))

    insee = {}
    for row in load(raw, "communes"):
        insee.setdefault(qid(row["c"]), row["insee"]["value"])
    if (raw / "wd_locparent.json").exists():
        for row in load(raw, "locparent"):
            insee.setdefault(qid(row["loc"]), row["insee"]["value"])

    dates = defaultdict(lambda: {"inception": None, "architects": {}})
    for row in load(raw, "dates"):
        d = dates[qid(row["item"])]
        y = year(row.get("inception", {}).get("value"))
        if y is not None and (d["inception"] is None or y < d["inception"]):
            d["inception"] = y
        if "architect" in row:
            death = year(row.get("archDeath", {}).get("value"))
            if death is not None or qid(row["architect"]) not in d["architects"]:
                d["architects"][qid(row["architect"])] = death

    whs_sites = {}
    for row in load(raw, "unesco"):
        w = qid(row["whs"])
        whs_sites.setdefault(w, {"qid": w, "label": row.get("label", {}).get("value"), "whsid": row["whsid"]["value"],
                                 "article": unquote(row["article"]["value"].rsplit("/wiki/", 1)[-1]) if "article" in row else None})

    depts = {}
    for row in load(raw, "departements"):
        code = row["code"]["value"]
        depts.setdefault(code, {"code": code, "label": row.get("label", {}).get("value"), "region": None})
        if "regLabel" in row and not depts[code]["region"]:
            depts[code]["region"] = row["regLabel"]["value"]

    for q, it in items.items():
        m = multi[q]
        it["designations"] = sorted(m["designations"])
        it["types"] = sorted(m["types"])
        codes = sorted({insee[l] for l in m["loc"] if l in insee})
        it["insee"] = codes[0] if codes else None
        it["unesco_parents"] = sorted(m["whs"])
        it["is_whs_item"] = q in whs_sites
        it["unesco"] = bool(UNESCO in m["designations"] or UNESCO_PART in m["designations"] or m["whs"] or q in whs_sites)
        it["protection"] = "classe" if CLASSE in m["designations"] else ("inscrit" if INSCRIT in m["designations"] else None)
        d = dates.get(q, {"inception": None, "architects": {}})
        it["inception"] = d["inception"]
        it["architect_deaths"] = list(d["architects"].values())

    Path(out).write_text(json.dumps({"items": items, "whs": whs_sites, "depts": depts}, ensure_ascii=False), encoding="utf-8")
    eligible = [i for i in items.values() if i["article"] and i["image"]]
    print(f"entities: {len(items)} | with a French article: {sum(1 for i in items.values() if i['article'])} "
          f"| with a photo: {sum(1 for i in items.values() if i['image'])} | both: {len(eligible)}")
    print(f"World Heritage entries: {len(whs_sites)} | departments: {len(depts)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2])
