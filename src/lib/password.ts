import { hash, verify } from '@node-rs/argon2';

// argon2id (the library's default algorithm) with the OWASP minimum settings:
// 19 MiB of memory, 2 iterations, 1 lane.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword({ hash: digest, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(digest, password);
  } catch {
    // Not an argon2 hash.
    return false;
  }
}
