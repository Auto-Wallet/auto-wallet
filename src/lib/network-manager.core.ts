// Pure decision functions for network management.
// Zero IO, zero chrome dependency — fully testable.

import type { Chain } from 'viem';
import type { Network } from '../types/network';

/** Merge built-in default networks with user-added custom networks. */
export function mergeNetworks(defaults: Network[], custom: Network[]): Network[] {
  return [...defaults, ...custom];
}

/** Find a network by chainId from a list. */
export function findNetwork(networks: Network[], chainId: number): Network | undefined {
  return networks.find((n) => n.chainId === chainId);
}

/**
 * Validate that a custom network can be added.
 * Throws if trying to overwrite a built-in network.
 */
export function validateCustomNetwork(allNetworks: Network[], network: Network): void {
  const existing = allNetworks.find((n) => n.chainId === network.chainId);
  if (existing && !existing.isCustom) {
    throw new Error(`Chain ${network.chainId} is a built-in network`);
  }
}

/**
 * Insert or update a custom network in the custom networks list.
 * Returns the updated custom list.
 */
export function upsertCustomNetwork(customNetworks: Network[], network: Network): Network[] {
  const entry = { ...network, isCustom: true };
  const idx = customNetworks.findIndex((n) => n.chainId === network.chainId);
  const result = [...customNetworks];
  if (idx >= 0) {
    result[idx] = entry;
  } else {
    result.push(entry);
  }
  return result;
}

/** Remove a network by chainId from a list. */
export function removeFromList(networks: Network[], chainId: number): Network[] {
  return networks.filter((n) => n.chainId !== chainId);
}

/** Build a viem Chain descriptor from a Network object. */
export function buildViemChain(network: Network): Chain {
  return {
    id: network.chainId,
    name: network.name,
    nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: network.decimals },
    rpcUrls: { default: { http: [network.rpcUrl] } },
  } as Chain;
}
