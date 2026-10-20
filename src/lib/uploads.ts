import path from 'node:path';

// The "uploads" Docker volume, mounted at /app/uploads (the standalone server's
// working directory is /app). Card images are written once by the catalogue
// import and served with an immutable cache: a new photo needs a new file name.
// The turbopackIgnore comments keep runtime files out of Next.js file tracing,
// which would otherwise copy them (or the whole project) into the build.
export const UPLOADS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'uploads');
// Card photos, <sha1>-400.webp and <sha1>-800.webp, served at /uploads/cards/.
export const CARD_IMAGES_DIR = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, 'cards');

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/**
 * Maps URL path segments to a file inside `root`, or null when the segments
 * could escape it or name a hidden file.
 */
export function resolveUploadPath(segments: string[], root: string = UPLOADS_DIR): string | null {
  const safe = segments.length > 0 && segments.every(
    (segment) =>
      segment !== '' &&
      !segment.startsWith('.') &&
      !/[/\\\0]/.test(segment),
  );
  if (!safe) return null;

  const base = path.resolve(/*turbopackIgnore: true*/ root);
  const resolved = path.resolve(/*turbopackIgnore: true*/ base, ...segments);
  return resolved.startsWith(base + path.sep) ? resolved : null;
}

/** Content type of a servable image, or null for any other file. */
export function imageContentType(file: string): string | null {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? null;
}
