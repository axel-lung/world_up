import { describe, expect, it } from 'vitest';
import { isPushService, pushSubscriptionInput } from './push';

const keys = { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };

describe('isPushService', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:APA91b',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
    'https://web.push.apple.com/QGuQyavXutnMH',
  ])('accepts a browser push service: %s', (endpoint) => {
    expect(isPushService(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:secret@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.example.test/fcm/send/abc',
    'https://evilfcm.googleapis.com/fcm/send/abc',
    'https://worldup-db:5432/',
    'https://127.0.0.1/',
    'not a url',
  ])('refuses any other address, which the worker would post to: %s', (endpoint) => {
    expect(isPushService(endpoint)).toBe(false);
  });
});

describe('pushSubscriptionInput', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';

  it("reads a browser's subscription, ignoring its other fields", () => {
    const input = pushSubscriptionInput.parse({ endpoint, expirationTime: null, keys });
    expect(input).toEqual({ endpoint, keys });
  });

  it('refuses keys of the wrong size or alphabet', () => {
    const short = Buffer.alloc(64, 4).toString('base64url');
    expect(pushSubscriptionInput.safeParse({ endpoint, keys: { ...keys, p256dh: short } }).success).toBe(false);
    expect(pushSubscriptionInput.safeParse({ endpoint, keys: { ...keys, auth: `${keys.auth}AA` } }).success).toBe(false);
    expect(pushSubscriptionInput.safeParse({ endpoint, keys: { ...keys, auth: 'BwcHBwcHBwcHBwcHBwcHBw$' } }).success).toBe(false);
    expect(pushSubscriptionInput.safeParse({ endpoint }).success).toBe(false);
  });

  it('refuses an address outside the push services', () => {
    expect(pushSubscriptionInput.safeParse({ endpoint: 'https://example.test/push', keys }).success).toBe(false);
  });
});
