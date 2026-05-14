import React, { useState, useEffect, useMemo } from 'react';
import { callBackground } from '../api';
import type { Network } from '../../types/network';

export function NetworkPage() {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [active, setActive] = useState<number>(1);
  const [showForm, setShowForm] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<Network | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDeleteChainId, setConfirmDeleteChainId] = useState<number | null>(null);
  const [form, setForm] = useState({ chainId: '', name: '', rpcUrl: '', symbol: '', decimals: '18', blockExplorerUrl: '' });

  useEffect(() => { loadNetworks(); }, []);

  async function loadNetworks() {
    const [nets, act] = await Promise.all([
      callBackground<Network[]>('getNetworks'),
      callBackground<Network>('getActiveNetwork'),
    ]);
    setNetworks(nets);
    setActive(act.chainId);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? networks.filter((n) =>
          n.name.toLowerCase().includes(q) ||
          n.symbol.toLowerCase().includes(q) ||
          String(n.chainId).includes(q)
        )
      : networks;
    return [...matched].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [networks, search]);

  async function switchTo(chainId: number) {
    await callBackground('switchNetwork', { chainId });
    setActive(chainId);
  }

  async function saveNetwork() {
    const chainId = parseInt(form.chainId);
    if (!chainId || !form.name || !form.rpcUrl || !form.symbol) return;
    const payload: Network = {
      chainId,
      name: form.name,
      rpcUrl: form.rpcUrl,
      symbol: form.symbol,
      decimals: parseInt(form.decimals) || 18,
      blockExplorerUrl: form.blockExplorerUrl || undefined,
      isCustom: true,
    };
    const action = editingNetwork ? 'updateNetwork' : 'addCustomNetwork';
    await callBackground(action, payload);
    setForm({ chainId: '', name: '', rpcUrl: '', symbol: '', decimals: '18', blockExplorerUrl: '' });
    setShowForm(false);
    setEditingNetwork(null);
    loadNetworks();
  }

  function openAddForm() {
    setEditingNetwork(null);
    setForm({ chainId: '', name: '', rpcUrl: '', symbol: '', decimals: '18', blockExplorerUrl: '' });
    setShowForm(true);
  }

  function openEditForm(network: Network) {
    setEditingNetwork(network);
    setForm({
      chainId: String(network.chainId),
      name: network.name,
      rpcUrl: network.rpcUrl,
      symbol: network.symbol,
      decimals: String(network.decimals),
      blockExplorerUrl: network.blockExplorerUrl ?? '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingNetwork(null);
    setForm({ chainId: '', name: '', rpcUrl: '', symbol: '', decimals: '18', blockExplorerUrl: '' });
  }

  async function removeNetwork(chainId: number) {
    if (confirmDeleteChainId !== chainId) {
      setConfirmDeleteChainId(chainId);
      return;
    }
    await callBackground('removeCustomNetwork', { chainId });
    setConfirmDeleteChainId(null);
    loadNetworks();
  }

  return (
    <div className="stack stack-sm animate-in">
      <div className="row row-between">
        <p className="page-title">Networks</p>
        <button onClick={showForm ? closeForm : openAddForm} className="btn-ghost accent">
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Search */}
      <div className="search-box">
        <span className="search-icon">&#8981;</span>
        <input
          className="search-input"
          placeholder="Search by name, symbol, or chain ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="search-clear">&times;</button>
        )}
      </div>

      {/* Add/edit form */}
      {showForm && (
        <div className="card-form">
          <div className="row row-between">
            <p className="section-label">{editingNetwork ? 'Edit Network' : 'Add Network'}</p>
          </div>
          <div className="grid-2">
            <input className="input-field" placeholder="Chain ID" value={form.chainId} onChange={(e) => setForm({ ...form, chainId: e.target.value })} disabled={!!editingNetwork} />
            <input className="input-field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ fontFamily: 'var(--font-sans)' }} />
          </div>
          <input className="input-field" placeholder="RPC URL" value={form.rpcUrl} onChange={(e) => setForm({ ...form, rpcUrl: e.target.value })} />
          <div className="grid-2">
            <input className="input-field" placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
            <input className="input-field" placeholder="Decimals" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} />
          </div>
          <input className="input-field" placeholder="Block explorer URL (optional)" value={form.blockExplorerUrl} onChange={(e) => setForm({ ...form, blockExplorerUrl: e.target.value })} />
          <button onClick={saveNetwork} className="btn-primary">
            {editingNetwork ? 'Save Network' : 'Add Network'}
          </button>
        </div>
      )}

      {/* Results */}
      {search && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          {search ? `No networks matching "${search}"` : 'No networks'}
        </div>
      )}

      {filtered.map((n) => (
        <div
          key={n.chainId}
          className={`card card-clickable ${n.chainId === active ? 'card-active' : ''}`}
          onClick={() => switchTo(n.chainId)}
        >
          <div className="row row-between">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{n.name}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                Chain {n.chainId} &middot; {n.symbol}
              </div>
            </div>
            <div className="row gap-sm">
              {n.chainId === active && <span className="pulse-dot" />}
              <button onClick={(e) => { e.stopPropagation(); openEditForm(n); }} className="btn-ghost accent">Edit</button>
              <button onClick={(e) => { e.stopPropagation(); removeNetwork(n.chainId); }} className="btn-ghost danger">
                {confirmDeleteChainId === n.chainId ? 'Confirm' : 'Del'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
