// Ledger hardware wallet client. Runs only in UI contexts (popup, confirm
// window) — WebHID is unavailable in MV3 service workers. The background
// asks the UI to perform any signing operation that needs a Ledger device.

import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import Eth from '@ledgerhq/hw-app-eth';
import { getAddress as toChecksum } from 'viem';

export type LedgerPathStandard = 'live' | 'legacy';

export const LEDGER_PATH_LABELS: Record<LedgerPathStandard, string> = {
  live: "Ledger Live (m/44'/60'/x'/0/0)",
  legacy: "Legacy (m/44'/60'/0'/x)",
};

/** Generate a derivation path for the given standard and 0-based index. */
export function ledgerPath(standard: LedgerPathStandard, index: number): string {
  if (standard === 'live') return `44'/60'/${index}'/0/0`;
  return `44'/60'/0'/${index}`;
}

/** Build a contiguous list of derivation paths for paged address scanning. */
export function pathBatch(standard: LedgerPathStandard, startIndex: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => ledgerPath(standard, startIndex + i));
}

export interface LedgerAddressEntry {
  derivationPath: string;
  address: string;
}

let activeTransport: Awaited<ReturnType<typeof TransportWebHID.create>> | null = null;

/** Open (or reuse) a transport. Returns the underlying Eth app handle. */
async function openEth(): Promise<{ eth: Eth; close: () => Promise<void> }> {
  if (!activeTransport) {
    activeTransport = await TransportWebHID.create();
  }
  const eth = new Eth(activeTransport);
  const close = async () => {
    if (activeTransport) {
      try { await activeTransport.close(); } catch { /* ignore */ }
      activeTransport = null;
    }
  };
  return { eth, close };
}

/** Re-throw with friendlier messages for common Ledger error states. */
function rethrowFriendly(err: unknown): never {
  const e = err as any;
  const msg = String(e?.message ?? e ?? '');
  // Ethereum app not open
  if (msg.includes('0x6e00') || msg.includes('0x6700') || msg.toLowerCase().includes('app does not seem to be open')) {
    throw new Error('Open the Ethereum app on your Ledger and try again');
  }
  // User rejected on device
  if (msg.includes('0x6985')) {
    throw new Error('Rejected on Ledger device');
  }
  // Locked / no device
  if (msg.toLowerCase().includes('no device selected') || msg.toLowerCase().includes('user gesture')) {
    throw new Error('Please connect and unlock your Ledger, then click again');
  }
  if (msg.toLowerCase().includes('access denied') || msg.toLowerCase().includes('cannot read properties')) {
    throw new Error('Could not communicate with Ledger. Unlock it and open the Ethereum app.');
  }
  throw e instanceof Error ? e : new Error(msg);
}

/** Prompt the user to pick a Ledger device (must be triggered by a user gesture). */
export async function requestLedgerDevice(): Promise<void> {
  try {
    // Force a fresh connection so the OS prompt appears if the device hasn't been authorized yet.
    if (activeTransport) {
      try { await activeTransport.close(); } catch { /* ignore */ }
      activeTransport = null;
    }
    activeTransport = await TransportWebHID.create();
  } catch (err) {
    rethrowFriendly(err);
  }
}

export async function disconnectLedger(): Promise<void> {
  if (activeTransport) {
    try { await activeTransport.close(); } catch { /* ignore */ }
    activeTransport = null;
  }
}

/** Fetch addresses for the given derivation paths (no on-device confirmation). */
export async function fetchAddresses(paths: string[]): Promise<LedgerAddressEntry[]> {
  const { eth } = await openEth();
  const out: LedgerAddressEntry[] = [];
  try {
    for (const p of paths) {
      const result = await eth.getAddress(p, false, false);
      out.push({ derivationPath: p, address: toChecksum(result.address as `0x${string}`) });
    }
  } catch (err) {
    rethrowFriendly(err);
  }
  return out;
}

/** Sign an Ethereum transaction. `rawTxHex` is the unsigned RLP/typed-tx payload (no 0x prefix). */
export async function signTransaction(
  derivationPath: string,
  rawTxHex: string,
): Promise<{ r: `0x${string}`; s: `0x${string}`; v: number }> {
  const { eth } = await openEth();
  const hex = rawTxHex.startsWith('0x') ? rawTxHex.slice(2) : rawTxHex;
  try {
    // 3rd arg is the optional resolution (clear-signing). Pass null — fall back to blind signing.
    const sig = await eth.signTransaction(derivationPath, hex, null);
    return {
      r: `0x${sig.r}` as `0x${string}`,
      s: `0x${sig.s}` as `0x${string}`,
      v: parseInt(sig.v, 16),
    };
  } catch (err) {
    rethrowFriendly(err);
  }
}

/** Sign a personal_sign message. Pass the raw message bytes as a hex string (with or without 0x). */
export async function signPersonalMessage(
  derivationPath: string,
  messageHex: string,
): Promise<`0x${string}`> {
  const { eth } = await openEth();
  const hex = messageHex.startsWith('0x') ? messageHex.slice(2) : messageHex;
  try {
    const sig = await eth.signPersonalMessage(derivationPath, hex);
    // Ethereum personal_sign returns v in {27, 28}
    const v = sig.v.toString(16).padStart(2, '0');
    return `0x${sig.r}${sig.s}${v}` as `0x${string}`;
  } catch (err) {
    rethrowFriendly(err);
  }
}

/** Sign EIP-712 typed data using its 32-byte hashes (compatible with all Eth-app versions). */
export async function signTypedDataHashed(
  derivationPath: string,
  domainSeparatorHex: string,
  hashStructMessageHex: string,
): Promise<`0x${string}`> {
  const { eth } = await openEth();
  const dHex = domainSeparatorHex.startsWith('0x') ? domainSeparatorHex.slice(2) : domainSeparatorHex;
  const mHex = hashStructMessageHex.startsWith('0x') ? hashStructMessageHex.slice(2) : hashStructMessageHex;
  try {
    const sig = await eth.signEIP712HashedMessage(derivationPath, dHex, mHex);
    const v = sig.v.toString(16).padStart(2, '0');
    return `0x${sig.r}${sig.s}${v}` as `0x${string}`;
  } catch (err) {
    rethrowFriendly(err);
  }
}
