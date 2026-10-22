import { and, ne, sql } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins';
import { db } from '@/db';
import { accounts, consents, sessions, twoFactors, users, verifications } from '@/db/schema';
import {
  isAdult,
  isValidBirthDate,
  isValidPseudo,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizePseudo,
  TERMS_VERSION,
} from './account-rules';
import { markActive } from './account-retention';
import { ACCOUNT_ERRORS, type AccountErrorCode } from './auth-errors';
import { requireEnv } from './env';
import { cancelOrphanTrades } from './game/trades';
import { enqueueEmail } from './job-queue';
import { hashPassword, verifyPassword } from './password';

const reject = (code: AccountErrorCode) =>
  APIError.from('BAD_REQUEST', { code, message: ACCOUNT_ERRORS[code] });

async function isPseudoTaken(pseudo: string, exceptUserId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.name}) = lower(${pseudo})`, exceptUserId ? ne(users.id, exceptUserId) : undefined))
    .limit(1);
  return Boolean(row);
}

/** Valid and free pseudo, normalized; throws otherwise. */
async function checkPseudo(value: unknown, exceptUserId?: string): Promise<string> {
  const pseudo = typeof value === 'string' ? normalizePseudo(value) : '';
  if (!isValidPseudo(pseudo)) throw reject('INVALID_PSEUDO');
  if (await isPseudoTaken(pseudo, exceptUserId)) throw reject('PSEUDO_TAKEN');
  return pseudo;
}

// Request-level checks, before Better Auth runs the endpoint. They answer the
// same whether the e-mail already has an account or not, so they reveal nothing
// about existing accounts (a duplicate signup gets the generic success).
const checkAccountInput = createAuthMiddleware(async (ctx) => {
  if (ctx.path === '/sign-up/email') {
    const body = ctx.body as Record<string, unknown>;
    const now = new Date();
    const birthDate = typeof body.birthDate === 'string' ? body.birthDate : '';
    if (!isValidPseudo(normalizePseudo(String(body.name ?? '')))) throw reject('INVALID_PSEUDO');
    if (!isValidBirthDate(birthDate, now)) throw reject('INVALID_BIRTH_DATE');
    if (!isAdult(birthDate, now)) throw reject('UNDERAGE');
    if (body.acceptTerms !== true) throw reject('TERMS_NOT_ACCEPTED');
    const name = await checkPseudo(body.name);
    return { context: { ...ctx, body: { ...body, name } } };
  }

  if (ctx.path === '/update-user') {
    const body = ctx.body as Record<string, unknown>;
    if ('birthDate' in body) throw reject('BIRTH_DATE_LOCKED');
    if ('name' in body) {
      const session = await getSessionFromCtx(ctx);
      const name = await checkPseudo(body.name, session?.user.id);
      return { context: { ...ctx, body: { ...body, name } } };
    }
  }
});

function createAuth() {
  const appUrl = requireEnv('APP_URL');
  return betterAuth({
    appName: 'World Up',
    baseURL: appUrl,
    secret: requireEnv('AUTH_SECRET'),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications, twoFactor: twoFactors },
    }),
    advanced: { database: { generateId: 'uuid' } },
    // Its info messages contain e-mail addresses: keep them out of the logs.
    logger: { level: 'warn' },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => enqueueEmail({ template: 'resetPassword', to: user.email, url }),
      // A signup with a known address: tell its owner instead of the visitor.
      onExistingUserSignUp: ({ user }) =>
        enqueueEmail({ template: 'existingAccount', to: user.email, url: `${appUrl}/login` }),
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in before verifying sends a new link.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: ({ user, url }) => enqueueEmail({ template: 'verifyEmail', to: user.email, url }),
    },

    user: {
      additionalFields: {
        birthDate: { type: 'string', required: true, input: true },
      },
      deleteUser: {
        enabled: true,
        // The player's open offers are void once their row is gone: record it
        afterDelete: async () => {
          await cancelOrphanTrades(db, new Date());
        },
      },
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      additionalFields: {
        twoFactorVerified: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },

    // On in production only (Better Auth's default), in memory: one web process.
    // The client IP comes from X-Forwarded-For, which Traefik sets.
    rateLimit: {
      customRules: {
        '/sign-in/email': { window: 15 * 60, max: 10 },
        '/sign-up/email': { window: 60 * 60, max: 5 },
        '/request-password-reset': { window: 60 * 60, max: 5 },
        '/send-verification-email': { window: 60 * 60, max: 5 },
        '/change-password': { window: 15 * 60, max: 10 },
        '/delete-user': { window: 15 * 60, max: 10 },
        '/two-factor/*': { window: 15 * 60, max: 10 },
      },
    },

    hooks: { before: checkAccountInput },
    databaseHooks: {
      user: {
        create: {
          // Only signups that accepted the terms get here (checkAccountInput).
          after: async (user) => {
            await db.insert(consents).values({ userId: user.id, document: 'terms', version: TERMS_VERSION });
          },
        },
      },
      session: {
        create: {
          // We collect e-mail, birth date and purchases only: no IP or browser.
          // Only a session opened by a second factor (code from the app, or a
          // backup code) gets to /admin.
          before: async (session, ctx) => ({
            data: {
              ...session,
              ipAddress: null,
              userAgent: null,
              twoFactorVerified: Boolean(ctx?.path.startsWith('/two-factor/verify')),
            },
          }),
          // A sign-in, and below a session refresh (once a day at most):
          // what keeps an account from being deleted as inactive.
          after: (session) => markActive(session.userId),
        },
        update: {
          after: (session) => markActive(session.userId),
        },
      },
    },

    // Authenticator app for the back-office account (src/lib/admin.ts), without
    // "trust this device": every sign-in to /admin asks for a code.
    // nextCookies lets server actions set the session cookie; it must stay last.
    plugins: [twoFactor(), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

/**
 * Built on first use rather than at import: `next build` loads this module
 * without the runtime secrets.
 */
export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
