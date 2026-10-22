import { connection } from 'next/server';
import { assetLinks } from '@/lib/android-app';

// Digital Asset Links, read by Android and Chrome to trust the Android app.
export async function GET() {
  // Rendered at request time, so the server's .env values show
  await connection();
  return Response.json(assetLinks(process.env));
}
