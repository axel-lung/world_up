import { describe, expect, it } from 'vitest';
import { renderPush } from './send-push';

describe('renderPush', () => {
  it('says what happened, under its topic, and opens its page', () => {
    const message = renderPush({
      id: 42,
      kind: 'trade_received',
      data: { userId: 'u1', tradeId: 7 },
      pseudo: 'Margot',
      card: null,
      collection: 'heritage',
    });
    expect(message).toEqual({
      title: 'Échanges',
      body: 'Margot vous propose un échange.',
      url: '/c/heritage/trades/7',
      tag: 'notification-42',
    });
  });

  it("names the card, and a former player once the other's account is deleted", () => {
    const outbid = renderPush({
      id: 1,
      kind: 'auction_outbid',
      data: { auctionId: 3, cardId: 9 },
      pseudo: null,
      card: 'château de Chambord',
      collection: 'heritage',
    });
    expect(outbid.title).toBe('Enchères');
    expect(outbid.body).toBe('Votre enchère sur Château de Chambord a été dépassée.');
    const request = renderPush({ id: 2, kind: 'friend_request', data: { userId: 'u2' }, pseudo: null, card: null, collection: null });
    expect(request).toMatchObject({ title: 'Amis', body: 'Un ancien joueur vous demande en ami.', url: '/friends' });
  });
});
