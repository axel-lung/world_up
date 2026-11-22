import { type FileHandle, open, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Header, PMTiles, type RangeResponse, type Source } from 'pmtiles';

// The map's background, served by the game itself: no tile service sees the
// players. The "map" folder (mounted at /app/map, map/README.md says how to
// fill it) holds the OpenStreetMap vector tiles of France, one PMTiles archive
// named by its date (tiles/france-2026-11-22.pmtiles), and the glyphs of the
// place names (fonts/<font>/<range>.pbf). The archive's name is in the tiles'
// address, so a new one is a new address: the tiles are cached for a year.
// MAP_DIR moves it (the tests use their own).
export const MAP_DIR = process.env.MAP_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'map');
const TILES_DIR = path.join(/*turbopackIgnore: true*/ MAP_DIR, 'tiles');
const FONTS_DIR = path.join(/*turbopackIgnore: true*/ MAP_DIR, 'fonts');

const ARCHIVE = /^([a-z0-9][a-z0-9-]*)\.pmtiles$/;
const FONT = /^[A-Za-z0-9 ]+$/;
const GLYPH_RANGE = /^\d{1,5}-\d{1,5}\.pbf$/;
// How long the archive found stays the current one before the folder is read again
const LIST_TTL_MS = 60_000;

export interface Tileset {
  /** The archive's name, without .pmtiles: part of the tiles' address. */
  name: string;
  minZoom: number;
  maxZoom: number;
  /** West, south, east, north. */
  bounds: [number, number, number, number];
}

/** Reads an archive from the disk, through one file handle kept open. */
class FileSource implements Source {
  private handle: Promise<FileHandle> | null = null;

  constructor(private readonly file: string) {}

  getKey() {
    return this.file;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.handle ??= open(this.file, 'r');
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await (await this.handle).read(buffer, 0, length, offset);
    return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) as ArrayBuffer };
  }

  async close() {
    const handle = await this.handle;
    this.handle = null;
    await handle?.close();
  }
}

interface Archive {
  name: string;
  source: FileSource;
  pmtiles: PMTiles;
  header: Header;
}

let archives = new Map<string, Archive>();
let listed: { at: number; name: string | null } | null = null;

async function archiveNames(): Promise<string[]> {
  try {
    return (await readdir(TILES_DIR)).flatMap((file) => ARCHIVE.exec(file)?.[1] ?? []).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function openArchive(name: string): Promise<Archive> {
  const known = archives.get(name);
  if (known) return known;
  const source = new FileSource(path.join(/*turbopackIgnore: true*/ TILES_DIR, `${name}.pmtiles`));
  const pmtiles = new PMTiles(source);
  const archive = { name, source, pmtiles, header: await pmtiles.getHeader() };
  archives.set(name, archive);
  return archive;
}

/** The newest archive, by name; null while the folder has none. */
async function currentArchive(now = Date.now()): Promise<Archive | null> {
  if (!listed || now - listed.at > LIST_TTL_MS) {
    const name = (await archiveNames()).at(-1) ?? null;
    listed = { at: now, name };
    // An archive replaced by a newer one is closed
    for (const [old, archive] of archives) {
      if (old !== name) {
        archives.delete(old);
        await archive.source.close();
      }
    }
  }
  return listed.name ? openArchive(listed.name) : null;
}

/** The tiles the map can use, or null: the map then shows its pins on a plain ground. */
export async function currentTileset(): Promise<Tileset | null> {
  const archive = await currentArchive();
  if (!archive) return null;
  const { header } = archive;
  return {
    name: archive.name,
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
  };
}

/**
 * A vector tile of the current archive, uncompressed (the server compresses
 * the response): undefined when the archive has no such tile (the sea,
 * outside France), null when `name` isn't the current archive (an address
 * from before a new one).
 */
export async function readTile(name: string, z: number, x: number, y: number): Promise<ArrayBuffer | null | undefined> {
  const archive = await currentArchive();
  if (!archive || archive.name !== name) return null;
  return (await archive.pmtiles.getZxy(z, x, y))?.data;
}

/** A range of glyphs of a font, as MapLibre asks for them; null when missing. */
export async function readGlyphs(font: string, range: string): Promise<Buffer | null> {
  if (!FONT.test(font) || !GLYPH_RANGE.test(range)) return null;
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ FONTS_DIR, font, range));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** For the tests: forget the archives opened. */
export async function resetTilesets() {
  for (const archive of archives.values()) await archive.source.close();
  archives = new Map();
  listed = null;
}
