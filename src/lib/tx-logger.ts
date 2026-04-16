import { getItem, setItem, STORAGE_KEYS } from './storage';

export interface TxLogEntry {
  id: string;
  timestamp: number;
  chainId: number;
  from: string;
  to: string;
  value: string;       // wei decimal
  hash?: string;       // tx hash after broadcast
  method?: string;     // 4-byte selector
  origin: string;      // dApp origin
  autoSigned: boolean; // true = matched whitelist
  ruleId?: string;     // which whitelist rule matched
  status: 'pending' | 'confirmed' | 'failed';
}

const MAX_LOG_SIZE = 200;

export async function getLog(): Promise<TxLogEntry[]> {
  return (await getItem<TxLogEntry[]>(STORAGE_KEYS.TX_LOG)) ?? [];
}

export async function appendLog(entry: TxLogEntry): Promise<void> {
  const log = await getLog();
  log.unshift(entry); // newest first
  if (log.length > MAX_LOG_SIZE) log.length = MAX_LOG_SIZE;
  await setItem(STORAGE_KEYS.TX_LOG, log);
}

export async function updateLogEntry(id: string, patch: Partial<TxLogEntry>): Promise<void> {
  const log = await getLog();
  const idx = log.findIndex((e) => e.id === id);
  if (idx >= 0) {
    log[idx] = { ...log[idx], ...patch };
    await setItem(STORAGE_KEYS.TX_LOG, log);
  }
}

export async function clearLog(): Promise<void> {
  await setItem(STORAGE_KEYS.TX_LOG, []);
}
