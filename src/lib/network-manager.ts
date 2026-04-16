// IO shell: chrome.storage + viem client management.
// Pure decision logic lives in network-manager.core.ts.

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { type Network, DEFAULT_NETWORKS } from '../types/network';
import { getItem, setItem, STORAGE_KEYS } from './storage';
import {
  mergeNetworks,
  findNetwork,
  validateCustomNetwork,
  upsertCustomNetwork,
  removeFromList,
  buildViemChain,
} from './network-manager.core';

// Re-export core functions for backward compatibility
export { buildViemChain, findNetwork, mergeNetworks } from './network-manager.core';

let activeChainId: number = 1;
let clientCache: Map<number, PublicClient> = new Map();

// --- Helpers ---

function buildClient(network: Network): PublicClient {
  return createPublicClient({ transport: http(network.rpcUrl) });
}

// --- Public API ---

export async function getAllNetworks(): Promise<Network[]> {
  const custom = (await getItem<Network[]>(STORAGE_KEYS.NETWORKS)) ?? [];
  return mergeNetworks(DEFAULT_NETWORKS, custom);
}

export async function getActiveNetwork(): Promise<Network> {
  const stored = await getItem<number>(STORAGE_KEYS.ACTIVE_CHAIN_ID);
  if (stored !== null) activeChainId = stored;
  const networks = await getAllNetworks();
  return findNetwork(networks, activeChainId) ?? DEFAULT_NETWORKS[0];
}

export async function switchNetwork(chainId: number): Promise<Network> {
  const networks = await getAllNetworks();
  const network = findNetwork(networks, chainId);
  if (!network) throw new Error(`Unknown chainId: ${chainId}`);
  activeChainId = chainId;
  await setItem(STORAGE_KEYS.ACTIVE_CHAIN_ID, chainId);
  return network;
}

export async function addCustomNetwork(network: Network): Promise<void> {
  const all = await getAllNetworks();
  validateCustomNetwork(all, network);
  const custom = (await getItem<Network[]>(STORAGE_KEYS.NETWORKS)) ?? [];
  const updated = upsertCustomNetwork(custom, network);
  await setItem(STORAGE_KEYS.NETWORKS, updated);
  clientCache.delete(network.chainId);
}

export async function removeCustomNetwork(chainId: number): Promise<void> {
  const custom = (await getItem<Network[]>(STORAGE_KEYS.NETWORKS)) ?? [];
  const filtered = removeFromList(custom, chainId);
  await setItem(STORAGE_KEYS.NETWORKS, filtered);
  clientCache.delete(chainId);
  if (activeChainId === chainId) {
    await switchNetwork(1); // fallback to Ethereum
  }
}

export async function getClient(chainId?: number): Promise<PublicClient> {
  const id = chainId ?? await getActiveChainId();
  if (clientCache.has(id)) return clientCache.get(id)!;
  const networks = await getAllNetworks();
  const network = findNetwork(networks, id);
  if (!network) throw new Error(`Unknown chainId: ${id}`);
  const client = buildClient(network);
  clientCache.set(id, client);
  return client;
}

export async function getActiveChainId(): Promise<number> {
  const stored = await getItem<number>(STORAGE_KEYS.ACTIVE_CHAIN_ID);
  if (stored !== null) activeChainId = stored;
  return activeChainId;
}

/** Create a WalletClient configured for the active network. */
export async function getWalletClient(account: PrivateKeyAccount): Promise<WalletClient> {
  const network = await getActiveNetwork();
  return createWalletClient({
    account,
    transport: http(network.rpcUrl),
  });
}
