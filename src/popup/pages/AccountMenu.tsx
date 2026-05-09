import React, { useState, useEffect } from 'react';
import { callBackground } from '../api';
import { LedgerPicker } from '../LedgerPicker';
import { LedgerBadge } from '../LedgerBadge';

interface AccountInfo {
  id: string;
  label: string;
  address: string;
  type: 'private' | 'ledger';
  derivationPath?: string;
}

type AddMode = null | 'create' | 'import-pk' | 'import-mnemonic' | 'import-ledger';

export function AccountMenu({ onSwitch, onClose }: { onSwitch: () => void; onClose: () => void }) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [activeId, setActiveId] = useState('');
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [label, setLabel] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [accts, aId] = await Promise.all([
      callBackground<AccountInfo[]>('listAccounts'),
      callBackground<string>('getActiveAccountId'),
    ]);
    setAccounts(accts);
    setActiveId(aId);
  }

  async function switchTo(id: string) {
    await callBackground('switchAccount', { accountId: id });
    onSwitch();
  }

  async function handleAdd() {
    setLoading(true);
    setError('');
    try {
      const lbl = label.trim() || undefined;
      if (addMode === 'create') {
        await callBackground('addAccountGenerate', { label: lbl });
      } else if (addMode === 'import-pk') {
        const pk = input.trim().startsWith('0x') ? input.trim() : `0x${input.trim()}`;
        await callBackground('addAccountPrivateKey', { privateKey: pk, label: lbl });
      } else if (addMode === 'import-mnemonic') {
        await callBackground('addAccountMnemonic', { mnemonic: input.trim(), label: lbl });
      }
      setAddMode(null); setLabel(''); setInput('');
      onSwitch(); // refresh parent
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function handleAddLedger(seeds: { address: string; derivationPath: string }[]) {
    setLoading(true);
    setError('');
    try {
      // Use the typed name for the first selected; subsequent selections fall back to default labels.
      const enriched = seeds.map((s, i) => ({
        ...s,
        label: i === 0 && label.trim() ? label.trim() : undefined,
      }));
      await callBackground('addLedgerAccounts', { seeds: enriched });
      setAddMode(null); setLabel(''); setInput('');
      onSwitch();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function handleRename(id: string) {
    if (!editLabel.trim()) return;
    await callBackground('renameAccount', { accountId: id, label: editLabel.trim() });
    setEditingId(null); setEditLabel('');
    load();
  }

  async function handleRemove(id: string) {
    try {
      await callBackground('removeAccount', { accountId: id });
      if (id === activeId) onSwitch();
      else load();
    } catch (e: any) { setError(e.message); }
  }

  async function handleCopy(id: string, address: string) {
    await navigator.clipboard.writeText(address);
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1500);
  }

  async function handleLock() {
    await callBackground('lock');
    window.location.reload();
  }

  return (
    <div className="account-menu">
      {/* Account list */}
      <div className="account-menu-section">
        <p className="section-label" style={{ padding: '0 4px', marginBottom: 6 }}>Accounts</p>
        {accounts.map((a) => (
          <div key={a.id} className={`account-menu-item ${a.id === activeId ? 'active' : ''}`}>
            {editingId === a.id ? (
              <div className="row gap-xs" style={{ flex: 1 }}>
                <input className="input-field" style={{ padding: '3px 6px', fontSize: 11, fontFamily: 'var(--font-sans)' }}
                  value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(a.id)} autoFocus />
                <button onClick={() => handleRename(a.id)} className="btn-ghost accent" style={{ fontSize: 10 }}>OK</button>
                <button onClick={() => setEditingId(null)} className="btn-ghost" style={{ fontSize: 10 }}>X</button>
              </div>
            ) : (
              <>
                <button className="account-menu-item-main" onClick={() => switchTo(a.id)}>
                  <span className="account-menu-item-label">
                    {a.type === 'ledger' && <LedgerBadge title="Ledger hardware wallet" />}
                    {a.label}
                  </span>
                  <span className="account-menu-item-addr mono">
                    {a.address.slice(0, 6)}...{a.address.slice(-4)}
                  </span>
                </button>
                <div className="account-menu-item-actions">
                  <button onClick={(e) => { e.stopPropagation(); handleCopy(a.id, a.address); }}
                    className="btn-ghost" style={{ fontSize: 9, padding: '2px 4px' }}
                    title="Copy address">{copiedId === a.id ? 'Copied' : 'Copy'}</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(a.id); setEditLabel(a.label); }}
                    className="btn-ghost" style={{ fontSize: 9, padding: '2px 4px' }}>Rename</button>
                  {accounts.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); handleRemove(a.id); }}
                      className="btn-ghost danger" style={{ fontSize: 9, padding: '2px 4px' }}>Del</button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add account */}
      <div className="account-menu-section">
        {!addMode ? (
          <button onClick={() => setAddMode('create')} className="account-menu-add-btn">
            + Add Account
          </button>
        ) : (
          <div className="stack stack-xs" style={{ padding: 4 }}>
            <div className="row gap-xs" style={{ flexWrap: 'wrap' }}>
              {(['create', 'import-pk', 'import-mnemonic', 'import-ledger'] as const).map((m) => (
                <button key={m} onClick={() => { setAddMode(m); setError(''); }} className="account-menu-tab" data-active={addMode === m}>
                  {m === 'create' ? 'New' : m === 'import-pk' ? 'Key' : m === 'import-mnemonic' ? 'Mnemonic' : 'Ledger'}
                </button>
              ))}
            </div>
            <input className="input-field" placeholder="Name" value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-sans)' }} />
            {(addMode === 'import-pk' || addMode === 'import-mnemonic') && (
              <textarea className="input-field" style={{ minHeight: 44, padding: '5px 8px', fontSize: 10 }}
                placeholder={addMode === 'import-pk' ? '0x...' : 'word1 word2 ...'}
                value={input} onChange={(e) => setInput(e.target.value)} />
            )}
            {addMode === 'import-ledger' && (
              <LedgerPicker
                submitLabel="Add"
                submitting={loading}
                onSubmit={({ selected }) => handleAddLedger(selected)}
              />
            )}
            {error && <p className="error-text">{error}</p>}
            {addMode !== 'import-ledger' && (
              <div className="row gap-xs">
                <button onClick={handleAdd} disabled={loading} className="btn-primary" style={{ fontSize: 11, padding: '6px 10px' }}>
                  {loading ? '...' : 'Add'}
                </button>
                <button onClick={() => { setAddMode(null); setError(''); }} className="btn-ghost" style={{ fontSize: 11 }}>Cancel</button>
              </div>
            )}
            {addMode === 'import-ledger' && (
              <button onClick={() => { setAddMode(null); setError(''); }} className="btn-ghost" style={{ fontSize: 11, alignSelf: 'flex-start' }}>Cancel</button>
            )}
          </div>
        )}
      </div>

      {/* Lock */}
      <div className="account-menu-section" style={{ borderBottom: 'none' }}>
        <button onClick={handleLock} className="account-menu-lock-btn">Lock Wallet</button>
      </div>
    </div>
  );
}
