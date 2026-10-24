import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { achievements, consents, packState, userAchievements, users } from '@/db/schema';
import { getAuth } from '@/lib/auth';
import { playerReports } from '@/lib/catalog/reports';
import { coinBalance, playerLedger } from '@/lib/game/coins';
import { playerCards } from '@/lib/game/collection';
import { playerAuctions } from '@/lib/game/market';
import { playerOpenings } from '@/lib/game/packs';
import { playerTrades } from '@/lib/game/trades';
import { playerNotifications } from '@/lib/notifications/notifications';
import { playerSignInMethods } from '@/lib/sign-in-methods';
import { playerFriendships } from '@/lib/social/friends';

// Self-service export of the player's data (GDPR right of access and
// portability). Each lot adds its own tables: collection, coins, friends, purchases.
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
  const signIn = await playerSignInMethods(userId);
  const acceptedDocuments = await db
    .select({ document: consents.document, version: consents.version, acceptedAt: consents.acceptedAt })
    .from(consents)
    .where(eq(consents.userId, userId))
    .orderBy(asc(consents.acceptedAt));

  const [reports, packReserve, openings, collection, coins, ledger, obtained, friends, trades, auctions, notifications] = await Promise.all([
    playerReports(userId),
    db
      .select({ packs: packState.packs, lastRefill: packState.lastRefill })
      .from(packState)
      .where(eq(packState.userId, userId)),
    playerOpenings(userId),
    playerCards(userId),
    coinBalance(db, userId),
    playerLedger(userId),
    db
      .select({ achievement: achievements.code, obtainedAt: userAchievements.obtainedAt })
      .from(userAchievements)
      .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
      .where(eq(userAchievements.userId, userId))
      .orderBy(asc(userAchievements.obtainedAt)),
    playerFriendships(userId),
    playerTrades(userId),
    playerAuctions(userId),
    playerNotifications(userId),
  ]);

  const body = JSON.stringify(
    {
      exportedAt: new Date(),
      account: { ...account, signIn },
      consents: acceptedDocuments,
      reports,
      game: { packReserve, openings, collection, coins: { balance: coins, ledger }, achievements: obtained },
      social: { friends, trades, auctions },
      notifications,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="patrimoine-de-france-mes-donnees.json"',
      'Cache-Control': 'no-store',
    },
  });
}
