// Pure decision functions for network management.
// Zero IO, zero chrome dependency — fully testable.

import type { Chain } from 'viem';
import type { Network } from '../types/network';

/** Back-compat shim. Networks are now seeded directly into user storage, so
 *  there's nothing to merge — the input list is the authoritative list. */
export function mergeNetworks(_defaults: Network[], custom: Network[]): Network[] {
  return [...custom];
}

/** Find a network by chainId from a list. */
export function findNetwork(networks: Network[], chainId: number): Network | undefined {
  return networks.find((n) => n.chainId === chainId);
}

/**
 * Validate that a custom network can be added.
 * Rejects only when the same chainId is already present — all networks live in
 * user storage, so there is no "built-in" to protect.
 */
export function validateCustomNetwork(allNetworks: Network[], network: Network): void {
  if (allNetworks.some((n) => n.chainId === network.chainId)) {
    throw new Error(`Chain ${network.chainId} is already configured. Edit it instead.`);
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

/**
 * Decide which presets to seed into the user's network list.
 *
 * A preset is added when its chainId is BOTH:
 *   1. not already present in the user's stored networks, and
 *   2. not in the set of previously-seeded ids
 * (2) lets a deleted preset stay deleted across restarts/upgrades.
 *
 * Returns an object suitable for writing back to storage. If no changes are
 * needed, `changed` is false and the IO layer can skip the write.
 */
export function computePresetsToSeed(
  stored: Network[],
  seededIds: number[],
  presets: Network[],
): { networks: Network[]; seededIds: number[]; changed: boolean } {
  const storedIds = new Set(stored.map((n) => n.chainId));
  const alreadySeeded = new Set(seededIds);

  const toAdd: Network[] = [];
  for (const preset of presets) {
    if (storedIds.has(preset.chainId)) continue;
    if (alreadySeeded.has(preset.chainId)) continue;
    toAdd.push({ ...preset, isCustom: true });
  }

  if (toAdd.length === 0) {
    return { networks: stored, seededIds, changed: false };
  }

  const newSeeded = [...seededIds];
  for (const n of toAdd) newSeeded.push(n.chainId);

  return {
    networks: [...stored, ...toAdd],
    seededIds: newSeeded,
    changed: true,
  };
}
