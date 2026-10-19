// Shared by every collection, rarest first. Labels are in messages/fr.json (Rarity).
export const RARITIES = ['legendary', 'ultra', 'super', 'rare', 'uncommon', 'common'] as const;
export type Rarity = (typeof RARITIES)[number];

// Diamond marks printed next to the rarity name: rarity never relies on color alone.
export const RARITY_PIPS: Record<Rarity, number> = {
  legendary: 6,
  ultra: 5,
  super: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};
