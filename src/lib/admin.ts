import { notFound, redirect } from 'next/navigation';
import { getSession, type Session } from './session';

// The back-office belongs to one account, the one whose e-mail is ADMIN_EMAIL,
// and only to its sessions opened with a second factor.

export function isAdminEmail(email: string): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(admin) && email.trim().toLowerCase() === admin;
}

/**
 * Where a session stands with the back-office: null for anyone but the admin;
 * "enroll" before the authenticator app is set up; "reauthenticate" for a
 * session opened without the code (before the app was set up, on another
 * device); "granted" otherwise.
 */
export function adminStatus(session: Session | null): 'granted' | 'enroll' | 'reauthenticate' | null {
  if (!session || !isAdminEmail(session.user.email)) return null;
  if (session.session.twoFactorVerified) return 'granted';
  return session.user.twoFactorEnabled ? 'reauthenticate' : 'enroll';
}

/**
 * For back-office pages and server actions: sends visitors to the login page,
 * shows a 404 to players, and sends the admin to /admin/two-factor until the
 * session has passed the second factor.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login?next=%2Fadmin');
  const status = adminStatus(session);
  if (!status) notFound();
  if (status !== 'granted') redirect('/admin/two-factor');
  return session;
}
