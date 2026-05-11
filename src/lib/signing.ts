import { isHex, toHex } from 'viem';
import { validateSigner } from './rpc-validation';

export interface PersonalSignPayload {
  message: string;
  messageHex: `0x${string}`;
  signer: string | undefined;
}

export interface PersonalSignAccount {
  signMessage(args: { message: { raw: `0x${string}` } }): Promise<`0x${string}`>;
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

export function preparePersonalSignParams(params: unknown[], signerAddress: string): PersonalSignPayload {
  const payload = parsePersonalSignParams(params);
  validateSigner(payload.signer, signerAddress);
  return payload;
}

export async function signPersonalMessage(
  params: unknown[],
  signerAddress: string,
  account: PersonalSignAccount,
): Promise<`0x${string}`> {
  const { messageHex } = preparePersonalSignParams(params, signerAddress);
  return signPreparedPersonalMessage(messageHex, account);
}

export async function signPreparedPersonalMessage(
  messageHex: `0x${string}`,
  account: PersonalSignAccount,
): Promise<`0x${string}`> {
  return account.signMessage({ message: { raw: messageHex } });
}
