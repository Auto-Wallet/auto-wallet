import { test, expect, describe } from 'bun:test';
import { RpcError, userRejection } from '../src/lib/rpc-error';

describe('RpcError', () => {
  test('has message and code', () => {
    const err = new RpcError('test error', -32600);
    expect(err.message).toBe('test error');
    expect(err.code).toBe(-32600);
    expect(err.name).toBe('RpcError');
  });

  test('is instance of Error', () => {
    const err = new RpcError('test', 1);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof RpcError).toBe(true);
  });
});

describe('userRejection', () => {
  test('creates RpcError with code 4001', () => {
    const err = userRejection('User rejected');
    expect(err.code).toBe(4001);
    expect(err.message).toBe('User rejected');
    expect(err instanceof RpcError).toBe(true);
  });
});
