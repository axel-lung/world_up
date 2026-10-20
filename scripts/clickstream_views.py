"""Step 5: visits of each article, summed over the clickstream files of a folder.

Usage: python scripts/clickstream_views.py data/catalogue_base.json data/dumps data/raw/views.json
The clickstream lists each article's visits by source (search, internal link…) and leaves
out the sources under 10 visits a month: a slightly low estimate, the same for every article.
"""
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

MONTHS = 12


def main(catalog, dumps_dir, out):
    base = json.loads(Path(catalog).read_text(encoding="utf-8"))
    targets = {i["article"] for i in base["items"].values() if i["article"]}
    dumps = sorted(Path(dumps_dir).glob("clickstream-frwiki-*.tsv.gz"))
    if len(dumps) != MONTHS:
        print(f"warning: {len(dumps)} months of clickstream, the rarity rules ask for {MONTHS}", flush=True)
    views = Counter()
    for dump in dumps:
        with gzip.open(dump, "rt", encoding="utf-8", errors="replace") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) == 4 and parts[1] in targets:
                    views[parts[1]] += int(parts[3])
        print(f"{dump.name} read", flush=True)
    result = {t: views.get(t, 0) for t in sorted(targets)}
    Path(out).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"{len(targets)} articles, {sum(1 for v in result.values() if v)} with visits", flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:4])
