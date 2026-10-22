"""Step 6: size, licence, author, quality labels and download address of each photo, from Wikimedia Commons.

Usage: python scripts/fetch_commons.py data/catalogue_base.json data/raw/commons.json
Covers the photo of every monument that has a French article, and the photos chosen
by hand in scripts/photo_overrides.csv. Resumes where it stopped when run again.
"""
import json
import re
import sys
import time
from html import unescape
from pathlib import Path

import wikimedia
from build_cards import clean_author, read_photo_overrides

API = "https://commons.wikimedia.org/w/api.php"
BATCH = 50
# Width of the file downloaded by fetch_images.py: a standard Commons thumbnail
# size, enough for the 800 px version.
DOWNLOAD_WIDTH = 960
QUALITY = {"Category:Quality images": "qi", "Category:Featured pictures on Wikimedia Commons": "fp"}


def strip_html(text):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def fetch_batch(s, names):
    data = {
        "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
        "titles": "|".join("File:" + n for n in names),
        "prop": "imageinfo|categories", "iiprop": "size|mime|sha1|url|extmetadata",
        "iiurlwidth": str(DOWNLOAD_WIDTH),
        "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl|Attribution",
        "clcategories": "|".join(QUALITY), "cllimit": "max",
    }
    q = wikimedia.request(s, "POST", API, data=data).json()["query"]
    # Requested name -> final title (normalisation, then redirect)
    alias = {n["from"]: n["to"] for n in q.get("normalized", [])}
    redirect = {n["from"]: n["to"] for n in q.get("redirects", [])}
    pages = {p["title"]: p for p in q.get("pages", [])}
    out = {}
    for n in names:
        title = "File:" + n
        title = alias.get(title, title)
        p = pages.get(redirect.get(title, title))
        if not p or p.get("missing") or not p.get("imageinfo"):
            out[n] = None
            continue
        ii = p["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        out[n] = {
            "width": ii.get("width"), "height": ii.get("height"), "mime": ii.get("mime"), "sha1": ii.get("sha1"),
            "download_url": ii.get("thumburl") or ii.get("url"),
            "license": meta.get("LicenseShortName", {}).get("value"),
            "license_url": meta.get("LicenseUrl", {}).get("value"),
            "artist": strip_html(meta.get("Artist", {}).get("value")),
            # The credit line some authors require, when they give one
            "attribution": strip_html(meta.get("Attribution", {}).get("value")),
            "labels": sorted(QUALITY[c["title"]] for c in p.get("categories", []) if c["title"] in QUALITY),
        }
    return out


def fetch_uploader(s, name):
    """Who uploaded the file's first version, or None: the API lists the versions newest first."""
    data = {"action": "query", "format": "json", "formatversion": "2", "redirects": "1",
            "titles": "File:" + name, "prop": "imageinfo", "iiprop": "user", "iilimit": "max"}
    pages = wikimedia.request(s, "POST", API, data=data).json()["query"].get("pages", [])
    versions = pages[0].get("imageinfo", []) if pages else []
    return versions[-1].get("user") if versions else None


def main(catalog, out):
    items = json.loads(Path(catalog).read_text(encoding="utf-8"))["items"].values()
    names = {i["image"] for i in items if i["image"] and i["article"]}
    names |= set(read_photo_overrides().values())
    out_path = Path(out)
    result = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    # Entries from an older run, without a download address or a credit line, are fetched again
    todo = sorted(n for n in names if n not in result
                  or (result[n] and not {"download_url", "attribution"} <= result[n].keys()))
    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    print(f"{len(names)} photos, {len(batches)} batches to fetch", flush=True)
    s = wikimedia.session()
    for n, batch in enumerate(batches, 1):
        result.update(fetch_batch(s, batch))
        if n % 10 == 0:
            out_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            print(f"{n}/{len(batches)}", flush=True)
        time.sleep(wikimedia.PAUSE)
    out_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

    # A description that names no author: the card credits the first uploader instead
    anonymous = sorted(n for n in names if result.get(n) and "uploader" not in result[n]
                       and not (clean_author(result[n]["attribution"]) or clean_author(result[n]["artist"])))
    print(f"{len(anonymous)} photos without an author, looking up their uploader", flush=True)
    for n, name in enumerate(anonymous, 1):
        result[name]["uploader"] = fetch_uploader(s, name)
        if n % 50 == 0:
            out_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            print(f"{n}/{len(anonymous)}", flush=True)
        time.sleep(wikimedia.PAUSE)
    out_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"done: {sum(1 for n in names if result.get(n))} photos found out of {len(names)}", flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:3])
