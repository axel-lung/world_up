// The licences the cards credit. Imported by the Card component: keep this
// module free of server code.

/** The excerpts' licence: Wikipedia's text is under CC BY-SA 4.0. */
export const WIKIPEDIA_TEXT_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr';

/** The licence address Commons gave for a photo, if it is a web address the card can link to. */
export function licenseLinkUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
