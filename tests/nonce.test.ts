import { describe, expect, test } from 'bun:test';
import { parseNextNonceFromError, retryWithNextNonce } from '../src/lib/nonce';

describe('nonce retry helpers', () => {
  test('parses next nonce from viem nonce-too-low errors', () => {
    const error = new Error(
      'Nonce provided for the transaction (142) is lower than the current nonce of the account. ' +
      'Details: nonce too low: next nonce 144, tx nonce 142',
    );

    expect(parseNextNonceFromError(error)).toBe(144);
  });

  test('retries once with the next nonce', async () => {
    const seen: Array<number | null> = [];
    const result = await retryWithNextNonce(async (nonce) => {
      seen.push(nonce);
      if (nonce === null) throw new Error('nonce too low: next nonce 144, tx nonce 142');
      return `sent:${nonce}`;
    });

    expect(result).toBe('sent:144');
    expect(seen).toEqual([null, 144]);
  });

});
