// Who publishes the site and who hosts it, for the legal notice, the terms and
// the privacy policy (LCEN, art. 6). Read from the environment, since the legal
// status is still open (spec, "Questions ouvertes"): every value must be set in
// the server's .env before the site opens to the public. A missing one shows
// as "à compléter".

const FIELDS = {
  name: 'PUBLISHER_NAME',
  address: 'PUBLISHER_ADDRESS',
  registration: 'PUBLISHER_REGISTRATION',
  vat: 'PUBLISHER_VAT',
  phone: 'PUBLISHER_PHONE',
  email: 'PUBLISHER_EMAIL',
  director: 'PUBLICATION_DIRECTOR',
  hostName: 'HOST_NAME',
  hostAddress: 'HOST_ADDRESS',
  hostPhone: 'HOST_PHONE',
} as const;

export type Publisher = Record<keyof typeof FIELDS, string | null>;

export function getPublisher(): Publisher {
  return Object.fromEntries(
    Object.entries(FIELDS).map(([key, name]) => [key, process.env[name]?.trim() || null]),
  ) as Publisher;
}
