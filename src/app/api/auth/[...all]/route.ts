import { getAuth } from '@/lib/auth';

// Better Auth's endpoints (/api/auth/sign-in/email, /api/auth/verify-email…).
export const GET = (request: Request) => getAuth().handler(request);
export const POST = (request: Request) => getAuth().handler(request);
