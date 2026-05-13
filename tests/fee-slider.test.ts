import { test, expect } from 'bun:test';
import { sliderPosToGwei, gweiToSliderPos, formatGweiForInput } from '../src/popup/FeeEditor';

test('slider position endpoints map to 0.000001 / 500 gwei', () => {
  expect(sliderPosToGwei(0)).toBeCloseTo(0.000001, 10);
  expect(sliderPosToGwei(1000)).toBeCloseTo(500, 6);
});

test('slider midpoint is exactly 1 gwei', () => {
  expect(sliderPosToGwei(500)).toBeCloseTo(1, 10);
});

test('left half spans sub-gwei values logarithmically', () => {
  // 25% of slider → 10^(-6 + 0.5*6) = 10^-3 = 0.001 gwei
  expect(sliderPosToGwei(250)).toBeCloseTo(0.001, 6);
});

test('right half spans super-gwei values logarithmically', () => {
  // 75% of slider → 10^(0 + 0.5*log10(500)) = 10^(1.349..) ≈ 22.36 gwei
  expect(sliderPosToGwei(750)).toBeCloseTo(Math.sqrt(500), 4);
});

test('gwei → slider position is the inverse mapping', () => {
  const cases = [0.000001, 0.0001, 0.001, 0.1, 1, 10, 50, 100, 500];
  for (const g of cases) {
    const pos = gweiToSliderPos(g);
    const round = sliderPosToGwei(pos);
    // Round-trip should land within ~0.5% relative error (limited by 1000 steps)
    expect(round).toBeGreaterThan(g * 0.99);
    expect(round).toBeLessThan(g * 1.01);
  }
});

test('out-of-range gwei clamps to slider endpoints', () => {
  expect(gweiToSliderPos(0)).toBe(0);
  expect(gweiToSliderPos(-1)).toBe(0);
  expect(gweiToSliderPos(1e9)).toBe(1000);
});

test('formatGweiForInput uses more decimals for smaller values', () => {
  expect(formatGweiForInput(123.456)).toBe('123.46');
  expect(formatGweiForInput(12.3456)).toBe('12.346');
  expect(formatGweiForInput(1.23456)).toBe('1.2346');
  expect(formatGweiForInput(0.000001)).toBe('0.000001');
  expect(formatGweiForInput(0)).toBe('0');
});
