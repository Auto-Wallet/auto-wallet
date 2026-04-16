import { test, expect, describe } from 'bun:test';
import {
  decryptToAccount,
  shouldAutoLock,
  autoLockMsFromMinutes,
  resolveActiveAccount,
  nextAccountLabel,
  toAccountInfo,
  type StoredAccount,
} from '../src/lib/key-manager.core';
import { generatePrivateKey } from 'viem/accounts';
import type { EncryptedData } from '../src/lib/crypto';

// --- Helpers ---

const dummyEncrypted: EncryptedData = {
  ciphertext: 'test',
  iv: 'test',
  salt: 'test',
};

function makeAccount(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id: 'acc-1',
    label: 'Account 1',
    encrypted: dummyEncrypted,
    address: '0x1111111111111111111111111111111111111111',
    createdAt: Date.now(),
    ...overrides,
  };
}

// =============================================================
// decryptToAccount
// =============================================================

describe('decryptToAccount', () => {
  test('private key (0x prefix) produces a valid account', () => {
    const pk = generatePrivateKey();
    const account = decryptToAccount(pk);
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(account.signMessage).toBeDefined();
  });

  test('two different private keys produce different addresses', () => {
    const pk1 = generatePrivateKey();
    const pk2 = generatePrivateKey();
    const addr1 = decryptToAccount(pk1).address;
    const addr2 = decryptToAccount(pk2).address;
    expect(addr1).not.toBe(addr2);
  });

  test('same private key always produces the same address', () => {
    const pk = generatePrivateKey();
    const addr1 = decryptToAccount(pk).address;
    const addr2 = decryptToAccount(pk).address;
    expect(addr1).toBe(addr2);
  });

  test('mnemonic (no 0x prefix) produces a valid account', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const account = decryptToAccount(mnemonic);
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Known first address for this mnemonic
    expect(account.address.toLowerCase()).toBe('0x9858effd232b4033e47d90003d41ec34ecaeda94');
  });

  test('invalid private key throws', () => {
    expect(() => decryptToAccount('0xinvalid')).toThrow();
  });
});

// =============================================================
// shouldAutoLock
// =============================================================

describe('shouldAutoLock', () => {
  test('within timeout → false', () => {
    const now = 1000000;
    const lastActivity = now - 60000; // 1 minute ago
    const autoLockMs = 300000;        // 5 minutes
    expect(shouldAutoLock(lastActivity, autoLockMs, now)).toBe(false);
  });

  test('past timeout → true', () => {
    const now = 1000000;
    const lastActivity = now - 600000; // 10 minutes ago
    const autoLockMs = 300000;          // 5 minutes
    expect(shouldAutoLock(lastActivity, autoLockMs, now)).toBe(true);
  });

  test('exactly at timeout boundary → true (>= check)', () => {
    const now = 1000000;
    const lastActivity = now - 300000; // exactly 5 minutes ago
    const autoLockMs = 300000;          // 5 minutes
    expect(shouldAutoLock(lastActivity, autoLockMs, now)).toBe(true);
  });

  test('autoLockMs = 0 (never lock) → always false', () => {
    const now = 1000000;
    expect(shouldAutoLock(0, 0, now)).toBe(false);
    expect(shouldAutoLock(now - 99999999, 0, now)).toBe(false);
  });

  test('negative autoLockMs → false (treated as never)', () => {
    expect(shouldAutoLock(0, -1, 1000000)).toBe(false);
  });
});

// =============================================================
// autoLockMsFromMinutes
// =============================================================

describe('autoLockMsFromMinutes', () => {
  test('0 minutes → 0 ms (never lock)', () => {
    expect(autoLockMsFromMinutes(0)).toBe(0);
  });

  test('5 minutes → 300000 ms', () => {
    expect(autoLockMsFromMinutes(5)).toBe(300000);
  });

  test('1440 minutes (24h) → 86400000 ms', () => {
    expect(autoLockMsFromMinutes(1440)).toBe(86400000);
  });

  test('1 minute → 60000 ms', () => {
    expect(autoLockMsFromMinutes(1)).toBe(60000);
  });
});

// =============================================================
// resolveActiveAccount
// =============================================================

describe('resolveActiveAccount', () => {
  const acc1 = makeAccount({ id: 'acc-1', label: 'Account 1' });
  const acc2 = makeAccount({ id: 'acc-2', label: 'Account 2' });
  const acc3 = makeAccount({ id: 'acc-3', label: 'Account 3' });

  test('finds account by saved ID', () => {
    const result = resolveActiveAccount([acc1, acc2, acc3], 'acc-2');
    expect(result!.id).toBe('acc-2');
  });

  test('falls back to first account if saved ID not found', () => {
    const result = resolveActiveAccount([acc1, acc2], 'non-existent');
    expect(result!.id).toBe('acc-1');
  });

  test('falls back to first account if saved ID is null', () => {
    const result = resolveActiveAccount([acc1, acc2], null);
    expect(result!.id).toBe('acc-1');
  });

  test('returns undefined for empty array', () => {
    const result = resolveActiveAccount([], 'acc-1');
    expect(result).toBeUndefined();
  });
});

// =============================================================
// nextAccountLabel
// =============================================================

describe('nextAccountLabel', () => {
  test('0 existing → "Account 1"', () => {
    expect(nextAccountLabel(0)).toBe('Account 1');
  });

  test('3 existing → "Account 4"', () => {
    expect(nextAccountLabel(3)).toBe('Account 4');
  });
});

// =============================================================
// toAccountInfo
// =============================================================

describe('toAccountInfo', () => {
  test('strips encrypted data, keeps id/label/address', () => {
    const stored = makeAccount({
      id: 'x',
      label: 'My Wallet',
      address: '0xABCD',
    });
    const info = toAccountInfo(stored);
    expect(info).toEqual({ id: 'x', label: 'My Wallet', address: '0xABCD' });
    expect((info as any).encrypted).toBeUndefined();
    expect((info as any).createdAt).toBeUndefined();
  });
});
