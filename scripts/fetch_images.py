"""Step 9: downloads each card photo once and writes its 400 and 800 px wide WebP versions.

Usage: python scripts/fetch_images.py data/cards.json import/images
The files are named after the photo's SHA-1, so a new photo, or a new version of
one, always gets a new name (the game serves them with a one-year cache). Skips the
photos already converted, so it resumes where it stopped. Failures are listed in
data/image_failures.json; the export hides those cards.
"""
import io
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageOps

import wikimedia

WIDTHS = (400, 800)
WEBP_QUALITY = 80


def image_name(photo, width):
    return f"{photo['sha1'][:20]}-{width}.webp"


def done(photo, out_dir):
    return all((out_dir / image_name(photo, w)).exists() for w in WIDTHS)


def convert(data, photo, out_dir):
    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    # The 800 px file is written last: both exist only once both are complete
    for width in sorted(WIDTHS):
        target = out_dir / image_name(photo, width)
        partial = target.with_suffix(".part")
        size = (width, round(image.height * width / image.width))
        image.resize(size, Image.Resampling.LANCZOS).save(partial, "WEBP", quality=WEBP_QUALITY, method=6)
        partial.replace(target)


local = threading.local()


def fetch(photo, out_dir):
    # One HTTP session per download thread
    if not hasattr(local, "session"):
        local.session = wikimedia.session()
    r = wikimedia.request(local.session, "GET", photo["download_url"])
    convert(r.content, photo, out_dir)
    time.sleep(wikimedia.PAUSE)


def main(cards_file, out):
    cards = json.loads(Path(cards_file).read_text(encoding="utf-8"))["cards"]
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    photos = {c["photo"]["sha1"]: c["photo"] for c in cards if c["photo"]}
    todo = [p for p in photos.values() if not done(p, out_dir)]
    print(f"{len(photos)} photos, {len(todo)} to download", flush=True)
    wikimedia.user_agent()  # a missing contact stops here, not once per photo
    failures = {}
    with ThreadPoolExecutor(max_workers=wikimedia.MAX_PARALLEL) as pool:
        jobs = {pool.submit(fetch, p, out_dir): p for p in todo}
        for n, job in enumerate(as_completed(jobs), 1):
            try:
                job.result()
            except Exception as error:  # one bad file must not stop the others
                failures[jobs[job]["commons_file"]] = str(error)
            if n % 200 == 0:
                print(f"{n}/{len(todo)}, {len(failures)} failures", flush=True)
    failures_file = Path(cards_file).with_name("image_failures.json")
    failures_file.write_text(json.dumps(failures, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"done: {len(todo) - len(failures)} converted, {len(failures)} failures (see {failures_file})", flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:3])
