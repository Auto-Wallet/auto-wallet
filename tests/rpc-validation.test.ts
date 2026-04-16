import { test, expect, describe } from 'bun:test';
import {
  validateSigner,
  validateRpcUrl,
  parseAddChainParams,
  parseTxParams,
} from '../src/lib/rpc-validation';

// =============================================================
// validateSigner
// =============================================================

describe('validateSigner', () => {
  const activeAddr = '0xAbCd1234567890abcdef1234567890abcdef1234';

  test('matching address (case-insensitive) → no throw', () => {
    expect(() => validateSigner(
      '0xabcd1234567890abcdef1234567890abcdef1234',
      activeAddr,
    )).not.toThrow();
  });

  test('matching address (same case) → no throw', () => {
    expect(() => validateSigner(activeAddr, activeAddr)).not.toThrow();
  });

  test('undefined from → no throw (skip validation)', () => {
    expect(() => validateSigner(undefined, activeAddr)).not.toThrow();
  });

  test('mismatched address → throws with both addresses', () => {
    const wrongAddr = '0x9999999999999999999999999999999999999999';
    expect(() => validateSigner(wrongAddr, activeAddr)).toThrow('does not match');
    expect(() => validateSigner(wrongAddr, activeAddr)).toThrow(wrongAddr);
    expect(() => validateSigner(wrongAddr, activeAddr)).toThrow(activeAddr);
  });
});

// =============================================================
// validateRpcUrl
// =============================================================

describe('validateRpcUrl', () => {
  test('https URL → valid', () => {
    expect(validateRpcUrl('https://eth.drpc.org')).toEqual({ valid: true });
  });

  test('https URL with path → valid', () => {
    expect(validateRpcUrl('https://rpc.example.com/v1/key123')).toEqual({ valid: true });
  });

  test('http://localhost → valid (dev)', () => {
    expect(validateRpcUrl('http://localhost:8545')).toEqual({ valid: true });
  });

  test('http://localhost without port → valid', () => {
    expect(validateRpcUrl('http://localhost')).toEqual({ valid: true });
  });

  test('plain http → invalid', () => {
    const result = validateRpcUrl('http://insecure.example.com');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('HTTPS');
  });

  test('ws:// → invalid', () => {
    const result = validateRpcUrl('ws://rpc.example.com');
    expect(result.valid).toBe(false);
  });

  test('empty string → invalid', () => {
    const result = validateRpcUrl('');
    expect(result.valid).toBe(false);
  });

  test('undefined → invalid', () => {
    const result = validateRpcUrl(undefined);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('No RPC URL');
  });
});

// =============================================================
// parseAddChainParams
// =============================================================

describe('parseAddChainParams', () => {
  test('parses standard wallet_addEthereumChain params', () => {
    const params = [{
      chainId: '0x89',    // 137
      chainName: 'Polygon',
      rpcUrls: ['https://polygon-rpc.com'],
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      blockExplorerUrls: ['https://polygonscan.com'],
    }];

    const result = parseAddChainParams(params);
    expect(result.chainId).toBe(137);
    expect(result.chainName).toBe('Polygon');
    expect(result.rpcUrl).toBe('https://polygon-rpc.com');
    expect(result.symbol).toBe('MATIC');
    expect(result.decimals).toBe(18);
    expect(result.blockExplorerUrl).toBe('https://polygonscan.com');
  });

  test('hex chainId parsing: 0x1 → 1', () => {
    const params = [{
      chainId: '0x1',
      chainName: 'Ethereum',
      rpcUrls: ['https://eth.drpc.org'],
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    }];
    expect(parseAddChainParams(params).chainId).toBe(1);
  });

  test('hex chainId parsing: 0xa4b1 → 42161 (Arbitrum)', () => {
    const params = [{
      chainId: '0xa4b1',
      chainName: 'Arbitrum',
      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    }];
    expect(parseAddChainParams(params).chainId).toBe(42161);
  });

  test('missing optional fields → defaults', () => {
    const params = [{
      chainId: '0x1',
      chainName: 'Minimal',
    }];
    const result = parseAddChainParams(params);
    expect(result.rpcUrl).toBe('');
    expect(result.symbol).toBe('');
    expect(result.decimals).toBe(18);
    expect(result.blockExplorerUrl).toBeUndefined();
  });
});

// =============================================================
// parseTxParams
// =============================================================

describe('parseTxParams', () => {
  test('parses complete tx', () => {
    const tx = {
      to: '0x1234567890abcdef1234567890abcdef12345678',
      value: '0xde0b6b3a7640000', // 1 ETH
      gas: '0x5208',              // 21000
      data: '0xa9059cbb0000000000000000',
      from: '0xaaaa',
    };

    const result = parseTxParams(tx);
    expect(result.to).toBe(tx.to);
    expect(result.value).toBe('0xde0b6b3a7640000');
    expect(result.valueBigInt).toBe(1000000000000000000n);
    expect(result.gasLimit).toBe('0x5208');
    expect(result.gasLimitBigInt).toBe(21000n);
    expect(result.data).toBe(tx.data);
    expect(result.from).toBe('0xaaaa');
    expect(result.methodSelector).toBe('0xa9059cbb');
  });

  test('defaults for missing fields', () => {
    const result = parseTxParams({});
    expect(result.to).toBeNull();
    expect(result.value).toBe('0x0');
    expect(result.valueBigInt).toBe(0n);
    expect(result.gasLimit).toBeNull();
    expect(result.gasLimitBigInt).toBeNull();
    expect(result.data).toBeNull();
    expect(result.from).toBeNull();
    expect(result.methodSelector).toBeUndefined();
  });

  test('prefers "gas" over "gasLimit" field', () => {
    const tx = { gas: '0x5208', gasLimit: '0xffff' };
    expect(parseTxParams(tx).gasLimitBigInt).toBe(21000n); // gas = 0x5208
  });

  test('falls back to "gasLimit" when "gas" not present', () => {
    const tx = { gasLimit: '0x5208' };
    expect(parseTxParams(tx).gasLimitBigInt).toBe(21000n);
  });

  test('method selector extraction from data', () => {
    expect(parseTxParams({ data: '0x5ae401dc00000000' }).methodSelector).toBe('0x5ae401dc');
    expect(parseTxParams({ data: '0x12345678' }).methodSelector).toBe('0x12345678');
    expect(parseTxParams({}).methodSelector).toBeUndefined();
  });
});
