# The map's background

The "Carte" page (`/c/heritage/map`) draws the monuments on vector tiles of OpenStreetMap that the game serves itself (`src/app/map/[...path]/route.ts`): no tile service sees the players. This folder holds them, next to `docker-compose.yml`; the `worldup-web` service mounts it read-only at `/app/map`. Only this README is committed.

```
map/
  tiles/france-2026-11-22.pmtiles    one PMTiles archive, OpenMapTiles schema, named by its date
  fonts/Noto Sans Regular/0-255.pbf  the glyphs of the place names, one folder per font
  fonts/Noto Sans Bold/…
  fonts/Noto Sans Italic/…
```

Without an archive the map still works: the pins show on a plain ground. Without the glyphs, the place names are missing.

## The tiles

[Planetiler](https://github.com/onthegomap/planetiler) builds them from Geofabrik's extract of France, with the OpenMapTiles profile that `src/lib/map/style.ts` reads. With Docker, from the repository root (on the server, or on a workstation and then copied):

```sh
mkdir -p map/build map/tiles
docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx6g" -v "$PWD/map/build:/data" \
  ghcr.io/onthegomap/planetiler:latest --download --area=france --storage=mmap \
  --output=/data/france-$(date +%F).pmtiles
mv map/build/france-*.pmtiles map/tiles/
```

- `--download` fetches the France extract (about 4.5 GB) and what the profile needs besides: the oceans' polygons, Natural Earth for the small zooms, lake labels (about 1.5 GB more). They stay in `map/build/sources` for the next build; delete `map/build` when done.
- It takes from half an hour to an hour and a few gigabytes of disk; the archive itself weighs a few gigabytes (zooms 0 to 14; the map zooms further on the same tiles).
- Geofabrik's France extract includes the overseas departments. The overseas collectivities (Saint-Martin, Polynésie française…) aren't in it: their few monuments show on the plain ground.
- To try it on a small area first: `--area=ile-de-france --bounds=2.22,48.80,2.47,48.92`.

The newest archive by name is the one served, checked every minute: a new one replaces the old without a restart. Its name is part of the tiles' address, cached for a year by the browsers, so a new archive needs a new name (the date does it). Delete the old one once the new one serves. A rebuild once or twice a year is plenty: the streets don't move much, and the monuments come from the catalogue, not from the tiles.

## The glyphs

MapLibre draws the place names with fonts cut into ranges of 256 characters. Those of Noto Sans come from the OpenMapTiles fonts:

```sh
curl -LO https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-sans.zip
unzip -q noto-sans.zip "Noto Sans Regular/*" "Noto Sans Bold/*" "Noto Sans Italic/*" -d map/fonts
rm noto-sans.zip
```

They never change: once is enough.

## Credits

The tiles are OpenStreetMap data (© OpenStreetMap contributors, ODbL) in the OpenMapTiles schema (© OpenMapTiles, CC BY 4.0), and the fonts are under the SIL Open Font License: the map shows "© OpenMapTiles © OpenStreetMap", and `/credits` says it in full.
