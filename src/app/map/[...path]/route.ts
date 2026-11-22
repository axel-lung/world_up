import { readGlyphs, readTile } from '@/lib/map/tiles';

// The map's background (src/lib/map/tiles.ts): /map/tiles/<archive>/<z>/<x>/<y>.pbf
// and /map/fonts/<font>/<range>.pbf. Public, like the OpenStreetMap data they
// hold, and cached for a year: a new archive has a new name.
const CACHED = {
  'Content-Type': 'application/x-protobuf',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
};
const INTEGER = /^\d{1,7}$/;

const notFound = () => new Response(null, { status: 404 });

// A font's name has spaces ("Noto Sans Regular"): decoded once, whether the
// segment came encoded or not
function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, ctx: RouteContext<'/map/[...path]'>) {
  const decoded = (await ctx.params).path.map(decode);
  if (decoded.some((segment) => segment === null)) return notFound();
  const [kind, ...rest] = decoded as string[];

  if (kind === 'tiles' && rest.length === 4) {
    const [name, z, x, file] = rest;
    const y = file.endsWith('.pbf') ? file.slice(0, -4) : '';
    if (![z, x, y].every((n) => INTEGER.test(n))) return notFound();
    const tile = await readTile(name, Number(z), Number(x), Number(y));
    if (tile === null) return notFound();
    // No tile there: an empty one, which MapLibre draws as nothing
    return tile === undefined ? new Response(null, { status: 204, headers: CACHED }) : new Response(tile, { headers: CACHED });
  }

  if (kind === 'fonts' && rest.length === 2) {
    const glyphs = await readGlyphs(rest[0], rest[1]);
    return glyphs ? new Response(new Uint8Array(glyphs), { headers: CACHED }) : notFound();
  }

  return notFound();
}
