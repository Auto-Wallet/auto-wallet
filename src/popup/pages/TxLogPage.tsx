import React, { useState, useEffect } from 'react';
import { callBackground } from '../api';
import type { TxLogEntry } from '../../lib/tx-logger';
import type { Network } from '../../types/network';

export function TxLogPage() {
  const [log, setLog] = useState<TxLogEntry[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);

  useEffect(() => { loadLog(); }, []);

  async function loadLog() {
    const [entries, nets] = await Promise.all([
      callBackground<TxLogEntry[]>('getTxLog'),
      callBackground<Network[]>('getNetworks'),
    ]);
    setLog(entries);
    setNetworks(nets);
  }

  function getExplorerUrl(chainId: number, hash: string): string | null {
    const net = networks.find((n) => n.chainId === chainId);
    if (!net?.blockExplorerUrl) return null;
    return `${net.blockExplorerUrl}/tx/${hash}`;
  }

  async function clearLog() {
    await callBackground('clearTxLog');
    setLog([]);
  }

  return (
    <div className="stack stack-sm animate-in">
      <div className="row row-between">
        <p className="page-title">Transaction Log</p>
        {log.length > 0 && (
          <button onClick={clearLog} className="btn-ghost danger">Clear</button>
        )}
      </div>

      {log.length === 0 && (
        <div className="empty-state">No transactions yet</div>
      )}

      {log.map((entry) => {
        const explorerUrl = entry.hash ? getExplorerUrl(entry.chainId, entry.hash) : null;
        return (
          <div key={entry.id} className="card">
            <div className="row row-between" style={{ marginBottom: 8 }}>
              <span className={`badge ${entry.autoSigned ? 'badge-auto' : 'badge-manual'}`}>
                {entry.autoSigned ? 'Auto' : 'Manual'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="rule-detail">
              <div className="truncate">to: {entry.to}</div>
              {entry.hash && (
                <div className="truncate">
                  tx:{' '}
                  {explorerUrl ? (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="tx-link">
                      {entry.hash.slice(0, 18)}...{entry.hash.slice(-8)} &#8599;
                    </a>
                  ) : (
                    entry.hash
                  )}
                </div>
              )}
            </div>
            <div className="row row-between" style={{ marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>chain {entry.chainId}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }} className="truncate">{entry.origin}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
