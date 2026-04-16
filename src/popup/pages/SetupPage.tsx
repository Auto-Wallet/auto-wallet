import React, { useState } from 'react';
import { callBackground } from '../api';

export function SetupPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'choose' | 'create' | 'import-pk' | 'import-mnemonic'>('choose');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (mode !== 'create' && !input.trim()) { setError('Please enter a private key or mnemonic'); return; }
    setLoading(true);
    setError('');
    try {
      const label = name.trim() || undefined;
      if (mode === 'create') {
        await callBackground('createWallet', { password, label });
      } else if (mode === 'import-pk') {
        const pk = input.trim().startsWith('0x') ? input.trim() : `0x${input.trim()}`;
        await callBackground('importPrivateKey', { privateKey: pk, password, label });
      } else {
        await callBackground('importMnemonic', { mnemonic: input.trim(), password, label });
      }
      onDone();
    } catch (e: any) { setError(e.message); setLoading(false); }
  };

  if (mode === 'choose') {
    return (
      <div className="center-page animate-in">
        <img src="icons/icon128.png" className="logo-mark" alt="Auto Wallet" />
        <h1>Auto Wallet</h1>
        <p className="subtitle">Auto-signing wallet for power users</p>
        <div className="stack stack-sm w-full">
          <button onClick={() => setMode('create')} className="btn-primary">Create New Wallet</button>
          <button onClick={() => setMode('import-pk')} className="btn-secondary">Import Private Key</button>
          <button onClick={() => setMode('import-mnemonic')} className="btn-secondary">Import Mnemonic</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack stack-sm animate-in" style={{ paddingTop: 8 }}>
      <p className="page-title">
        {mode === 'create' ? 'Create Wallet' : mode === 'import-pk' ? 'Import Private Key' : 'Import Mnemonic'}
      </p>

      <input
        className="input-field"
        placeholder="Wallet name (e.g. Main, Trading, Test...)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ fontFamily: 'var(--font-sans)' }}
      />

      {mode !== 'create' && (
        <textarea
          className="input-field"
          placeholder={mode === 'import-pk' ? '0x...' : 'word1 word2 word3 ...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      )}

      <input type="password" className="input-field" placeholder="Master password (min 8 chars)"
        value={password} onChange={(e) => setPassword(e.target.value)}
        style={{ fontFamily: 'var(--font-sans)' }} />
      <input type="password" className="input-field" placeholder="Confirm password"
        value={confirm} onChange={(e) => setConfirm(e.target.value)}
        style={{ fontFamily: 'var(--font-sans)' }} />

      {error && <p className="error-text">{error}</p>}

      <button onClick={handleSubmit} disabled={loading} className="btn-primary">
        {loading ? 'Processing...' : mode === 'create' ? 'Create' : 'Import'}
      </button>
      <button onClick={() => { setMode('choose'); setError(''); setName(''); }} className="btn-ghost" style={{ alignSelf: 'center' }}>Back</button>
    </div>
  );
}
