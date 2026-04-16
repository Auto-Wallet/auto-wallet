import React, { useState, useEffect } from 'react';
import { callBackground } from '../api';
import type { Token } from '../../types/token';
import type { Network } from '../../types/network';

export function TokenPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [network, setNetwork] = useState<Network | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [toks, net] = await Promise.all([
      callBackground<Token[]>('getTokens'),
      callBackground<Network>('getActiveNetwork'),
    ]);
    setTokens(toks.filter((t) => t.chainId === net.chainId));
    setNetwork(net);
  }

  async function addToken() {
    if (!address.trim() || !network) return;
    setLoading(true);
    setError('');
    try {
      await callBackground('addToken', { chainId: network.chainId, address: address.trim() });
      setAddress('');
      setShowForm(false);
      loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeToken(token: Token) {
    await callBackground('removeToken', { chainId: token.chainId, address: token.address });
    loadData();
  }

  return (
    <div className="stack stack-sm animate-in">
      <div className="row row-between">
        <p className="page-title">Tokens <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>&middot; {network?.name}</span></p>
        <button onClick={() => setShowForm(!showForm)} className="btn-ghost accent">
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <div className="card-form">
          <input className="input-field" placeholder="Token contract address (0x...)" value={address} onChange={(e) => setAddress(e.target.value)} />
          {error && <p className="error-text">{error}</p>}
          <button onClick={addToken} disabled={loading} className="btn-primary">
            {loading ? 'Fetching info...' : 'Add Token'}
          </button>
        </div>
      )}

      {tokens.length === 0 && !showForm && (
        <div className="empty-state">No custom tokens on this network</div>
      )}

      {tokens.map((t) => (
        <div key={`${t.chainId}-${t.address}`} className="card">
          <div className="row row-between">
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{t.symbol}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {t.name ?? t.address.slice(0, 14) + '...'}
              </div>
            </div>
            <button onClick={() => removeToken(t)} className="btn-ghost danger">Del</button>
          </div>
        </div>
      ))}
    </div>
  );
}
