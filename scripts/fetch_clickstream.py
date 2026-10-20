"""Step 4: downloads the monthly French Wikipedia clickstream files (about 60 MB a month).

Usage: python scripts/fetch_clickstream.py data/dumps 2025-10 2026-09
Downloads every month of the period (both ends included) and skips the files already there.
"""
import sys
from pathlib import Path

import requests

import wikimedia

URL = "https://dumps.wikimedia.org/other/clickstream/{m}/clickstream-frwiki-{m}.tsv.gz"


def months(start, end):
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    while (y, m) <= (ey, em):
        yield f"{y:04d}-{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def main(out_dir, start, end):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    s = wikimedia.session()
    for month in months(start, end):
        target = out / f"clickstream-frwiki-{month}.tsv.gz"
        if target.exists():
            print(f"{month} already there", flush=True)
            continue
        try:
            r = wikimedia.request(s, "GET", URL.format(m=month), stream=True)
        except requests.HTTPError as error:
            if error.response.status_code == 404:
                print(f"{month} not published yet", flush=True)
                continue
            raise
        partial = target.with_suffix(".part")
        with r, open(partial, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
        partial.rename(target)
        print(f"{month} downloaded ({target.stat().st_size / 1e6:.0f} MB)", flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:4])
