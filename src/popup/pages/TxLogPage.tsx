import React, { useState, useEffect } from 'react';
import { callBackground } from '../api';
import type { TxLogEntry } from '../../lib/tx-logger';
import type { Network } from '../../types/network';
import { ExternalLinkIcon } from '../icons';

const GWEI = 1_000_000_000n;
const ETHER = 1_000_000_000_000_000_000n;

function formatNative(wei: string | undefined, decimals = 18): string {
  if (!wei) return '—';
  try {
    const n = BigInt(wei);
    if (n === 0n) return '0';
    const divisor = 10n ** BigInt(decimals);
    const whole = n / divisor;
    const remainder = n % divisor;
    if (remainder === 0n) return whole.toString();
    const fracStr = remainder.toString().padStart(decimals, '0').slice(0, 8).replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch { return '—'; }
}

function formatGwei(wei: string | undefined): string {
  if (!wei) return '—';
  try {
    const n = BigInt(wei);
    const whole = n / GWEI;
    const remainder = n % GWEI;
    if (remainder === 0n) return `${whole}`;
    const fracStr = remainder.toString().padStart(9, '0').slice(0, 4).replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : `${whole}`;
  } catch { return '—'; }
}

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

  function getSymbol(chainId: number): string {
    return networks.find((n) => n.chainId === chainId)?.symbol ?? '';
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
        const symbol = getSymbol(entry.chainId);
        const requestedPrice = entry.maxFeePerGas ?? entry.gasPrice;
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
                      {entry.hash.slice(0, 18)}...{entry.hash.slice(-8)}
                      <ExternalLinkIcon size={11} className="tx-link-icon" />
                    </a>
                  ) : (
                    entry.hash
                  )}
                </div>
              )}
              {(entry.gasLimit || requestedPrice) && (
                <div className="truncate">
                  requested: {entry.gasLimit ?? '?'} gas
                  {requestedPrice ? ` @ ${formatGwei(requestedPrice)} gwei` : ''}
                  {entry.maxPriorityFeePerGas ? ` (tip ${formatGwei(entry.maxPriorityFeePerGas)})` : ''}
                </div>
              )}
              {entry.feeWei && (
                <div className="truncate">
                  paid: {formatNative(entry.feeWei)} {symbol}
                  {entry.gasUsed ? ` · ${entry.gasUsed} gas` : ''}
                  {entry.effectiveGasPrice ? ` @ ${formatGwei(entry.effectiveGasPrice)} gwei` : ''}
                </div>
              )}
            </div>
            <div className="row row-between" style={{ marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                chain {entry.chainId} · {entry.status}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }} className="truncate">{entry.origin}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
