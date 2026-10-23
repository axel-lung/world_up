// A refusal the player can act on; the pages map each code to a message in
// messages/fr.json (Game.errors). Anything else is a server error.
export type GameErrorCode =
  | 'noPack'
  | 'tooFast'
  | 'noDuplicate'
  | 'notEnoughCoins'
  | 'tradesClosed'
  | 'notFriends'
  | 'tradeEmpty'
  | 'tradeTooBig'
  | 'tradeUnavailable'
  | 'tooManyOffers'
  | 'tradeOver'
  | 'auctionsClosed'
  | 'auctionUnavailable'
  | 'auctionPrice'
  | 'auctionDuration'
  | 'tooManyAuctions'
  | 'auctionOver'
  | 'auctionHasBids'
  | 'ownAuction'
  | 'bidTooLow'
  | 'bidTooHigh'
  | 'bidOverCoins';

export class GameError extends Error {
  constructor(readonly code: GameErrorCode) {
    super(code);
  }
}
