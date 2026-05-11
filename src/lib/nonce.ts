export function parseNextNonceFromError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(/next nonce\s+(\d+)/i);
  if (!match?.[1]) return null;
  const nonce = Number(match[1]);
  return Number.isSafeInteger(nonce) && nonce >= 0 ? nonce : null;
}

export async function retryWithNextNonce<T>(
  fn: (nonceOverride: number | null) => Promise<T>,
): Promise<T> {
  let nonceOverride: number | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn(nonceOverride);
    } catch (error) {
      const nextNonce = parseNextNonceFromError(error);
      if (nextNonce !== null && nextNonce !== nonceOverride) {
        nonceOverride = nextNonce;
        continue;
      }

      throw error;
    }
  }

  return fn(nonceOverride);
}
