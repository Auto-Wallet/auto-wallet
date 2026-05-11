import { getAddress, isAddress } from 'viem';
import type { AddressBookEntry } from '../types/address-book';

export function normalizeAddressBookEntry(entry: AddressBookEntry): AddressBookEntry {
  if (!entry.name.trim()) throw new Error('Address name is required');
  if (!isAddress(entry.address)) throw new Error('Invalid address');

  return {
    ...entry,
    name: entry.name.trim(),
    address: getAddress(entry.address),
  };
}

export function upsertAddressBookEntry(
  entries: AddressBookEntry[],
  entry: AddressBookEntry,
): AddressBookEntry[] {
  const normalized = normalizeAddressBookEntry(entry);
  const duplicate = entries.find((item) =>
    item.id !== normalized.id &&
    (
      item.name.trim().toLowerCase() === normalized.name.toLowerCase() ||
      item.address.toLowerCase() === normalized.address.toLowerCase()
    )
  );
  if (duplicate) throw new Error('Address book entry already exists');

  const next = entries.filter((item) => item.id !== normalized.id);
  return [normalized, ...next].sort((a, b) => b.createdAt - a.createdAt);
}

export function removeAddressBookEntry(entries: AddressBookEntry[], id: string): AddressBookEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function matchAddressBookEntries(entries: AddressBookEntry[], query: string): AddressBookEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return entries
    .map((entry) => {
      const name = entry.name.toLowerCase();
      const address = entry.address.toLowerCase();
      let score = 0;

      if (name === q) score = 100;
      else if (address === q) score = 95;
      else if (name.startsWith(q)) score = 80;
      else if (address.startsWith(q)) score = 75;
      else if (name.includes(q)) score = 50;

      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .map(({ entry }) => entry);
}

export function resolveAddressBookInput(entries: AddressBookEntry[], input: string): string | null {
  const raw = input.trim();
  if (isAddress(raw)) return getAddress(raw);

  const matches = matchAddressBookEntries(entries, raw);
  return matches.length === 1 ? matches[0]!.address : null;
}
