# Catalogue pipeline

Builds the catalogue of the `heritage` collection offline, from Wikidata, Wikipedia and Wikimedia Commons, and writes the export that `import-catalog.js` loads into the game (spec, "Catalogue : pipeline d'import"). Production never calls Wikimedia: the export holds everything the game shows, photos included.

## Setup

- Python 3.11 or later, then `pip install -r scripts/requirements.txt`
- A User-Agent with a contact, an e-mail address or a URL, which the scripts require (without one, Wikimedia allows 10 requests a minute):

```sh
export WIKIMEDIA_USER_AGENT="PatrimoineDeFrance/1.0 (https://github.com/axel-lung/world_up)"   # PowerShell: $env:WIKIMEDIA_USER_AGENT = "…"
```

`WIKIMEDIA_PAUSE` sets the pause after each request (0.4 s by default, so at most 200 requests a minute). Photo downloads run 3 at a time, and every script waits as long as a `Retry-After` header asks.

## Steps

Run from the repository root. Steps 6, 7 and 9 resume where they stopped when run again.

| # | Command | Writes |
| --- | --- | --- |
| 1 | `python scripts/fetch_wikidata.py data/raw` | `data/raw/wd_*.json`: monuments, designations, types, places, dates, World Heritage sites, departments |
| 2 | `python scripts/build_catalog.py data/raw data/catalogue_base.json` | One monument per Wikidata entity |
| 3 | `python scripts/fetch_type_labels.py data/catalogue_base.json data/raw/type_labels.json` | Labels of the monument types, which give the families |
| 4 | `python scripts/fetch_clickstream.py data/dumps 2025-10 2026-09` | The last 12 months of French Wikipedia clickstream, about 60 MB each |
| 5 | `python scripts/clickstream_views.py data/catalogue_base.json data/dumps data/raw/views.json` | Visits of each article over those months |
| 6 | `python scripts/fetch_commons.py data/catalogue_base.json data/raw/commons.json` | Size, licence, author and download address of each photo (about 540 batches) |
| 7 | `python scripts/fetch_extracts.py data/catalogue_base.json data/raw/extracts.json` | Introduction and revision number of each article (about 1,340 batches) |
| 8 | `python scripts/build_cards.py data` | `data/cards.json`: rarity, editorial flags, photo, excerpt, slug and series of each card |
| 9 | `python scripts/fetch_images.py data/cards.json import/images` | 400 and 800 px wide WebP files of each photo (about 26,000 photos, a few hours) |
| 10 | `python scripts/export.py data/cards.json import` | `import/catalog.json`, the file the game imports |

Tests: `python -m unittest discover -s scripts`.

## Rules (`build_cards.py`)

- **Rarity**: cards are ranked by visits over 12 months, then by number of wikis, and the ranking is cut into 0.25 % legendary, 2.5 % ultra rare, 7 % super rare, 20 % rare, 20 % uncommon and 50.25 % common. These shares are the default pack odds. The import never changes the rarity of a card already in the game: only the back-office can.
- **Hidden cards** (`hidden_reason`), which never come out of a pack:
  - `memorial`: places of remembrance (camps, necropolises, prisons…);
  - `commercial`: businesses still trading, whose name is often a brand;
  - `twentieth_century`: possibly still under the architect's copyright (built from 1900, a "XXe siècle" label, or an architect dead less than 70 years ago). To review in the back-office before showing it;
  - `photo`: no usable photo. Photos under 1,000 px on their long side, under the GFDL alone or without a licence are rejected, as are failed downloads.
- **Photos chosen by hand**: `photo_overrides.csv` replaces a monument's Wikidata photo, for example to keep a day photo of the Eiffel Tower (its night lighting is protected). Add a line there, or use the back-office, for a rare card whose photo was rejected.
- **Excerpt**: the start of the article's introduction, whole paragraphs until 300 characters (a first paragraph is often a single sentence saying where the monument is), cut after a sentence past 600, with the article's revision number.
- **Slug**: from the article title, which is unique on Wikipedia (`chateau-de-chambord`). The import keeps a card's slug once it exists, so its public address never changes.
- **Series**: region, family (except "Autres"), Patrimoine mondial de l'UNESCO, Patrimoine en péril.

## Replacing the rejected photos of rare cards

The spec asks for a photo chosen by hand when a rare card's photo is rejected. `python scripts/suggest_photos.py data/cards.json data/photo_candidates.csv` lists, for each legendary, ultra rare and super rare card without a usable photo (pass other rarities as extra arguments), the three best files among the monument's other Wikidata photos and its Commons category, checked against the same rules. Look at them on Commons, then either put the chosen file in `photo_overrides.csv` and run the pipeline again from step 6, or set it on the card in the back-office.

## Export

`import/` holds `catalog.json` and `images/`, where each photo is `<sha1>-400.webp` and `<sha1>-800.webp`. The name comes from the photo's SHA-1 on Commons, so a new photo always gets a new file name: the game serves them with a one-year cache.

```jsonc
{
  "format": 1,
  "collection": "heritage",
  "generated_at": "2026-10-20T12:00:00+00:00",
  "rarity_shares": { "legendary": 0.0025, "…": 0 },
  "series": [{ "slug": "ile-de-france", "type": "region", "name": "Île-de-France" }],
  "cards": [{
    "wikidata_id": "Q243", "slug": "tour-eiffel", "name": "tour Eiffel", "rank": 1, "rarity": "legendary",
    "protection": "inscrit", "unesco": true, "endangered": false, "family": "Autres",
    "department_code": "75", "department": "Paris", "region": "Île-de-France",
    "excerpt": "…", "article": { "title": "Tour Eiffel", "revision": 230000000 },
    "photo": {
      "commons_file": "Tour Eiffel Wikimedia Commons.jpg", "width": 2900, "height": 5367,
      "author": "Benh LIEU SONG", "license": "Public domain", "license_url": null,
      "files": { "400": "….-400.webp", "800": "….-800.webp" }
    },
    "photo_problem": null, "memorial": false, "commercial": false, "twentieth_century": false,
    "hidden_reason": null, "series": ["ile-de-france", "patrimoine-mondial"]
  }]
}
```

`photo` is `null` when no photo is usable; `photo_problem` then says why (`missing`, `too_small`, `license`, `download`). Names start lowercase, as on Wikidata: the card capitalizes them.

## Loading it into the game

Copy `import/` next to `docker-compose.yml` on the server (the worker mounts it read-only at `/app/import`), then run `docker compose exec worldup-worker node import-catalog.js`. Locally, `npm run import-catalog` reads `./import` and writes the photos to `./uploads`. The import checks the whole export and copies the photos before it changes the database, in one transaction, and running it again changes nothing.

## Every six months

Run the steps again from step 1, with the latest 12 months at step 4. New monuments and better photos come in; the cards already in the game keep their rarity and slug.
