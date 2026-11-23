---
paths:
  - "scripts/**"
  - "src/lib/catalog/**"
  - "src/entrypoints/import-catalog.ts"
  - "src/app/admin/**/cards/**"
  - "src/app/admin/**/reports/**"
  - "src/app/**/credits/**"
  - "src/app/uploads/**"
  - "src/lib/uploads.ts"
---

# Catalogue pipeline

The catalogue is built offline, then imported. Production never calls Wikimedia: no API calls while playing and no images hotlinked from Commons. The one exception is the back-office's "replace the photo" (`src/lib/catalog/commons-photo.ts`): on the admin's request, the server checks a Commons file against the pipeline's photo rules, downloads it once and stores its WebP files in `uploads`.

- Flow, in 10 steps run on a workstation (`scripts/README.md` has the commands, the rules and the export format): Wikidata extraction, rarity from 12 months of Wikipedia clickstream visits, Commons photo metadata, excerpts, editorial triage (`build_cards.py`), WebP images at 400 and 800 px named after the photo's SHA-1, then `import/catalog.json`. The `import/` folder is copied to the server's `./import` (mounted read-only in the worker), and `import-catalog.js` copies the images into `uploads` and upserts the cards.
- `scripts/` holds Python only, with no dependency on the app; `data/` (downloads and intermediate files) and `import/` are git-ignored. `build_france_map.py` is apart from the catalogue: it writes the departments' SVG paths (`src/lib/map/france-departments.json`, committed) from IGN's Admin Express.
- The import (`src/lib/catalog/`) checks the whole export, copies the photos, then upserts by Wikidata ID in one transaction; running it again changes nothing. Rarities are frozen at launch: the 6-monthly re-import adds monuments or better photos but never changes an existing card's rarity. Only the back-office can change a rarity, and that change is logged.
- An existing card also keeps its rank, its slug (its public address) and its visibility: `hidden_reason` is the import's on new cards only, except that a card hidden for want of a photo comes back when the export has one, and a 20th-century card when the export clears it, unless the back-office hid it. A photo chosen in the back-office sets `photo_locked`, and the import then leaves it.
- 20th-century cards (possibly under the architect's copyright) stay hidden until reviewed: `scripts/twentieth_century_cleared.csv` lists those whose every known author died over 70 years ago, checked on Wikidata and in the Wikipedia infobox (the method is in `scripts/README.md`).
- Two legal rules of the pipeline. Cards inside a "domaine national" (`NATIONAL_DOMAINS` in `build_cards.py`, by Wikidata ID) are hidden as `national_domain` for review: a commercial use of their image needs the authorisation of the domain's manager (Code du patrimoine, art. L621-42), whatever the photo's licence. And a photo is refused under the GFDL or GPL alone, or under a licence that wants the author named (CC BY, CC BY-SA, Free Art) when none can be: the credit is the author's required line (`Attribution`), else `Artist`, else the first uploader unless a bot. The back-office's photo replacement applies the same rules. The import hides a visible card that newly enters a national domain, or whose photo the export now refuses for its licence.
- Coordinates (export format 2): Wikidata's point (P625), one per monument, dropped when outside its territory, with its precision in metres (`cards.latitude`, `longitude`, `location_precision`). Unlike the rarity, every import updates them; the back-office card page links the point to OpenStreetMap.
- `card_series.position` is a card's stable place in a series (new cards go last); `number` ("004/1452") counts only visible cards, and `series.card_count` holds the total. Call `renumberSeries()` after anything that shows or hides a card.
- Wikimedia access rules: a User-Agent with a contact address (otherwise the limit drops to 10 requests/min), at most 3 parallel requests, honour `Retry-After`.
- Photo rejection rules and the editorial hiding rules (with their counts) are in the spec's "Catalogue" section.
