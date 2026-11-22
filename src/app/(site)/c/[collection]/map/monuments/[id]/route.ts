import { getActiveCollection } from '@/lib/game/rules';
import { monumentDetails } from '@/lib/map/monuments';
import { getSession } from '@/lib/session';

// What a monument's sheet adds to the list: for a card the player owns, its
// page, thumbnail and copies; nothing more for one they lack.
export async function GET(_request: Request, ctx: RouteContext<'/c/[collection]/map/monuments/[id]'>) {
  const params = await ctx.params;
  const [session, collection] = await Promise.all([getSession(), getActiveCollection(params.collection)]);
  const cardId = Number(params.id);
  if (!collection || !Number.isSafeInteger(cardId) || cardId <= 0) return new Response(null, { status: 404 });
  if (!session) return new Response(null, { status: 401 });
  const details = await monumentDetails(session.user.id, collection, cardId);
  if (!details) return new Response(null, { status: 404 });
  return Response.json(details, { headers: { 'Cache-Control': 'private, no-store' } });
}
