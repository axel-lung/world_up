import { getActiveCollection } from '@/lib/game/rules';
import { listMonuments, monumentsVersion } from '@/lib/map/monuments';
import { getSession } from '@/lib/session';

// The map's monuments (src/lib/map/monuments.ts), for a signed-in player. The
// page asks with the list's version (?v=): while it is the current one, the
// browser keeps the answer for a year; an older one gets the current list,
// kept for no time.
export async function GET(request: Request, ctx: RouteContext<'/c/[collection]/map/monuments'>) {
  const [session, collection] = await Promise.all([getSession(), getActiveCollection((await ctx.params).collection)]);
  if (!collection) return new Response(null, { status: 404 });
  if (!session) return new Response(null, { status: 401 });
  const [version, monuments] = await Promise.all([monumentsVersion(collection.id), listMonuments(collection.id)]);
  const asked = new URL(request.url).searchParams.get('v');
  return Response.json(
    { version, monuments },
    {
      headers: {
        'Cache-Control': asked === version ? 'private, max-age=31536000, immutable' : 'private, no-store',
        Vary: 'Cookie',
      },
    },
  );
}
