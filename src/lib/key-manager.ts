import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts';
import { mnemonicToAccount } from 'viem/accounts';
import { encrypt, decrypt, type EncryptedData } from './crypto';
import { getItem, setItem, removeItem, STORAGE_KEYS } from './storage';
import { type WalletSettings, DEFAULT_SETTINGS } from '../types/settings';

// --- Types ---

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

// --- In-memory state ---

let unlockedAccounts: Map<string, PrivateKeyAccount> = new Map();
let activeAccountId: string | null = null;
let masterPassword: string | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;

async function getAutoLockMs(): Promise<number> {
  const settings = await getItem<WalletSettings>(STORAGE_KEYS.SETTINGS);
  const minutes = settings?.autoLockMinutes ?? DEFAULT_SETTINGS.autoLockMinutes;
  if (minutes === 0) return 0; // never lock
  return minutes * 60 * 1000;
}

function resetLockTimer() {
  if (lockTimer) clearTimeout(lockTimer);
  getAutoLockMs().then((ms) => {
    if (ms > 0) lockTimer = setTimeout(lock, ms);
  });
}

// --- Internal ---

async function getStoredAccounts(): Promise<StoredAccount[]> {
  return (await getItem<StoredAccount[]>(STORAGE_KEYS.ACCOUNTS)) ?? [];
}

async function saveStoredAccounts(accounts: StoredAccount[]): Promise<void> {
  await setItem(STORAGE_KEYS.ACCOUNTS, accounts);
}

function decryptToAccount(plaintext: string): PrivateKeyAccount {
  if (plaintext.startsWith('0x')) {
    return privateKeyToAccount(plaintext as `0x${string}`);
  }
  return mnemonicToAccount(plaintext) as unknown as PrivateKeyAccount;
}

function getMasterPassword(): string {
  if (!masterPassword) throw new Error('Wallet is locked');
  return masterPassword;
}

async function appendAndActivate(
  secret: string,
  account: PrivateKeyAccount,
  label: string,
  pw: string,
): Promise<string> {
  const encrypted = await encrypt(secret, pw);
  const id = crypto.randomUUID();
  const stored: StoredAccount = {
    id, label, encrypted,
    address: account.address,
    createdAt: Date.now(),
  };
  const accounts = await getStoredAccounts();
  accounts.push(stored);
  await saveStoredAccounts(accounts);

  masterPassword = pw;
  unlockedAccounts.set(id, account);
  activeAccountId = id;
  await setItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID, id);
  resetLockTimer();
  return account.address;
}

async function nextLabel(): Promise<string> {
  return `Account ${(await getStoredAccounts()).length + 1}`;
}

// --- Public API ---

export function isUnlocked(): boolean {
  return activeAccountId !== null && unlockedAccounts.size > 0;
}

export function getAccount(): PrivateKeyAccount {
  if (!activeAccountId) throw new Error('Wallet is locked');
  const account = unlockedAccounts.get(activeAccountId);
  if (!account) throw new Error('Active account not found in memory');
  resetLockTimer();
  return account;
}

export function getAddress(): string { return getAccount().address; }

export function getActiveAccountId(): string {
  if (!activeAccountId) throw new Error('Wallet is locked');
  return activeAccountId;
}

/** List all accounts. Works even when locked. */
export async function listAccounts(): Promise<AccountInfo[]> {
  const stored = await getStoredAccounts();
  return stored.map((a) => ({ id: a.id, label: a.label, address: a.address }));
}

/** Switch active account. Decrypts on demand using master password. */
export async function switchAccount(accountId: string): Promise<string> {
  const pw = getMasterPassword();
  const stored = await getStoredAccounts();
  const target = stored.find((a) => a.id === accountId);
  if (!target) throw new Error('Account not found');

  if (!unlockedAccounts.has(accountId)) {
    const plaintext = await decrypt(target.encrypted, pw);
    unlockedAccounts.set(accountId, decryptToAccount(plaintext));
  }

  activeAccountId = accountId;
  await setItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID, accountId);
  resetLockTimer();
  return unlockedAccounts.get(accountId)!.address;
}

// ===== First-time setup (sets master password) =====

/** First wallet: generate key + set master password. */
export async function createWallet(password: string, label?: string): Promise<string> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), password);
}

/** First wallet: import private key + set master password. */
export async function importPrivateKey(privateKey: `0x${string}`, password: string, label?: string): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), password);
}

/** First wallet: import mnemonic + set master password. */
export async function importMnemonic(mnemonic: string, password: string, label?: string): Promise<string> {
  const account = mnemonicToAccount(mnemonic);
  return appendAndActivate(mnemonic, account as unknown as PrivateKeyAccount, label ?? await nextLabel(), password);
}

// ===== Add account (reuses master password already in memory) =====

/** Add account by generating a new key. Must be unlocked. */
export async function addAccountGenerate(label?: string): Promise<string> {
  const pw = getMasterPassword();
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), pw);
}

/** Add account by importing private key. Must be unlocked. */
export async function addAccountPrivateKey(privateKey: `0x${string}`, label?: string): Promise<string> {
  const pw = getMasterPassword();
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), pw);
}

/** Add account by importing mnemonic. Must be unlocked. */
export async function addAccountMnemonic(mnemonic: string, label?: string): Promise<string> {
  const pw = getMasterPassword();
  const account = mnemonicToAccount(mnemonic);
  return appendAndActivate(mnemonic, account as unknown as PrivateKeyAccount, label ?? await nextLabel(), pw);
}

// ===== Unlock / Lock =====

export async function unlock(password: string): Promise<string> {
  const accounts = await getStoredAccounts();
  if (accounts.length === 0) {
    // Legacy migration
    const legacy = await getItem<EncryptedData>(STORAGE_KEYS.ENCRYPTED_KEY);
    if (!legacy) throw new Error('No wallet found. Please create or import one.');
    const plaintext = await decrypt(legacy, password);
    const account = decryptToAccount(plaintext);
    const id = crypto.randomUUID();
    const stored: StoredAccount = {
      id, label: 'Account 1', encrypted: legacy,
      address: account.address, createdAt: Date.now(),
    };
    await saveStoredAccounts([stored]);
    await removeItem(STORAGE_KEYS.ENCRYPTED_KEY);
    masterPassword = password;
    unlockedAccounts.set(id, account);
    activeAccountId = id;
    await setItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID, id);
    resetLockTimer();
    return account.address;
  }

  const savedActiveId = await getItem<string>(STORAGE_KEYS.ACTIVE_ACCOUNT_ID);
  const targetAccount = accounts.find((a) => a.id === savedActiveId) ?? accounts[0];

  const plaintext = await decrypt(targetAccount.encrypted, password);
  const viemAccount = decryptToAccount(plaintext);

  masterPassword = password;
  unlockedAccounts.clear();
  unlockedAccounts.set(targetAccount.id, viemAccount);
  activeAccountId = targetAccount.id;
  await setItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID, targetAccount.id);
  resetLockTimer();
  return viemAccount.address;
}

export function lock(): void {
  unlockedAccounts.clear();
  activeAccountId = null;
  masterPassword = null;
  if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
}

export async function hasWallet(): Promise<boolean> {
  const accounts = await getStoredAccounts();
  if (accounts.length > 0) return true;
  const legacy = await getItem<EncryptedData>(STORAGE_KEYS.ENCRYPTED_KEY);
  return legacy !== null;
}

export async function renameAccount(accountId: string, newLabel: string): Promise<void> {
  const accounts = await getStoredAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx < 0) throw new Error('Account not found');
  accounts[idx].label = newLabel;
  await saveStoredAccounts(accounts);
}

export async function removeAccount(accountId: string): Promise<void> {
  const accounts = await getStoredAccounts();
  if (accounts.length <= 1) throw new Error('Cannot remove the last account');
  const filtered = accounts.filter((a) => a.id !== accountId);
  await saveStoredAccounts(filtered);
  unlockedAccounts.delete(accountId);

  if (activeAccountId === accountId) {
    activeAccountId = filtered[0].id;
    await setItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID, activeAccountId);
    if (masterPassword) {
      const plaintext = await decrypt(filtered[0].encrypted, masterPassword);
      unlockedAccounts.set(filtered[0].id, decryptToAccount(plaintext));
    }
  }
}

export async function deleteWallet(): Promise<void> {
  lock();
  await removeItem(STORAGE_KEYS.ACCOUNTS);
  await removeItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID);
  await removeItem(STORAGE_KEYS.ENCRYPTED_KEY);
}

/** Export raw private key for an account. Requires password verification. */
export async function exportPrivateKey(accountId: string, password: string): Promise<string> {
  const accounts = await getStoredAccounts();
  const target = accounts.find((a) => a.id === accountId);
  if (!target) throw new Error('Account not found');
  // Decrypt with provided password — this also verifies the password
  const plaintext = await decrypt(target.encrypted, password);
  // If stored as mnemonic, derive the private key hex
  if (!plaintext.startsWith('0x')) {
    const account = mnemonicToAccount(plaintext);
    // viem doesn't directly expose the private key from mnemonicToAccount,
    // so we return the mnemonic itself (it IS the secret)
    return plaintext;
  }
  return plaintext;
}
