// Pure decision functions for key/account management.
// Zero IO, zero chrome dependency — fully testable.

import { privateKeyToAccount, mnemonicToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { EncryptedData } from './crypto';

// --- Types (shared with key-manager.ts IO layer) ---

export interface StoredAccount {
  id: string;
  label: string;
  encrypted: EncryptedData;
  address: string;
  createdAt: number;
}

export interface AccountInfo {
  id: string;
  label: string;
  address: string;
}

export interface SessionData {
  masterPassword: string;
  activeAccountId: string;
  lastActivity: number;
}

// --- Pure functions ---

/**
 * Convert a decrypted plaintext (private key or mnemonic) into a viem account.
 * Private keys start with "0x"; everything else is treated as a mnemonic.
 */
export function decryptToAccount(plaintext: string): PrivateKeyAccount {
  if (plaintext.startsWith('0x')) {
    return privateKeyToAccount(plaintext as `0x${string}`);
  }
  return mnemonicToAccount(plaintext) as unknown as PrivateKeyAccount;
}

/**
 * Determine whether the auto-lock timeout has elapsed.
 * Returns true if the wallet should be locked.
 */
export function shouldAutoLock(lastActivity: number, autoLockMs: number, now: number = Date.now()): boolean {
  if (autoLockMs <= 0) return false; // 0 = never lock
  return (now - lastActivity) >= autoLockMs;
}

/** Convert auto-lock setting (minutes) to milliseconds. 0 = never lock. */
export function autoLockMsFromMinutes(minutes: number): number {
  if (minutes === 0) return 0;
  return minutes * 60 * 1000;
}

/**
 * Pick the active account from a stored accounts list.
 * Falls back to the first account if the saved ID is not found.
 */
export function resolveActiveAccount(
  accounts: StoredAccount[],
  savedActiveId: string | null,
): StoredAccount | undefined {
  if (accounts.length === 0) return undefined;
  if (savedActiveId) {
    const found = accounts.find((a) => a.id === savedActiveId);
    if (found) return found;
  }
  return accounts[0];
}

/** Generate the next default label based on how many accounts exist. */
export function nextAccountLabel(existingCount: number): string {
  return `Account ${existingCount + 1}`;
}

/** Extract public AccountInfo from a StoredAccount. */
export function toAccountInfo(stored: StoredAccount): AccountInfo {
  return { id: stored.id, label: stored.label, address: stored.address };
}
