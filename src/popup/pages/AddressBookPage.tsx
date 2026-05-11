import React, { useEffect, useState } from 'react';
import { callBackground } from '../api';
import type { AddressBookEntry } from '../../types/address-book';

function BookUserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 13a3 3 0 1 0-6 0" />
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <circle cx="12" cy="8" r="2" />
    </svg>
  );
}

export function AddressBookPage() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { loadEntries(); }, []);

  async function loadEntries() {
    setEntries(await callBackground<AddressBookEntry[]>('getAddressBook'));
  }

  async function addEntry() {
    setError('');
    try {
      const next = await callBackground<AddressBookEntry[]>('addAddressBookEntry', { name, address });
      setEntries(next);
      setName('');
      setAddress('');
      setShowForm(false);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeEntry(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setEntries(await callBackground<AddressBookEntry[]>('removeAddressBookEntry', { id }));
    setConfirmDeleteId(null);
  }

  return (
    <div className="stack stack-sm animate-in">
      <div className="row row-between">
        <div className="row gap-sm">
          <span className="page-title-icon"><BookUserIcon /></span>
          <p className="page-title">Address Book</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-ghost accent">
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <div className="card-form">
          <input
            className="input-field"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontFamily: 'var(--font-sans)' }}
          />
          <input
            className="input-field"
            placeholder="Address (0x...)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          {error && <p className="error-text">{error}</p>}
          <button onClick={addEntry} className="btn-primary">Save Address</button>
        </div>
      )}

      {entries.length === 0 && !showForm && (
        <div className="empty-state">No saved addresses</div>
      )}

      {entries.map((entry) => (
        <div key={entry.id} className="address-book-card">
          <div style={{ minWidth: 0 }}>
            <div className="address-book-name truncate">{entry.name}</div>
            <div className="address-book-address mono">
              {entry.address.slice(0, 12)}...{entry.address.slice(-8)}
            </div>
          </div>
          <button onClick={() => removeEntry(entry.id)} className="btn-ghost danger" style={{ fontSize: 10, opacity: 0.5 }}>
            {confirmDeleteId === entry.id ? 'Confirm' : 'Del'}
          </button>
        </div>
      ))}
    </div>
  );
}
