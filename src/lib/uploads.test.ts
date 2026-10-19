import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageContentType, resolveUploadPath } from './uploads';

const root = path.resolve('/srv/uploads');

describe('resolveUploadPath', () => {
  it('resolves nested files inside the uploads directory', () => {
    expect(resolveUploadPath(['cards', '800', 'q123-ab12.webp'], root)).toBe(
      path.join(root, 'cards', '800', 'q123-ab12.webp'),
    );
  });

  it.each([
    [['..', 'etc', 'passwd']],
    [['cards', '..', '..', 'secret.webp']],
    [['cards', 'a/../../b.webp']],
    [['cards', 'a\\..\\..\\b.webp']],
    [['.env']],
    [['cards', '']],
    [['cards', 'x\0.webp']],
    [[]],
  ])('rejects %j', (segments) => {
    expect(resolveUploadPath(segments, root)).toBeNull();
  });
});

describe('imageContentType', () => {
  it('serves WebP images', () => {
    expect(imageContentType('/srv/uploads/cards/x.WEBP')).toBe('image/webp');
  });

  it('refuses anything that is not an image', () => {
    expect(imageContentType('/srv/uploads/notes.html')).toBeNull();
    expect(imageContentType('/srv/uploads/noextension')).toBeNull();
  });
});
