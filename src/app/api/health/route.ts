import { pool } from '@/db';

// Polled by the worldup-web Docker healthcheck. Traefik only routes to the
// container while this returns 200, so it must fail when the database does.
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await pool.query('select 1');
    return Response.json({ status: 'ok' }, { headers });
  } catch (error) {
    console.error('Health check failed:', error instanceof Error ? error.message : error);
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
