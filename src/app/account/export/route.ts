import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { consents, users } from '@/db/schema';
import { getAuth } from '@/lib/auth';

// Self-service export of the player's data (GDPR right of access and
// portability). Each lot adds its own tables: collection, coins, purchases.
export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return new Response(null, { status: 401 });
  const userId = session.user.id;

  const [account] = await db
    .select({
      pseudo: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      birthDate: users.birthDate,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  const acceptedDocuments = await db
    .select({ document: consents.document, version: consents.version, acceptedAt: consents.acceptedAt })
    .from(consents)
    .where(eq(consents.userId, userId))
    .orderBy(asc(consents.acceptedAt));

  const body = JSON.stringify({ exportedAt: new Date(), account, consents: acceptedDocuments }, null, 2);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="patrimoine-de-france-mes-donnees.json"',
      'Cache-Control': 'no-store',
    },
  });
}
