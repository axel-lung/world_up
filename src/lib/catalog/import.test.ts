import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyImages } from './import';
import { testCard, testCatalog } from './testing';

describe('copyImages', () => {
  let dir: string;
  let source: string;
  let target: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'catalog-'));
    source = path.join(dir, 'import', 'images');
    target = path.join(dir, 'uploads', 'cards');
    await mkdir(source, { recursive: true });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const catalog = testCatalog([testCard(1, { image: 'a1' }), testCard(2, { photo: null, hidden_reason: 'photo' })]);
  const files = ['a1aaaaaaaaaaaaaaaaaa-400.webp', 'a1aaaaaaaaaaaaaaaaaa-800.webp'];

  it('copies the photo files the cards use, once', async () => {
    for (const file of files) await writeFile(path.join(source, file), file);
    expect(await copyImages(catalog, source, target)).toBe(2);
    expect((await readdir(target)).sort()).toEqual(files);
    expect(await readFile(path.join(target, files[0]), 'utf8')).toBe(files[0]);
    expect(await copyImages(catalog, source, target)).toBe(0);
  });

  it('stops before copying anything when a file is missing', async () => {
    await writeFile(path.join(source, files[0]), 'x');
    await expect(copyImages(catalog, source, target)).rejects.toThrow('1 photo files missing');
    await expect(readdir(target)).rejects.toThrow();
  });
});
