import { createHmac } from 'node:crypto';
import { type APIRequestContext, expect, type Page, test as base } from '@playwright/test';

// Mailpit's API (docker-compose.dev.yml), where the worker delivers every e-mail.
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
}

async function searchEmails(request: APIRequestContext, to: string, subject?: string): Promise<MailpitSummary[]> {
  const query = [`to:"${to}"`, subject && `subject:"${subject}"`].filter(Boolean).join(' ');
  const response = await request.get(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(query)}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).messages as MailpitSummary[];
}

export async function countEmails(request: APIRequestContext, to: string, subject?: string): Promise<number> {
  return (await searchEmails(request, to, subject)).length;
}

/** Waits for the newest e-mail to `to` with `subject`, and returns the link it contains. */
export async function linkFromEmail(request: APIRequestContext, to: string, subject: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => (id = (await searchEmails(request, to, subject))[0]?.ID), { timeout: 15_000 })
    .toBeTruthy();
  const message = await (await request.get(`${MAILPIT_URL}/api/v1/message/${id}`)).json();
  const link = /https?:\/\/\S+/.exec(message.Text as string)?.[0];
  expect(link).toBeTruthy();
  return link!;
}

export interface Player {
  pseudo: string;
  email: string;
  password: string;
}

export function newPlayer(): Player {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { pseudo: `e2e_${id}`, email: `${id}@example.test`, password: 'patrimoine-e2e-2026' };
}

/** Fills and sends the signup form. */
export async function signUp(page: Page, player: Player, birthDate = '1990-05-31') {
  await page.goto('/signup');
  await page.getByLabel('Pseudo').fill(player.pseudo);
  await page.getByLabel('Adresse e-mail').fill(player.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(player.password);
  await page.getByLabel('Date de naissance').fill(birthDate);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
}

/** Signs up and opens the confirmation link: the player ends up signed in. */
export async function signUpAndVerify(page: Page, player: Player) {
  await signUp(page, player);
  await expect(page.getByRole('heading', { name: 'Confirmez votre adresse e-mail' })).toBeVisible();
  await page.goto(await linkFromEmail(page.request, player.email, 'Confirmez votre adresse e-mail'));
  await expect(page.getByText('Votre adresse e-mail est confirmée')).toBeVisible();
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** The current code of an authenticator app set up with this base32 key (RFC 6238). */
export function totp(base32Key: string, now = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...base32Key.replace(/=+$/, '').toUpperCase()]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Each test comes from its own IP address (X-Forwarded-For, as Traefik sets
 * it), so the auth rate limits count each test apart.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    const byte = () => Math.floor(Math.random() * 254) + 1;
    await use({ 'x-forwarded-for': `10.${byte()}.${byte()}.${byte()}` });
  },
});

export { expect };
