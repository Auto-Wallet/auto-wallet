import { createPublicClient, http, type PublicClient } from 'viem';
import { type Network, DEFAULT_NETWORKS } from '../types/network';
import { getItem, setItem, STORAGE_KEYS } from './storage';

let activeChainId: number = 1;
let clientCache: Map<number, PublicClient> = new Map();

// --- Helpers ---

function buildClient(network: Network): PublicClient {
  return createPublicClient({ transport: http(network.rpcUrl) });
}

// --- Public API ---

export async function getAllNetworks(): Promise<Network[]> {
  const custom = (await getItem<Network[]>(STORAGE_KEYS.NETWORKS)) ?? [];
  return [...DEFAULT_NETWORKS, ...custom];
}

export async function getActiveNetwork(): Promise<Network> {
  const stored = await getItem<number>(STORAGE_KEYS.ACTIVE_CHAIN_ID);
  if (stored !== null) activeChainId = stored;
  const networks = await getAllNetworks();
  const network = networks.find((n) => n.chainId === activeChainId);
  if (!network) return DEFAULT_NETWORKS[0];
  return network;
}

export async function switchNetwork(chainId: number): Promise<Network> {
  const networks = await getAllNetworks();
  const network = networks.find((n) => n.chainId === chainId);
  if (!network) throw new Error(`Unknown chainId: ${chainId}`);
  activeChainId = chainId;
  await setItem(STORAGE_KEYS.ACTIVE_CHAIN_ID, chainId);
  return network;
}

export async function addCustomNetwork(network: Network): Promise<void> {
  const all = await getAllNetworks();
  const existing = all.find((n) => n.chainId === network.chainId);
  if (existing && !existing.isCustom) {
    throw new Error(`Chain ${network.chainId} is a built-in network`);
  }
  const custom = (await getItem<Network[]>(STORAGE_KEYS.NETWORKS)) ?? [];
  const idx = custom.findIndex((n) => n.chainId === network.chainId);
  const entry = { ...network, isCustom: true };
  if (idx >= 0) {
    custom[idx] = entry;
  } else {
    custom.push(entry);
  }
  await setItem(STORAGE_KEYS.NETWORKS, custom);
  clientCache.delete(network.chainId); // invalidate cache
}

export async function removeCustomNetwork(chainId: number): Promise<void> {
  const custom = (await getItem<Network[]>(STORAGE_KEYS.NETWORKS)) ?? [];
  const filtered = custom.filter((n) => n.chainId !== chainId);
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
  const network = networks.find((n) => n.chainId === id);
  if (!network) throw new Error(`Unknown chainId: ${id}`);
  const client = buildClient(network);
  clientCache.set(id, client);
  return client;
}

export async function getActiveChainId(): Promise<number> {
  // Always read from storage to survive SW restarts
  const stored = await getItem<number>(STORAGE_KEYS.ACTIVE_CHAIN_ID);
  if (stored !== null) activeChainId = stored;
  return activeChainId;
}
