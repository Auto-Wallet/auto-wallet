import { describe, expect, test } from 'bun:test';
import {
  matchAddressBookEntries,
  normalizeAddressBookEntry,
  resolveAddressBookInput,
  upsertAddressBookEntry,
} from '../src/lib/address-book.core';
import type { AddressBookEntry } from '../src/types/address-book';

const ENTRIES: AddressBookEntry[] = [
  {
    id: '1',
    name: 'Binance Hot',
    address: '0x1111111111111111111111111111111111111111',
    createdAt: 1,
  },
  {
    id: '2',
    name: 'Limit Cover',
    address: '0x2fb4D46372Ea1748ec3c29Bd2C7B536019DF5200',
    createdAt: 2,
  },
  {
    id: '3',
    name: 'Ledger Vault',
    address: '0x3333333333333333333333333333333333333333',
    createdAt: 3,
  },
];

describe('address book core', () => {
  test('normalizes names and checksum addresses', () => {
    const entry = normalizeAddressBookEntry({
      id: 'a',
      name: '  Alice  ',
      address: '0x2fb4d46372ea1748ec3c29bd2c7b536019df5200',
      createdAt: 1,
    });

    expect(entry.name).toBe('Alice');
    expect(entry.address).toBe('0x2fb4D46372Ea1748ec3c29Bd2C7B536019DF5200');
  });

  test('rejects invalid addresses', () => {
    expect(() => normalizeAddressBookEntry({
      id: 'a',
      name: 'Alice',
      address: '0x123',
      createdAt: 1,
    })).toThrow('Invalid address');
  });

  test('prevents duplicate names and addresses', () => {
    expect(() => upsertAddressBookEntry(ENTRIES, {
      id: 'new',
      name: 'limit cover',
      address: '0x4444444444444444444444444444444444444444',
      createdAt: 4,
    })).toThrow('already exists');

    expect(() => upsertAddressBookEntry(ENTRIES, {
      id: 'new',
      name: 'Another',
      address: '0x2fb4d46372ea1748ec3c29bd2c7b536019df5200',
      createdAt: 4,
    })).toThrow('already exists');
  });

  test('matches by name and address prefix', () => {
    expect(matchAddressBookEntries(ENTRIES, 'limit').map((entry) => entry.name)).toEqual(['Limit Cover']);
    expect(matchAddressBookEntries(ENTRIES, '0x2fb4').map((entry) => entry.name)).toEqual(['Limit Cover']);
  });

  test('resolves exact address input without address book lookup', () => {
    expect(resolveAddressBookInput(
      ENTRIES,
      '0x2fb4d46372ea1748ec3c29bd2c7b536019df5200',
    )).toBe('0x2fb4D46372Ea1748ec3c29Bd2C7B536019DF5200');
  });

  test('resolves unique address book matches', () => {
    expect(resolveAddressBookInput(ENTRIES, 'ledger')).toBe('0x3333333333333333333333333333333333333333');
    expect(resolveAddressBookInput(ENTRIES, '0x1111')).toBe('0x1111111111111111111111111111111111111111');
  });

  test('does not resolve ambiguous matches', () => {
    expect(resolveAddressBookInput(ENTRIES, 'e')).toBeNull();
  });
});
