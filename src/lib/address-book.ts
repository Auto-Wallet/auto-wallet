import { genId } from '../types/messages';
import type { AddressBookEntry } from '../types/address-book';
import { getItem, setItem, STORAGE_KEYS } from './storage';
import {
  removeAddressBookEntry,
  upsertAddressBookEntry,
} from './address-book.core';

export async function getAddressBook(): Promise<AddressBookEntry[]> {
  return (await getItem<AddressBookEntry[]>(STORAGE_KEYS.ADDRESS_BOOK)) ?? [];
}

export async function addAddressBookEntry(name: string, address: string): Promise<AddressBookEntry[]> {
  const entries = await getAddressBook();
  const entry: AddressBookEntry = {
    id: genId(),
    name,
    address,
    createdAt: Date.now(),
  };
  const next = upsertAddressBookEntry(entries, entry);
  await setItem(STORAGE_KEYS.ADDRESS_BOOK, next);
  return next;
}

export async function removeAddressBookEntryById(id: string): Promise<AddressBookEntry[]> {
  const next = removeAddressBookEntry(await getAddressBook(), id);
  await setItem(STORAGE_KEYS.ADDRESS_BOOK, next);
  return next;
}
