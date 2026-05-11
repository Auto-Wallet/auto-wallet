import React, { useState } from 'react';
import {
  requestLedgerDevice,
  fetchAddresses,
  pathBatch,
  type LedgerPathStandard,
  type LedgerAddressEntry,
} from '../lib/ledger';

const PAGE_SIZE = 20;

export interface LedgerPickerSubmit {
  selected: Array<LedgerAddressEntry & { label?: string }>;
}

export function LedgerPicker({
  onSubmit,
  onCancel,
  submitLabel,
  submitting = false,
}: {
  onSubmit: (s: LedgerPickerSubmit) => void;
  onCancel: () => void;
  submitLabel: string;
  submitting?: boolean;
}) {
  const [standard, setStandard] = useState<LedgerPathStandard>('live');
  const [pageStart, setPageStart] = useState(0);
  const [entries, setEntries] = useState<LedgerAddressEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, LedgerAddressEntry & { label: string }>>({});
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'loaded'>('idle');
  const [busy, setBusy] = useState(false);

  async function connectAndLoad(nextStandard: LedgerPathStandard, start: number) {
    setError('');
    setBusy(true);
    setPhase('connecting');
    try {
      if (phase === 'idle') {
        await requestLedgerDevice();
      }
      const paths = pathBatch(nextStandard, start, PAGE_SIZE);
      const addrs = await fetchAddresses(paths);
      setEntries(addrs);
      setPhase('loaded');
    } catch (e: any) {
      setError(e.message);
      setPhase((p) => (p === 'connecting' ? 'idle' : p));
    } finally {
      setBusy(false);
    }
  }

  async function reload(nextStandard: LedgerPathStandard, start: number) {
    setError('');
    setBusy(true);
    try {
      const paths = pathBatch(nextStandard, start, PAGE_SIZE);
      const addrs = await fetchAddresses(paths);
      setEntries(addrs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(path: string) {
    setSelected((prev) => {
      if (prev[path]) {
        const next = { ...prev };
        delete next[path];
        return next;
      }
      const entry = entries.find((e) => e.derivationPath === path);
      if (!entry) return prev;
      return { ...prev, [path]: { ...entry, label: '' } };
    });
  }

  function updateLabel(path: string, label: string) {
    setSelected((prev) => {
      const current = prev[path];
      if (!current) return prev;
      return { ...prev, [path]: { ...current, label } };
    });
  }

  function changeStandard(s: LedgerPathStandard) {
    if (s === standard) return;
    setStandard(s);
    setSelected({});
    setPageStart(0);
    if (phase === 'loaded') void reload(s, 0);
  }

  function changePage(delta: number) {
    const next = Math.max(0, pageStart + delta);
    setPageStart(next);
    if (phase === 'loaded') void reload(standard, next);
  }

  function submit() {
    const picked = Object.values(selected).map((entry) => ({
      derivationPath: entry.derivationPath,
      address: entry.address,
      label: entry.label.trim() || undefined,
    }));
    if (picked.length === 0) {
      setError('Pick at least one address');
      return;
    }
    onSubmit({ selected: picked });
  }

  const selectedEntries = Object.values(selected);
  const selectedCount = selectedEntries.length;

  return (
    <div className="ledger-picker-modal" role="dialog" aria-modal="true">
      <div className="ledger-picker-panel">
        <div className="ledger-picker-header">
          <div>
            <p className="page-title">Add Ledger Accounts</p>
            <p className="ledger-picker-subtitle">
              {standard === 'live' ? "m/44'/60'/x'/0/0" : "m/44'/60'/0'/x"}
            </p>
          </div>
          <div className="row gap-xs">
            <button
              type="button"
              className="account-menu-tab"
              data-active={standard === 'live'}
              onClick={() => changeStandard('live')}
            >Ledger Live</button>
            <button
              type="button"
              className="account-menu-tab"
              data-active={standard === 'legacy'}
              onClick={() => changeStandard('legacy')}
            >Legacy</button>
          </div>
        </div>

        {phase === 'idle' ? (
          <div className="ledger-connect-state">
            <div className="ledger-connect-card">
              <p className="section-label">Connect your Ledger</p>
              <p className="ledger-connect-copy">
                Unlock the device and open the Ethereum app.
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void connectAndLoad(standard, 0)}
              >
                {busy ? 'Connecting...' : 'Connect Ledger'}
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        ) : (
          <div className="ledger-picker-body">
            <div className="ledger-picker-left">
              <div className="ledger-picker-toolbar">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || pageStart === 0}
                  onClick={() => changePage(-PAGE_SIZE)}
                >&larr; Prev</button>
                <span className="ledger-picker-range">
                  #{pageStart}–#{pageStart + PAGE_SIZE - 1}
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => changePage(PAGE_SIZE)}
                >Next &rarr;</button>
              </div>

              <div className="ledger-address-grid">
                {busy ? (
                  Array.from({ length: PAGE_SIZE }).map((_, idx) => (
                    <div key={`sk-${pageStart + idx}`} className="ledger-row" data-loading="true">
                      <span className="ledger-row-idx">#{pageStart + idx}</span>
                      <span className="ledger-row-loading">
                        <span className="spinner-inline" />
                        <span>Loading...</span>
                      </span>
                      <span className="ledger-row-check" />
                    </div>
                  ))
                ) : entries.length > 0 ? (
                  entries.map((e, idx) => {
                    const checked = !!selected[e.derivationPath];
                    return (
                      <button
                        key={e.derivationPath}
                        type="button"
                        className="ledger-row"
                        data-checked={checked}
                        onClick={() => toggle(e.derivationPath)}
                      >
                        <span className="ledger-row-idx">#{pageStart + idx}</span>
                        <span className="ledger-row-addr mono">
                          {e.address.slice(0, 10)}...{e.address.slice(-8)}
                        </span>
                        <span className="ledger-row-check" data-checked={checked}>
                          {checked ? '✓' : ''}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="ledger-empty-state">No addresses loaded</p>
                )}
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>

            <div className="ledger-picker-right">
              <div className="row row-between">
                <p className="section-label">Selected</p>
                <span className="badge badge-network">{selectedCount}</span>
              </div>
              {selectedEntries.length === 0 ? (
                <p className="ledger-empty-state">Pick addresses on the left.</p>
              ) : (
                <div className="ledger-selected-list">
                  {selectedEntries.map((entry) => (
                    <div key={entry.derivationPath} className="ledger-selected-row">
                      <div className="row row-between gap-sm">
                        <span className="mono ledger-selected-address">
                          {entry.address.slice(0, 10)}...{entry.address.slice(-8)}
                        </span>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => toggle(entry.derivationPath)}
                          style={{ fontSize: 10, padding: '2px 4px' }}
                        >Remove</button>
                      </div>
                      <input
                        className="input-field"
                        placeholder="Name"
                        value={entry.label}
                        onChange={(e) => updateLabel(entry.derivationPath, e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 11, fontFamily: 'var(--font-sans)' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="ledger-picker-footer">
          <button
            type="button"
            className="btn-ghost"
            disabled={submitting}
            onClick={onCancel}
          >Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || selectedCount === 0}
            onClick={submit}
          >
            {submitting ? 'Saving...' : `${submitLabel}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
