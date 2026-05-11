import { describe, expect, test } from 'bun:test';
import { recoverMessageAddress, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  parsePersonalSignParams,
  preparePersonalSignParams,
  signPersonalMessage,
} from '../src/lib/signing';

describe('parsePersonalSignParams', () => {
  test('normalizes plain text messages to UTF-8 hex bytes', () => {
    const payload = parsePersonalSignParams([
      'Access limit-cover',
      '0x2fb4D46372Ea1748ec3c29Bd2C7B536019DF5200',
    ]);

    expect(payload).toEqual({
      message: 'Access limit-cover',
      messageHex: toHex('Access limit-cover'),
      signer: '0x2fb4D46372Ea1748ec3c29Bd2C7B536019DF5200',
    });
  });

  test('keeps hex messages as raw bytes', () => {
    const messageHex = toHex('Access limit-cover');
    const payload = parsePersonalSignParams([messageHex, undefined]);

    expect(payload.messageHex).toBe(messageHex);
    expect(payload.signer).toBeUndefined();
  });

  test('signing normalized plain text recovers the signer address', async () => {
    const account = privateKeyToAccount(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
    const { messageHex } = parsePersonalSignParams(['Access limit-cover', account.address]);

    const signature = await account.signMessage({ message: { raw: messageHex } });
    const recovered = await recoverMessageAddress({
      message: 'Access limit-cover',
      signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  test('handler signing path signs plain text RPC params recoverable as text', async () => {
    const account = privateKeyToAccount(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );

    const signature = await signPersonalMessage(
      ['Access limit-cover', account.address],
      account.address,
      account,
    );
    const recovered = await recoverMessageAddress({
      message: 'Access limit-cover',
      signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  test('handler signing path signs hex RPC params as raw bytes', async () => {
    const account = privateKeyToAccount(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
    const messageHex = toHex('Access limit-cover');

    const signature = await signPersonalMessage(
      [messageHex, account.address],
      account.address,
      account,
    );
    const recovered = await recoverMessageAddress({
      message: { raw: messageHex },
      signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  test('handler signing path rejects mismatched requested signer', async () => {
    const account = privateKeyToAccount(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );

    await expect(signPersonalMessage(
      ['Access limit-cover', '0x0000000000000000000000000000000000000001'],
      account.address,
      account,
    )).rejects.toThrow('does not match');
  });

  test('preparePersonalSignParams validates signer before signing', () => {
    const account = privateKeyToAccount(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );

    expect(() => preparePersonalSignParams(
      ['Access limit-cover', '0x0000000000000000000000000000000000000001'],
      account.address,
    )).toThrow('does not match');
  });
});
