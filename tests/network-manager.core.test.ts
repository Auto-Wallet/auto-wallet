import { test, expect, describe } from 'bun:test';
import {
  mergeNetworks,
  findNetwork,
  validateCustomNetwork,
  upsertCustomNetwork,
  removeFromList,
  buildViemChain,
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

describe('mergeNetworks', () => {
  test('combines defaults and custom, defaults first', () => {
    const result = mergeNetworks([ethereum], [customNet]);
    expect(result).toHaveLength(2);
    expect(result[0].chainId).toBe(1);
    expect(result[1].chainId).toBe(999);
  });

  test('empty custom → only defaults', () => {
    const result = mergeNetworks([ethereum, polygon], []);
    expect(result).toHaveLength(2);
  });

  test('empty defaults → only custom', () => {
    const result = mergeNetworks([], [customNet]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('TestNet');
  });

  test('both empty → empty', () => {
    expect(mergeNetworks([], [])).toHaveLength(0);
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
  test('adding new custom network → no throw', () => {
    expect(() => validateCustomNetwork([ethereum], customNet)).not.toThrow();
  });

  test('overwriting existing custom network → no throw', () => {
    const existing = { ...customNet };
    const updated = { ...customNet, rpcUrl: 'https://new-rpc.example' };
    expect(() => validateCustomNetwork([ethereum, existing], updated)).not.toThrow();
  });

  test('overwriting built-in network → throws', () => {
    const fake = { ...ethereum, rpcUrl: 'https://evil.com' };
    expect(() => validateCustomNetwork([ethereum], fake)).toThrow('built-in network');
  });
});

// =============================================================
// upsertCustomNetwork
// =============================================================

describe('upsertCustomNetwork', () => {
  test('insert new network into empty list', () => {
    const result = upsertCustomNetwork([], customNet);
    expect(result).toHaveLength(1);
    expect(result[0].chainId).toBe(999);
    expect(result[0].isCustom).toBe(true);
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
    expect(result[0].name).toBe('New Name');
    expect(result[0].isCustom).toBe(true);
  });

  test('does not mutate input array', () => {
    const input = [customNet];
    const updated = { ...customNet, name: 'Changed' };
    const result = upsertCustomNetwork(input, updated);
    expect(input[0].name).toBe('TestNet'); // original unchanged
    expect(result[0].name).toBe('Changed');
  });
});

// =============================================================
// removeFromList
// =============================================================

describe('removeFromList', () => {
  test('removes matching network', () => {
    const result = removeFromList([ethereum, customNet], 999);
    expect(result).toHaveLength(1);
    expect(result[0].chainId).toBe(1);
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
