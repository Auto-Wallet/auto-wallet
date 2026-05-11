import { test, expect, describe } from 'bun:test';
import { isProviderInjectionAllowed } from '../src/lib/injection-policy';

describe('isProviderInjectionAllowed', () => {
  test('allows regular http and https dapp pages', () => {
    expect(isProviderInjectionAllowed('https://app.uniswap.org/swap')).toBe(true);
    expect(isProviderInjectionAllowed('http://localhost:3000')).toBe(true);
  });

  test('blocks Google Docs pages', () => {
    expect(isProviderInjectionAllowed('https://docs.google.com/document/d/abc/edit')).toBe(false);
    expect(isProviderInjectionAllowed('https://docs.google.com/spreadsheets/d/abc/edit')).toBe(false);
  });

  test('blocks non-web page contexts and malformed URLs', () => {
    expect(isProviderInjectionAllowed('chrome://extensions')).toBe(false);
    expect(isProviderInjectionAllowed('not a url')).toBe(false);
  });
});
