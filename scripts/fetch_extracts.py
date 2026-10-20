"""Step 7: introduction of each French Wikipedia article, with its revision number.

Usage: python scripts/fetch_extracts.py data/catalogue_base.json data/raw/extracts.json
Covers the monuments that have both a photo and an article. Resumes where it stopped
when run again.
"""
import json
import sys
import time
from pathlib import Path

import wikimedia

API = "https://fr.wikipedia.org/w/api.php"
# TextExtracts returns at most 20 introductions per request
BATCH = 20


def fetch_batch(s, titles):
    params = {
        "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
        "prop": "extracts|revisions", "exintro": "1", "explaintext": "1", "exlimit": "max",
        "rvprop": "ids", "titles": "|".join(titles),
    }
    alias, redirect, pages = {}, {}, {}
    while True:
        j = wikimedia.request(s, "POST", API, data=params).json()
        q = j.get("query", {})
        alias.update({n["from"]: n["to"] for n in q.get("normalized", [])})
        redirect.update({n["from"]: n["to"] for n in q.get("redirects", [])})
        for p in q.get("pages", []):
            page = pages.setdefault(p["title"], {"title": p["title"], "revision": None, "extract": None})
            if p.get("extract"):
                page["extract"] = p["extract"]
            if p.get("revisions"):
                page["revision"] = p["revisions"][0]["revid"]
        if "continue" not in j:
            break
        params.update(j["continue"])
        time.sleep(wikimedia.PAUSE)
    out = {}
    for t in titles:
        title = alias.get(t, t)
        out[t] = pages.get(redirect.get(title, title))
    return out


def main(catalog, out):
    items = json.loads(Path(catalog).read_text(encoding="utf-8"))["items"].values()
    titles = sorted({i["article"] for i in items if i["article"] and i["image"]})
    out_path = Path(out)
    result = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    todo = [t for t in titles if t not in result]
    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    print(f"{len(titles)} articles, {len(batches)} batches to fetch", flush=True)
    s = wikimedia.session()
    for n, batch in enumerate(batches, 1):
        result.update(fetch_batch(s, batch))
        if n % 50 == 0:
            out_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            print(f"{n}/{len(batches)}", flush=True)
        time.sleep(wikimedia.PAUSE)
    out_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"done: {sum(1 for t in titles if (result.get(t) or {}).get('extract'))} extracts out of {len(titles)}", flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:3])
