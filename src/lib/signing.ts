import { isHex, toHex } from 'viem';

export interface PersonalSignPayload {
  message: string;
  messageHex: `0x${string}`;
  signer: string | undefined;
}

/**
 * `personal_sign` signs arbitrary bytes. Dapps normally pass those bytes as a
 * 0x-prefixed hex string, but some pass plain text. Normalize both forms to the
 * byte hex that software and Ledger signers expect.
 */
export function parsePersonalSignParams(params: unknown[]): PersonalSignPayload {
  const message = params[0];
  if (typeof message !== 'string') {
    throw new Error('personal_sign requires a string message');
  }

  return {
    message,
    messageHex: isHex(message) ? message : toHex(message),
    signer: typeof params[1] === 'string' ? params[1] : undefined,
  };
}
