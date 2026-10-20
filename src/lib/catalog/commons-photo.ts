import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { requireEnv } from '@/lib/env';
import { CARD_IMAGES_DIR } from '@/lib/uploads';
import type { NewPhoto } from './admin';

// "Replace the photo" in the back-office: the only time the server calls
// Wikimedia Commons, on an admin's request and never while anyone plays. Once
// saved here, the photo is served from uploads like the imported ones. The
// rules are the pipeline's (scripts/build_cards.py, scripts/fetch_images.py).

const API = 'https://commons.wikimedia.org/w/api.php';
// A standard Commons thumbnail width, enough for the 800 px file
const DOWNLOAD_WIDTH = 960;
const MIN_LONG_SIDE = 1000;
const WIDTHS = [400, 800] as const;
const WEBP_QUALITY = 80;
const TIMEOUT_MS = 20_000;

export type PhotoErrorCode = 'photoMissing' | 'photoTooSmall' | 'photoLicense' | 'photoDownload';

export class PhotoRejected extends Error {
  constructor(readonly code: PhotoErrorCode) {
    super(code);
  }
}

export interface CommonsInfo {
  title: string;
  width: number;
  height: number;
  sha1: string;
  downloadUrl: string;
  license: string | null;
  licenseUrl: string | null;
  artist: string;
}

export function licenseFamily(license: string | null): string {
  const name = (license ?? '').toLowerCase();
  if (!name) return 'none';
  if (name.includes('public domain') || name.includes('domaine public') || name.startsWith('pd')) return 'public_domain';
  if (name.includes('cc0')) return 'cc0';
  if (name.includes('by-sa')) return 'cc_by_sa';
  if (name.startsWith('cc by') || name.includes('cc-by')) return 'cc_by';
  if (name.includes('gfdl') || name.includes('gnu')) return 'gfdl';
  if (name.includes('art libre') || name.includes('free art')) return 'free_art';
  return 'other';
}

/** Why a photo can't go on a card, or null. */
export function photoProblem(info: CommonsInfo | null): PhotoErrorCode | null {
  if (!info?.width || !info.sha1) return 'photoMissing';
  if (Math.max(info.width, info.height) < MIN_LONG_SIDE) return 'photoTooSmall';
  if (['gfdl', 'none'].includes(licenseFamily(info.license))) return 'photoLicense';
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function stripHtml(html: string | undefined): string {
  return (html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
      return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simplifies the author lines Commons generates; null when unknown. */
export function cleanAuthor(text: string): string | null {
  const author = text
    .replace(/No machine-readable author provided\. (.+?) assumed \(based on copyright claims\)\.?/, '$1')
    .replace(/(Unknown author)+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,]+|[\s.,]+$/g, '');
  return author || null;
}

function userAgent(): string {
  // Wikimedia asks for a contact: the site's address will do
  return process.env.WIKIMEDIA_USER_AGENT || `PatrimoineDeFrance/1.0 (${requireEnv('APP_URL')})`;
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent() }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new PhotoRejected('photoDownload');
  return response;
}

export async function fetchCommonsInfo(file: string): Promise<CommonsInfo | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    titles: `File:${file}`,
    prop: 'imageinfo',
    iiprop: 'size|sha1|url|extmetadata',
    iiurlwidth: String(DOWNLOAD_WIDTH),
    iiextmetadatafilter: 'LicenseShortName|Artist|LicenseUrl',
  });
  const json = await (await get(`${API}?${params}`)).json();
  const page = json?.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info) return null;
  const meta = info.extmetadata ?? {};
  return {
    title: String(page.title).replace(/^File:/, ''),
    width: info.width,
    height: info.height,
    sha1: info.sha1,
    downloadUrl: info.thumburl ?? info.url,
    license: meta.LicenseShortName?.value ?? null,
    licenseUrl: meta.LicenseUrl?.value ?? null,
    artist: stripHtml(meta.Artist?.value),
  };
}

/** The 400 and 800 px wide WebP versions; throws on a file sharp can't read (a PDF, a video…). */
async function toWebp(data: Buffer): Promise<[number, Buffer][]> {
  return Promise.all(
    WIDTHS.map(async (width): Promise<[number, Buffer]> => [
      width,
      await sharp(data).rotate().resize({ width }).webp({ quality: WEBP_QUALITY }).toBuffer(),
    ]),
  );
}

/** Saves them under the photo's SHA-1, so that a new photo gets new file names. */
async function writeImages(files: [number, Buffer][], image: string, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [width, webp] of files) {
    const target = path.join(/*turbopackIgnore: true*/ dir, `${image}-${width}.webp`);
    await writeFile(`${target}.part`, webp);
    await rename(`${target}.part`, target);
  }
}

/** Checks a Commons file against the photo rules and saves it to uploads. */
export async function importCommonsPhoto(file: string, dir: string = CARD_IMAGES_DIR): Promise<NewPhoto> {
  const name = file.trim().replace(/^(file|fichier):/i, '').replaceAll('_', ' ');
  const info = name ? await fetchCommonsInfo(name) : null;
  const problem = photoProblem(info);
  if (problem) throw new PhotoRejected(problem);
  const image = info!.sha1.slice(0, 20);
  // The address comes from the API's answer: only ever download from Wikimedia
  if (!/^https:\/\/([a-z0-9-]+\.)*wikimedia\.org\//.test(info!.downloadUrl)) throw new PhotoRejected('photoDownload');
  const data = Buffer.from(await (await get(info!.downloadUrl)).arrayBuffer());
  const files = await toWebp(data).catch(() => {
    throw new PhotoRejected('photoDownload');
  });
  await writeImages(files, image, dir);
  return {
    image,
    commonsFile: info!.title,
    width: info!.width,
    height: info!.height,
    author: cleanAuthor(info!.artist),
    license: info!.license,
    licenseUrl: info!.licenseUrl,
  };
}
