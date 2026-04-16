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

// --- In-memory state (rebuilt from session storage on SW wake) ---

let unlockedAccounts: Map<string, PrivateKeyAccount> = new Map();
let activeAccountId: string | null = null;
let masterPassword: string | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivity: number = Date.now();

// --- Session persistence (survives SW restarts, cleared on browser close) ---

const SESSION_KEY = 'aw_session';

interface SessionData {
  masterPassword: string;
  activeAccountId: string;
  lastActivity: number;
}

async function saveSession(): Promise<void> {
  if (!masterPassword || !activeAccountId) return;
  lastActivity = Date.now();
  const data: SessionData = { masterPassword, activeAccountId, lastActivity };
  await chrome.storage.session.set({ [SESSION_KEY]: data });
}

async function loadSession(): Promise<SessionData | null> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return (result[SESSION_KEY] as SessionData) ?? null;
}

async function clearSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}

/** Restore unlock state from session storage after SW restart. */
async function restoreFromSession(): Promise<boolean> {
  if (masterPassword && activeAccountId) return true; // already unlocked

  const session = await loadSession();
  if (!session) return false;

  // Check if auto-lock timeout has passed
  const autoLockMs = await getAutoLockMs();
  if (autoLockMs > 0) {
    const elapsed = Date.now() - session.lastActivity;
    if (elapsed >= autoLockMs) {
      await clearSession();
      return false;
    }
  }

  // Re-decrypt the active account
  const accounts = await getStoredAccounts();
  const target = accounts.find((a) => a.id === session.activeAccountId);
  if (!target) {
    await clearSession();
    return false;
  }

  try {
    const plaintext = await decrypt(target.encrypted, session.masterPassword);
    const account = decryptToAccount(plaintext);
    masterPassword = session.masterPassword;
    activeAccountId = session.activeAccountId;
    unlockedAccounts.set(target.id, account);
    resetLockTimer();
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

// --- Auto-lock ---

async function getAutoLockMs(): Promise<number> {
  const settings = await getItem<WalletSettings>(STORAGE_KEYS.SETTINGS);
  const minutes = settings?.autoLockMinutes ?? DEFAULT_SETTINGS.autoLockMinutes;
  if (minutes === 0) return 0; // never lock
  return minutes * 60 * 1000;
}

function resetLockTimer() {
  if (lockTimer) clearTimeout(lockTimer);
  // Update session activity timestamp
  saveSession();
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

export async function isUnlocked(): Promise<boolean> {
  if (activeAccountId !== null && unlockedAccounts.size > 0) return true;
  // Try to restore from session (SW might have restarted)
  return restoreFromSession();
}

export async function getAccount(): Promise<PrivateKeyAccount> {
  // Try restore from session if SW just restarted
  if (!activeAccountId || unlockedAccounts.size === 0) {
    await restoreFromSession();
  }
  if (!activeAccountId) throw new Error('Wallet is locked');
  const account = unlockedAccounts.get(activeAccountId);
  if (!account) throw new Error('Active account not found in memory');
  resetLockTimer();
  return account;
}

export async function getAddress(): Promise<string> {
  const account = await getAccount();
  return account.address;
}

export async function getActiveAccountId(): Promise<string> {
  if (!activeAccountId) await restoreFromSession();
  if (!activeAccountId) throw new Error('Wallet is locked');
  return activeAccountId;
}

export async function listAccounts(): Promise<AccountInfo[]> {
  const stored = await getStoredAccounts();
  return stored.map((a) => ({ id: a.id, label: a.label, address: a.address }));
}

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

export async function createWallet(password: string, label?: string): Promise<string> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), password);
}

export async function importPrivateKey(privateKey: `0x${string}`, password: string, label?: string): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), password);
}

export async function importMnemonic(mnemonic: string, password: string, label?: string): Promise<string> {
  const account = mnemonicToAccount(mnemonic);
  return appendAndActivate(mnemonic, account as unknown as PrivateKeyAccount, label ?? await nextLabel(), password);
}

// ===== Add account (reuses master password) =====

export async function addAccountGenerate(label?: string): Promise<string> {
  const pw = getMasterPassword();
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), pw);
}

export async function addAccountPrivateKey(privateKey: `0x${string}`, label?: string): Promise<string> {
  const pw = getMasterPassword();
  const account = privateKeyToAccount(privateKey);
  return appendAndActivate(privateKey, account, label ?? await nextLabel(), pw);
}

export async function addAccountMnemonic(mnemonic: string, label?: string): Promise<string> {
  const pw = getMasterPassword();
  const account = mnemonicToAccount(mnemonic);
  return appendAndActivate(mnemonic, account as unknown as PrivateKeyAccount, label ?? await nextLabel(), pw);
}

// ===== Unlock / Lock =====

export async function unlock(password: string): Promise<string> {
  const accounts = await getStoredAccounts();
  if (accounts.length === 0) {
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

export async function lock(): Promise<void> {
  unlockedAccounts.clear();
  activeAccountId = null;
  masterPassword = null;
  if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
  await clearSession();
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
    await saveSession();
  }
}

export async function deleteWallet(): Promise<void> {
  await lock();
  await removeItem(STORAGE_KEYS.ACCOUNTS);
  await removeItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID);
  await removeItem(STORAGE_KEYS.ENCRYPTED_KEY);
}

export async function exportPrivateKey(accountId: string, password: string): Promise<string> {
  const accounts = await getStoredAccounts();
  const target = accounts.find((a) => a.id === accountId);
  if (!target) throw new Error('Account not found');
  const plaintext = await decrypt(target.encrypted, password);
  if (!plaintext.startsWith('0x')) {
    return plaintext;
  }
  return plaintext;
}
