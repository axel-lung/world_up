/** Wikidata labels start lowercase ("abbaye du Thoronet"); the card capitalizes them. */
export function displayName(name: string): string {
  return name.charAt(0).toLocaleUpperCase('fr') + name.slice(1);
}

/** Position in the series: "004/1452". */
export function seriesNumber(number: number, total: number): string {
  return `${String(number).padStart(3, '0')}/${total}`;
}

/**
 * Outside a 1.1 to 1.9 width-to-height ratio (portrait photos, panoramas), the
 * whole photo sits on a blurred copy of itself instead of being cropped to 4:3.
 * Photos of unknown size are treated as 4:3.
 */
export function needsLetterbox(width?: number, height?: number): boolean {
  const ratio = width && height ? width / height : 4 / 3;
  return ratio < 1.1 || ratio > 1.9;
}
