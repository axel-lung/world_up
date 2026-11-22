import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The map's background read from a PMTiles archive written here: one tile at
// zoom 0, uncompressed, which is all the format needs (spec v3).

function varint(value: number): number[] {
  const bytes: number[] = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return bytes;
}

/** An archive holding `tile` at 0/0/0, over the given bounds. */
function archive(tile: Buffer, [west, south, east, north]: [number, number, number, number]): Buffer {
  // One entry: tile ID 0, run length 1, its length, offset 0 (stored as offset + 1)
  const directory = Buffer.from([...varint(1), ...varint(0), ...varint(1), ...varint(tile.length), ...varint(1)]);
  const header = Buffer.alloc(127);
  header.write('PMTiles', 0, 'ascii');
  header.writeUInt8(3, 7);
  const u64 = (offset: number, value: number) => header.writeBigUInt64LE(BigInt(value), offset);
  u64(8, 127); // root directory
  u64(16, directory.length);
  u64(24, 127 + directory.length); // metadata: none
  u64(32, 0);
  u64(40, 127 + directory.length); // leaf directories: none
  u64(48, 0);
  u64(56, 127 + directory.length); // tile data
  u64(64, tile.length);
  u64(72, 1);
  u64(80, 1);
  u64(88, 1);
  header.writeUInt8(1, 96); // clustered
  header.writeUInt8(1, 97); // internal compression: none
  header.writeUInt8(1, 98); // tile compression: none
  header.writeUInt8(1, 99); // MVT
  header.writeUInt8(0, 100); // min zoom
  header.writeUInt8(0, 101); // max zoom
  header.writeInt32LE(Math.round(west * 1e7), 102);
  header.writeInt32LE(Math.round(south * 1e7), 106);
  header.writeInt32LE(Math.round(east * 1e7), 110);
  header.writeInt32LE(Math.round(north * 1e7), 114);
  return Buffer.concat([header, directory, tile]);
}

let dir: string;
let tiles: typeof import('./tiles');
let route: typeof import('@/app/map/[...path]/route');
const TILE = Buffer.from('a vector tile');

const get = (url: string) =>
  route.GET(new Request(`http://localhost${url}`), {
    params: Promise.resolve({ path: url.split('/').slice(2) }),
  } as never);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'worldup-map-'));
  await mkdir(path.join(dir, 'tiles'));
  await mkdir(path.join(dir, 'fonts', 'Noto Sans Regular'), { recursive: true });
  await writeFile(path.join(dir, 'tiles', 'france-2026-10-01.pmtiles'), archive(Buffer.from('old'), [-5, 41, 10, 51]));
  await writeFile(path.join(dir, 'tiles', 'france-2026-11-22.pmtiles'), archive(TILE, [-5.2, 41.3, 9.6, 51.1]));
  await writeFile(path.join(dir, 'fonts', 'Noto Sans Regular', '0-255.pbf'), 'glyphs');
  vi.stubEnv('MAP_DIR', dir);
  tiles = await import('./tiles');
  route = await import('@/app/map/[...path]/route');
});

afterAll(async () => {
  await tiles.resetTilesets();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe('the map tiles', () => {
  it('uses the newest archive, with its zooms and bounds', async () => {
    expect(await tiles.currentTileset()).toEqual({
      name: 'france-2026-11-22',
      minZoom: 0,
      maxZoom: 0,
      bounds: [-5.2, 41.3, 9.6, 51.1],
    });
  });

  it('serves a tile of the current archive, cached for a year', async () => {
    const response = await get('/map/tiles/france-2026-11-22/0/0/0.pbf');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('a vector tile');
  });

  it('answers an empty tile where the archive has none', async () => {
    expect((await get('/map/tiles/france-2026-11-22/3/4/2.pbf')).status).toBe(204);
  });

  it('refuses an older archive, a malformed address or another file', async () => {
    for (const url of [
      '/map/tiles/france-2026-10-01/0/0/0.pbf',
      '/map/tiles/france-2026-11-22/0/0/x.pbf',
      '/map/tiles/france-2026-11-22/0/0/0.png',
      '/map/tiles/france-2026-11-22/0/0',
      '/map/other/file',
    ]) {
      expect((await get(url)).status, url).toBe(404);
    }
  });

  it('serves the glyphs, and nothing outside their folder', async () => {
    const glyphs = await get('/map/fonts/Noto%20Sans%20Regular/0-255.pbf');
    expect(glyphs.status).toBe(200);
    expect(await glyphs.text()).toBe('glyphs');
    for (const url of ['/map/fonts/Noto%20Sans%20Regular/256-511.pbf', '/map/fonts/..%2F..%2Ftiles/0-255.pbf', '/map/fonts/%E0%A4%A/0-255.pbf']) {
      expect((await get(url)).status, url).toBe(404);
    }
  });
});
