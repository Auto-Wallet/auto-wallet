// Pure validation functions for RPC requests.
// Zero IO — fully testable with plain data.

import { hexToBigInt } from 'viem';

// --- Signer validation ---

/**
 * Validate that tx.from matches the active account address.
 * Throws if they don't match. No-op if from is undefined.
 */
export function validateSigner(txFrom: string | undefined, accountAddress: string): void {
  if (txFrom && txFrom.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error(`Requested signer ${txFrom} does not match active account ${accountAddress}`);
  }
}

// --- RPC URL validation ---

export interface UrlValidation {
  valid: boolean;
  reason?: string;
}

/** Validate that an RPC URL uses HTTPS (or localhost for dev). */
export function validateRpcUrl(url: string | undefined): UrlValidation {
  if (!url) return { valid: false, reason: 'No RPC URL provided' };
  if (url.startsWith('https://') || url.startsWith('http://localhost')) {
    return { valid: true };
  }
  return { valid: false, reason: 'Only HTTPS RPC URLs are allowed' };
}

// --- AddEthereumChain parameter parsing ---

export interface ParsedAddChainParams {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  symbol: string;
  decimals: number;
  blockExplorerUrl?: string;
}

/** Parse and normalize wallet_addEthereumChain params. */
export function parseAddChainParams(params: unknown[]): ParsedAddChainParams {
  const p = params[0] as {
    chainId: string;
    chainName: string;
    rpcUrls?: string[];
    nativeCurrency?: { name: string; symbol: string; decimals: number };
    blockExplorerUrls?: string[];
  };
  return {
    chainId: parseInt(p.chainId, 16),
    chainName: p.chainName,
    rpcUrl: p.rpcUrls?.[0] ?? '',
    symbol: p.nativeCurrency?.symbol ?? '',
    decimals: p.nativeCurrency?.decimals ?? 18,
    blockExplorerUrl: p.blockExplorerUrls?.[0],
  };
}

// --- Transaction parameter parsing ---

export interface ParsedTxParams {
  to: string | null;
  value: string;            // hex string
  valueBigInt: bigint;      // wei
  gasLimit: string | null;  // hex string or null
  gasLimitBigInt: bigint | null;
  data: string | null;
  from: string | null;
  methodSelector: string | undefined; // first 4 bytes of data
}

/** Parse raw tx params into a typed structure. */
export function parseTxParams(tx: Record<string, string>): ParsedTxParams {
  const value = tx.value ?? '0x0';
  const gasLimit = tx.gas ?? tx.gasLimit ?? null;

  return {
    to: tx.to ?? null,
    value,
    valueBigInt: hexToBigInt(value as `0x${string}`),
    gasLimit,
    gasLimitBigInt: gasLimit ? hexToBigInt(gasLimit as `0x${string}`) : null,
    data: tx.data ?? null,
    from: tx.from ?? null,
    methodSelector: tx.data?.slice(0, 10) ?? undefined,
  };
}
