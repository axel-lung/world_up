import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CommonsInfo, cleanAuthor, importCommonsPhoto, photoProblem } from './commons-photo';

const info = (overrides: Partial<CommonsInfo> = {}): CommonsInfo => ({
  title: 'Château de Test.jpg',
  width: 4000,
  height: 3000,
  sha1: 'ab'.repeat(20),
  downloadUrl: 'https://upload.example/thumb.jpg',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
  artist: 'Jean Photo',
  ...overrides,
});

describe('photo rules', () => {
  it('follow the pipeline: 1,000 px on the long side, no GFDL alone, a licence', () => {
    expect(photoProblem(info({ width: 1000, height: 600 }))).toBeNull();
    expect(photoProblem(info({ width: 999, height: 600 }))).toBe('photoTooSmall');
    expect(photoProblem(info({ license: 'GFDL' }))).toBe('photoLicense');
    expect(photoProblem(info({ license: null }))).toBe('photoLicense');
    expect(photoProblem(info({ license: 'Public domain' }))).toBeNull();
    expect(photoProblem(null)).toBe('photoMissing');
  });

  it('simplify the author lines Commons generates', () => {
    expect(cleanAuthor('No machine-readable author provided. Calips assumed (based on copyright claims).')).toBe('Calips');
    expect(cleanAuthor('Unknown author')).toBeNull();
  });
});

describe('importCommonsPhoto', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'photo-'));
    vi.stubEnv('APP_URL', 'https://jeu.example');
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  function stubCommons(page: object, image?: Buffer) {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) =>
      url.startsWith('https://commons.wikimedia.org/w/api.php')
        ? Response.json({ query: { pages: [page] } })
        : new Response(image ? new Uint8Array(image) : null, { status: image ? 200 : 404 }),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  const page = {
    title: 'File:Château de Test.jpg',
    imageinfo: [
      {
        width: 4000,
        height: 3000,
        sha1: 'cd'.repeat(20),
        url: 'https://upload.example/original.jpg',
        thumburl: 'https://upload.example/960px.jpg',
        extmetadata: {
          LicenseShortName: { value: 'CC BY-SA 4.0' },
          LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
          Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jean">Jean&nbsp;Photo</a>' },
        },
      },
    ],
  };

  it('saves the 400 and 800 px WebP files and returns the credits', async () => {
    const jpeg = await sharp({ create: { width: 960, height: 720, channels: 3, background: '#8a5a34' } }).jpeg().toBuffer();
    const fetch = stubCommons(page, jpeg);
    const photo = await importCommonsPhoto('File:Château_de_Test.jpg', dir);
    expect(photo).toEqual({
      image: 'cd'.repeat(10),
      commonsFile: 'Château de Test.jpg',
      width: 4000,
      height: 3000,
      author: 'Jean Photo',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    });
    expect((await readdir(dir)).sort()).toEqual([`${'cd'.repeat(10)}-400.webp`, `${'cd'.repeat(10)}-800.webp`]);
    expect((await sharp(await readFile(path.join(dir, `${'cd'.repeat(10)}-400.webp`))).metadata()).width).toBe(400);
    // The download is the 960 px thumbnail, with a User-Agent that has a contact
    expect(fetch).toHaveBeenLastCalledWith('https://upload.example/960px.jpg', expect.anything());
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { 'User-Agent': 'PatrimoineDeFrance/1.0 (https://jeu.example)' } });
  });

  it('refuses a photo that breaks the rules, before downloading it', async () => {
    const fetch = stubCommons({ ...page, imageinfo: [{ ...page.imageinfo[0], width: 800, height: 600 }] });
    await expect(importCommonsPhoto('Petite.jpg', dir)).rejects.toMatchObject({ code: 'photoTooSmall' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a missing file or one that is not an image', async () => {
    stubCommons({ title: 'File:Absent.jpg', missing: true });
    await expect(importCommonsPhoto('Absent.jpg', dir)).rejects.toMatchObject({ code: 'photoMissing' });
    stubCommons(page, Buffer.from('%PDF-1.7'));
    await expect(importCommonsPhoto('Document.pdf', dir)).rejects.toMatchObject({ code: 'photoDownload' });
    expect(await readdir(dir)).toEqual([]);
  });
});
