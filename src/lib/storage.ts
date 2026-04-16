// Thin wrapper over chrome.storage.local for typed access

const storage = chrome.storage.local;

export async function getItem<T>(key: string): Promise<T | null> {
  const result = await storage.get(key);
  return (result[key] as T) ?? null;
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  await storage.set({ [key]: value });
}

export async function removeItem(key: string): Promise<void> {
  await storage.remove(key);
}

// Storage keys
export const STORAGE_KEYS = {
  ACCOUNTS: 'accounts',            // StoredAccount[]
  ACTIVE_ACCOUNT_ID: 'active_account_id',
  ENCRYPTED_KEY: 'encrypted_private_key', // legacy single-key (migration)
  NETWORKS: 'networks',
  ACTIVE_CHAIN_ID: 'active_chain_id',
  WHITELIST_RULES: 'whitelist_rules',
  TOKENS: 'tokens',
  TX_LOG: 'tx_log',
  SETTINGS: 'settings',
} as const;
