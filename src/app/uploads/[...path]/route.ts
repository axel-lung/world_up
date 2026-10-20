import { readFile } from 'node:fs/promises';
import { imageContentType, resolveUploadPath } from '@/lib/uploads';

// Card images from the "uploads" volume. Production never links to Wikimedia.
export async function GET(_request: Request, ctx: RouteContext<'/uploads/[...path]'>) {
  const { path: segments } = await ctx.params;
  const file = resolveUploadPath(segments);
  const contentType = file && imageContentType(file);
  if (!file || !contentType) return new Response(null, { status: 404 });

  let body: Buffer;
  try {
    body = await readFile(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') return new Response(null, { status: 404 });
    throw error;
  }

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
