import { test, expect } from 'bun:test';
import { bufferGas, clampEstimatedFees, floorPriorityFee, MIN_PRIORITY_FEE_WEI } from '../src/lib/gas';

test('bufferGas multiplies by 1.2', () => {
  expect(bufferGas(100_000n)).toBe(120_000n);
  expect(bufferGas(0n)).toBe(0n);
});

test('floorPriorityFee bumps below-floor estimates to 10000 wei', () => {
  expect(MIN_PRIORITY_FEE_WEI).toBe(10_000n);
  expect(floorPriorityFee(0n)).toBe(10_000n);
  expect(floorPriorityFee(1n)).toBe(10_000n);
  expect(floorPriorityFee(9_999n)).toBe(10_000n);
  expect(floorPriorityFee(null)).toBe(10_000n);
  expect(floorPriorityFee(undefined)).toBe(10_000n);
});

test('floorPriorityFee leaves above-floor estimates untouched', () => {
  expect(floorPriorityFee(10_000n)).toBe(10_000n);
  expect(floorPriorityFee(50_000n)).toBe(50_000n);
  expect(floorPriorityFee(1_000_000_000n)).toBe(1_000_000_000n);
});

test('clampEstimatedFees bumps maxFeePerGas by the same delta as priority', () => {
  // priority=0 -> bumped by 10000; maxFee bumps by the same delta
  const out = clampEstimatedFees({
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 0n,
  });
  expect(out.maxPriorityFeePerGas).toBe(10_000n);
  expect(out.maxFeePerGas).toBe(30_000_010_000n);
});

test('clampEstimatedFees is a no-op when priority is already at or above floor', () => {
  const fees = { maxFeePerGas: 50n, maxPriorityFeePerGas: 12_000n };
  expect(clampEstimatedFees(fees)).toEqual(fees);
});
