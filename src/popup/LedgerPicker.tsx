import React, { useState } from 'react';
import {
  requestLedgerDevice,
  fetchAddresses,
  pathBatch,
  type LedgerPathStandard,
  type LedgerAddressEntry,
} from '../lib/ledger';

const PAGE_SIZE = 5;

export interface LedgerPickerSubmit {
  selected: LedgerAddressEntry[];
}

export function LedgerPicker({
  onSubmit,
  submitLabel,
  submitting = false,
}: {
  onSubmit: (s: LedgerPickerSubmit) => void;
  submitLabel: string;
  submitting?: boolean;
}) {
  const [standard, setStandard] = useState<LedgerPathStandard>('live');
  const [pageStart, setPageStart] = useState(0);
  const [entries, setEntries] = useState<LedgerAddressEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
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
    setSelected((prev) => ({ ...prev, [path]: !prev[path] }));
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
    const picked = entries.filter((e) => selected[e.derivationPath]);
    if (picked.length === 0) {
      setError('Pick at least one address');
      return;
    }
    onSubmit({ selected: picked });
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="stack stack-sm">
      <div className="row gap-xs" style={{ flexWrap: 'wrap' }}>
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
      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        {standard === 'live' ? "m/44'/60'/x'/0/0" : "m/44'/60'/0'/x"}
      </p>

      {phase === 'idle' && (
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => void connectAndLoad(standard, 0)}
        >
          {busy ? 'Connecting...' : 'Connect Ledger'}
        </button>
      )}

      {phase !== 'idle' && (
        <div className="card-form" style={{ padding: 8 }}>
          <div className="stack stack-xs">
            {busy ? (
              // Loading rows: show new indexes immediately so the user knows the
              // page changed, but never display stale addresses. Each row holds
              // an inline spinner + Loading… text so it doesn't look blank.
              Array.from({ length: PAGE_SIZE }).map((_, idx) => (
                <div key={`sk-${pageStart + idx}`} className="ledger-row" data-loading="true">
                  <span className="ledger-row-idx">#{pageStart + idx}</span>
                  <span className="ledger-row-loading">
                    <span className="spinner-inline" />
                    <span>Loading…</span>
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
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                No addresses loaded
              </p>
            )}
          </div>

          <div className="row row-between" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy || pageStart === 0}
              onClick={() => changePage(-PAGE_SIZE)}
              style={{ fontSize: 11 }}
            >&larr; Prev</button>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              #{pageStart}–#{pageStart + PAGE_SIZE - 1}
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => changePage(PAGE_SIZE)}
              style={{ fontSize: 11 }}
            >Next &rarr;</button>
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {phase === 'loaded' && (
        <button
          type="button"
          className="btn-primary"
          disabled={submitting || selectedCount === 0}
          onClick={submit}
        >
          {submitting ? 'Saving...' : `${submitLabel}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        </button>
      )}
    </div>
  );
}
