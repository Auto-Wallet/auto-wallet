import { test, expect, describe } from 'bun:test';
import {
  mergeNetworks,
  findNetwork,
  validateCustomNetwork,
  upsertCustomNetwork,
  removeFromList,
  buildViemChain,
  computePresetsToSeed,
} from '../src/lib/network-manager.core';
import type { Network } from '../src/types/network';

// --- Helpers ---

const ethereum: Network = {
  chainId: 1,
  name: 'Ethereum',
  rpcUrl: 'https://eth.drpc.org',
  symbol: 'ETH',
  decimals: 18,
  blockExplorerUrl: 'https://etherscan.io',
};

const polygon: Network = {
  chainId: 137,
  name: 'Polygon',
  rpcUrl: 'https://polygon-rpc.com',
  symbol: 'POL',
  decimals: 18,
  blockExplorerUrl: 'https://polygonscan.com',
};

const customNet: Network = {
  chainId: 999,
  name: 'TestNet',
  rpcUrl: 'https://rpc.testnet.example',
  symbol: 'TST',
  decimals: 18,
  isCustom: true,
};

// =============================================================
// mergeNetworks
// =============================================================

describe('mergeNetworks (back-compat shim)', () => {
  test('returns the custom list verbatim — defaults are now seeded into storage', () => {
    const result = mergeNetworks([ethereum], [customNet]);
    expect(result).toHaveLength(1);
    expect(result[0]!.chainId).toBe(999);
  });
});

// =============================================================
// findNetwork
// =============================================================

describe('findNetwork', () => {
  const networks = [ethereum, polygon, customNet];

  test('finds by chainId', () => {
    expect(findNetwork(networks, 137)!.name).toBe('Polygon');
  });

  test('returns undefined for unknown chainId', () => {
    expect(findNetwork(networks, 42)).toBeUndefined();
  });

  test('finds custom network', () => {
    expect(findNetwork(networks, 999)!.name).toBe('TestNet');
  });
});

// =============================================================
// validateCustomNetwork
// =============================================================

describe('validateCustomNetwork', () => {
  test('adding new network with unique chainId → no throw', () => {
    expect(() => validateCustomNetwork([ethereum], customNet)).not.toThrow();
  });

  test('duplicate chainId → throws (caller should call updateNetwork instead)', () => {
    expect(() => validateCustomNetwork([ethereum, customNet], customNet)).toThrow(/already configured/);
  });

  test('duplicate chainId of a seeded preset → throws', () => {
    const fake = { ...ethereum, rpcUrl: 'https://evil.com' };
    expect(() => validateCustomNetwork([ethereum], fake)).toThrow(/already configured/);
  });
});

// =============================================================
// computePresetsToSeed
// =============================================================

describe('computePresetsToSeed', () => {
  test('fresh install: seeds all presets and records their ids', () => {
    const result = computePresetsToSeed([], [], [ethereum, polygon]);
    expect(result.changed).toBe(true);
    expect(result.networks).toHaveLength(2);
    expect(result.seededIds).toEqual([1, 137]);
    // Seeded entries are flagged as custom so the UI treats them uniformly.
    expect(result.networks[0]!.isCustom).toBe(true);
    expect(result.networks[1]!.isCustom).toBe(true);
  });

  test('user already added the same chainId → keep theirs, mark as seeded', () => {
    const userEth: Network = { ...ethereum, rpcUrl: 'https://user-picked.example' };
    const result = computePresetsToSeed([userEth], [], [ethereum, polygon]);
    expect(result.changed).toBe(true);
    expect(result.networks).toHaveLength(2);
    // user's entry untouched
    const eth = result.networks.find((n) => n.chainId === 1)!;
    expect(eth.rpcUrl).toBe('https://user-picked.example');
    // polygon gets seeded
    expect(result.networks.find((n) => n.chainId === 137)?.isCustom).toBe(true);
    // Only polygon (137) was newly added; 1 was not, but we are NOT marking
    // pre-existing chainIds as seeded since the user's own copy is what's
    // serving them. (Tracking those wouldn't change behavior either.)
    expect(result.seededIds).toEqual([137]);
  });

  test('previously-seeded but deleted preset → does NOT come back', () => {
    // User deleted Ethereum after install; SEEDED_PRESET_IDS records id 1.
    const result = computePresetsToSeed([polygon], [1, 137], [ethereum, polygon]);
    expect(result.changed).toBe(false);
    expect(result.networks).toEqual([polygon]);
    expect(result.seededIds).toEqual([1, 137]);
  });

  test('upgrade adding new preset → appends, leaves the rest alone', () => {
    const newChain: Network = { chainId: 42, name: 'New', rpcUrl: 'r', symbol: 'X', decimals: 18 };
    const result = computePresetsToSeed([ethereum, polygon], [1, 137], [ethereum, polygon, newChain]);
    expect(result.changed).toBe(true);
    expect(result.networks).toHaveLength(3);
    expect(result.networks[2]!.chainId).toBe(42);
    expect(result.seededIds).toEqual([1, 137, 42]);
  });

  test('no-op when everything is already seeded or stored', () => {
    const result = computePresetsToSeed([ethereum, polygon], [1, 137], [ethereum, polygon]);
    expect(result.changed).toBe(false);
  });
});

// =============================================================
// upsertCustomNetwork
// =============================================================

describe('upsertCustomNetwork', () => {
  test('insert new network into empty list', () => {
    const result = upsertCustomNetwork([], customNet);
    expect(result).toHaveLength(1);
    expect(result[0]!.chainId).toBe(999);
    expect(result[0]!.isCustom).toBe(true);
  });

  test('insert new network into existing list', () => {
    const other: Network = { ...customNet, chainId: 888, name: 'Other' };
    const result = upsertCustomNetwork([other], customNet);
    expect(result).toHaveLength(2);
  });

  test('update existing network (same chainId)', () => {
    const original = { ...customNet, name: 'Old Name' };
    const updated = { ...customNet, name: 'New Name' };
    const result = upsertCustomNetwork([original], updated);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('New Name');
    expect(result[0]!.isCustom).toBe(true);
  });

  test('does not mutate input array', () => {
    const input = [customNet];
    const updated = { ...customNet, name: 'Changed' };
    const result = upsertCustomNetwork(input, updated);
    expect(input[0]!.name).toBe('TestNet'); // original unchanged
    expect(result[0]!.name).toBe('Changed');
  });
});

// =============================================================
// removeFromList
// =============================================================

describe('removeFromList', () => {
  test('removes matching network', () => {
    const result = removeFromList([ethereum, customNet], 999);
    expect(result).toHaveLength(1);
    expect(result[0]!.chainId).toBe(1);
  });

  test('no match → returns same length', () => {
    const result = removeFromList([ethereum], 999);
    expect(result).toHaveLength(1);
  });

  test('empty list → empty result', () => {
    expect(removeFromList([], 1)).toHaveLength(0);
  });
});

// =============================================================
// buildViemChain
// =============================================================

describe('buildViemChain', () => {
  test('produces correct chain descriptor', () => {
    const chain = buildViemChain(ethereum);
    expect(chain.id).toBe(1);
    expect(chain.name).toBe('Ethereum');
    expect(chain.nativeCurrency).toEqual({ name: 'ETH', symbol: 'ETH', decimals: 18 });
    expect(chain.rpcUrls.default.http).toEqual(['https://eth.drpc.org']);
  });

  test('handles custom network with non-18 decimals', () => {
    const net: Network = {
      chainId: 123,
      name: 'WeirdChain',
      rpcUrl: 'https://rpc.weird.io',
      symbol: 'WRD',
      decimals: 8,
    };
    const chain = buildViemChain(net);
    expect(chain.nativeCurrency.decimals).toBe(8);
    expect(chain.nativeCurrency.symbol).toBe('WRD');
  });
});
