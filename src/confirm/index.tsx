import '../lib/node-polyfills';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MSG_SOURCE } from '../types/messages';
import { FeeEditor, type FeeOverride, type FeeEditorRequest } from '../popup/FeeEditor';
import { LedgerBadge } from '../popup/LedgerBadge';
import {
  signTransaction as ledgerSignTransaction,
  signPersonalMessage as ledgerSignPersonalMessage,
  signTypedDataHashed as ledgerSignTypedDataHashed,
} from '../lib/ledger';
import { buildSignedRawTx, hydrateTx, type SerializedTxJSON } from '../popup/ledger-signer';
import { serializeTransaction, type TransactionSerializable } from 'viem';
import '../popup/styles.css';

interface LedgerCtx {
  derivationPath: string;
  txJson?: SerializedTxJSON;
  messageHex?: string;
  domainSeparator?: `0x${string}`;
  hashStructMessage?: `0x${string}`;
}

type SimulatedTokenChange = {
  key: string;
  symbol: string;
  name?: string;
  address?: string;
  rawDelta: string;
  formattedDelta: string;
  direction: 'in' | 'out';
};

type SimulationPreview = {
  status: 'success' | 'failed' | 'unavailable';
  error?: string;
  gasUsed?: string;
  changes: SimulatedTokenChange[];
};

interface PendingRequest {
  id: string;
  method: string;
  origin: string;
  params: any;
  signerAddress?: string;
  chainId?: number;
  ledger?: LedgerCtx;
  simulation?: SimulationPreview;
}

function prettyTypedData(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function shortAddress(value?: string): string {
  if (!value) return '';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function SimulationChanges({ simulation }: { simulation?: SimulationPreview }) {
  if (!simulation) return null;

  if (simulation.status === 'unavailable') {
    return (
      <div className="card" style={{ padding: 12 }}>
        <div className="confirm-row" style={{ alignItems: 'center' }}>
          <span className="confirm-label" style={{ marginBottom: 0 }}>Simulation</span>
          <span className="simulation-pill unavailable">Unavailable</span>
        </div>
        {simulation.error && (
          <p className="simulation-note">{simulation.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="confirm-row" style={{ alignItems: 'center', marginBottom: 8 }}>
        <span className="confirm-label" style={{ marginBottom: 0 }}>Simulated Token Changes</span>
        <span className={`simulation-pill ${simulation.status}`}>
          {simulation.status === 'success' ? 'Success' : 'Failed'}
        </span>
      </div>
      {simulation.error && (
        <p className="simulation-note">{simulation.error}</p>
      )}
      {simulation.changes.length > 0 ? (
        <div className="simulation-list">
          {simulation.changes.map((change) => (
            <div key={change.key} className="simulation-change-row">
              <div className="simulation-token">
                <span className={`simulation-token-dot ${change.direction}`} />
                <div>
                  <span className="simulation-token-symbol">{change.symbol}</span>
                  {change.address && (
                    <span className="simulation-token-address mono">{shortAddress(change.address)}</span>
                  )}
                </div>
              </div>
              <span className={`simulation-delta ${change.direction}`}>
                {change.formattedDelta}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="simulation-note">No token balance changes detected.</p>
      )}
      {simulation.gasUsed && (
        <p className="simulation-note">Estimated gas used: {simulation.gasUsed}</p>
      )}
    </div>
  );
}

function ConfirmPage() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [addToWhitelist, setAddToWhitelist] = useState(false);
  const [feeOverride, setFeeOverride] = useState<FeeOverride | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('id');
    if (requestId) {
      const key = `confirm_${requestId}`;
      chrome.storage.session.get(key, (result) => {
        const stored = result[key] as PendingRequest | undefined;
        if (stored) setRequest(stored);
      });
    }
  }, []);

  function applyFeeToTxJson(json: SerializedTxJSON, fee: FeeOverride | null): SerializedTxJSON {
    if (!fee) return json;
    const next: SerializedTxJSON = { ...json };
    if (fee.gas) next.gas = fee.gas;
    if (fee.type === 'eip1559') {
      next.type = 'eip1559';
      if (fee.maxFeePerGas) next.maxFeePerGas = fee.maxFeePerGas;
      if (fee.maxPriorityFeePerGas) next.maxPriorityFeePerGas = fee.maxPriorityFeePerGas;
      next.gasPrice = undefined;
    } else if (fee.type === 'legacy') {
      next.type = 'legacy';
      if (fee.gasPrice) next.gasPrice = fee.gasPrice;
      next.maxFeePerGas = undefined;
      next.maxPriorityFeePerGas = undefined;
    }
    return next;
  }

  async function approve() {
    setError('');
    const ledger = request?.ledger;
    if (!ledger) {
      // Software signing happens server-side
      chrome.runtime.sendMessage({
        source: MSG_SOURCE,
        type: 'confirm_response',
        requestId: request?.id,
        approved: true,
        addToWhitelist,
        origin: request?.origin,
        feeOverride: request?.method === 'eth_sendTransaction' ? feeOverride : null,
      });
      window.close();
      return;
    }

    // Ledger signing in this window
    try {
      setBusy(true);
      let signedRawTx: `0x${string}` | null = null;
      let signature: `0x${string}` | null = null;

      if (request!.method === 'eth_sendTransaction' && ledger.txJson) {
        setBusyMsg('Confirm on your Ledger device…');
        const finalTx = applyFeeToTxJson(ledger.txJson, feeOverride);
        // Re-serialize unsigned hex with the (potentially edited) fee values
        const unsignedHex = serializeTransaction(hydrateTx(finalTx) as TransactionSerializable)
          .replace(/^0x/, '');
        const sig = await ledgerSignTransaction(ledger.derivationPath, unsignedHex);
        signedRawTx = buildSignedRawTx(finalTx, sig);
      } else if ((request!.method === 'personal_sign' || request!.method === 'eth_sign') && ledger.messageHex) {
        setBusyMsg('Confirm on your Ledger device…');
        signature = await ledgerSignPersonalMessage(ledger.derivationPath, ledger.messageHex);
      } else if (
        (request!.method === 'eth_signTypedData_v4' || request!.method === 'eth_signTypedData') &&
        ledger.domainSeparator && ledger.hashStructMessage
      ) {
        setBusyMsg('Confirm on your Ledger device (blind sign typed data)…');
        signature = await ledgerSignTypedDataHashed(
          ledger.derivationPath, ledger.domainSeparator, ledger.hashStructMessage,
        );
      } else {
        throw new Error('Ledger context is missing required fields for this method');
      }

      chrome.runtime.sendMessage({
        source: MSG_SOURCE,
        type: 'confirm_response',
        requestId: request!.id,
        approved: true,
        addToWhitelist: false,    // ledger always requires user; whitelist is meaningless
        origin: request!.origin,
        signedRawTx,
        signature,
      });
      window.close();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
      setBusyMsg('');
    }
  }

  function reject() {
    chrome.runtime.sendMessage({
      source: MSG_SOURCE,
      type: 'confirm_response',
      requestId: request?.id,
      approved: false,
    });
    window.close();
  }

  if (!request) {
    return (
      <div className="confirm-shell">
        <div className="loading-page"><div className="spinner" /></div>
      </div>
    );
  }

  const tx = request.params?.[0] ?? {};
  const isLedger = !!request.ledger;
  const isTransaction = request.method === 'eth_sendTransaction';
  const isPersonalSign = request.method === 'personal_sign' || request.method === 'eth_sign';
  const isTypedData = request.method === 'eth_signTypedData_v4' || request.method === 'eth_signTypedData';
  const isAddChain = request.method === 'wallet_addEthereumChain';

  const value = tx.value ? (parseInt(tx.value, 16) / 1e18).toFixed(6) : '0';
  const to = tx.to ?? 'Contract creation';
  const calldata = tx.data;
  const methodSig = calldata?.slice(0, 10) ?? '-';

  // Extract domain from origin
  let domain = request.origin;
  try { domain = new URL(request.origin).hostname; } catch {}

  const feeRequest: FeeEditorRequest | null = isTransaction
    ? { to: tx.to, from: tx.from, data: tx.data, value: tx.value }
    : null;

  // For Ledger sends, prefill FeeEditor from the prepared tx (which already has resolved fees).
  const ledgerTxJson = request.ledger?.txJson;
  const feePrefill = isTransaction
    ? (ledgerTxJson
        ? {
            gas: ledgerTxJson.gas ? `0x${BigInt(ledgerTxJson.gas).toString(16)}` : undefined,
            maxFeePerGas: ledgerTxJson.maxFeePerGas ? `0x${BigInt(ledgerTxJson.maxFeePerGas).toString(16)}` : undefined,
            maxPriorityFeePerGas: ledgerTxJson.maxPriorityFeePerGas ? `0x${BigInt(ledgerTxJson.maxPriorityFeePerGas).toString(16)}` : undefined,
            gasPrice: ledgerTxJson.gasPrice ? `0x${BigInt(ledgerTxJson.gasPrice).toString(16)}` : undefined,
          }
        : {
            gas: tx.gas ?? tx.gasLimit,
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
            gasPrice: tx.gasPrice,
          })
    : undefined;

  return (
    <div className="confirm-shell">
      {/* Header */}
      <header className="confirm-header">
        <img src="icons/icon48.png" alt="" style={{ width: 24, height: 24 }} />
        <span className="confirm-header-title">
          {isLedger && <LedgerBadge title="Ledger hardware wallet" />}
          Confirm Request
        </span>
      </header>

      {/* Body */}
      <main className="confirm-body">
        {/* Origin */}
        <div className="confirm-origin">
          <span className="confirm-origin-dot" />
          <span className="confirm-origin-text">{domain}</span>
        </div>

        {/* Signer info */}
        {(request.signerAddress || request.chainId) && (
          <div className="card" style={{ padding: '8px 12px' }}>
            <div className="confirm-row">
              {request.signerAddress && (
                <div className="confirm-field" style={{ marginBottom: 0 }}>
                  <span className="confirm-label">Signer</span>
                  <span className="confirm-value mono" style={{ fontSize: 10 }}>
                    {isLedger && <LedgerBadge title="Ledger hardware wallet" />}
                    {request.signerAddress.slice(0, 8)}...{request.signerAddress.slice(-6)}
                  </span>
                </div>
              )}
              {request.chainId && (
                <div className="confirm-field" style={{ marginBottom: 0, textAlign: 'right' }}>
                  <span className="confirm-label">Chain</span>
                  <span className="confirm-value mono">{request.chainId}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Method badge */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <span className="badge" style={{
            background: 'var(--accent-subtle)', color: 'var(--accent)',
            border: '1px solid rgba(79,70,229,.15)', fontSize: 11, padding: '4px 12px',
          }}>
            {request.method}
          </span>
        </div>

        {/* Transaction details */}
        {isTransaction && (
          <div className="card" style={{ padding: 12 }}>
            <div className="confirm-field">
              <span className="confirm-label">To</span>
              <span className="confirm-value mono truncate">{to}</span>
            </div>
            <div className="confirm-row">
              <div className="confirm-field">
                <span className="confirm-label">Value</span>
                <span className="confirm-value-big">{value} ETH</span>
              </div>
              <div className="confirm-field" style={{ textAlign: 'right' }}>
                <span className="confirm-label">Method</span>
                <span className="confirm-value mono">{methodSig}</span>
              </div>
            </div>
            {calldata && calldata.length > 10 && (
              <div className="confirm-field">
                <span className="confirm-label">Data</span>
                <div className="confirm-data mono">{calldata}</div>
              </div>
            )}
          </div>
        )}

        {isTransaction && <SimulationChanges simulation={request.simulation} />}

        {/* Fee editor */}
        {feeRequest && (
          <FeeEditor
            request={feeRequest}
            prefill={feePrefill}
            onChange={setFeeOverride}
          />
        )}

        {/* Personal sign */}
        {isPersonalSign && (
          <div className="card" style={{ padding: 12 }}>
            <span className="confirm-label">Message</span>
            <div className="confirm-data mono" style={{ marginTop: 6 }}>
              {request.params?.[0] ?? ''}
            </div>
          </div>
        )}

        {/* Typed data */}
        {isTypedData && (
          <div className="card" style={{ padding: 12 }}>
            <span className="confirm-label">Typed Data</span>
            <pre className="confirm-data mono" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
              {prettyTypedData(request.params?.[1])}
            </pre>
          </div>
        )}

        {/* Add chain details */}
        {isAddChain && (
          <div className="card" style={{ padding: 12 }}>
            <div className="confirm-field">
              <span className="confirm-label">Network Name</span>
              <span className="confirm-value">{tx.chainName}</span>
            </div>
            <div className="confirm-row">
              <div className="confirm-field">
                <span className="confirm-label">Chain ID</span>
                <span className="confirm-value mono">{tx.chainId}</span>
              </div>
              <div className="confirm-field" style={{ textAlign: 'right' }}>
                <span className="confirm-label">Symbol</span>
                <span className="confirm-value">{tx.symbol}</span>
              </div>
            </div>
            <div className="confirm-field" style={{ marginBottom: 0 }}>
              <span className="confirm-label">RPC URL</span>
              <span className="confirm-value mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>{tx.rpcUrl}</span>
            </div>
          </div>
        )}

        {/* Whitelist toggle (hidden for Ledger — auto-sign would be ineffective) */}
        {!isLedger && (
          <div className="card" style={{ padding: 12 }}>
            <div className="settings-row" style={{ padding: 0 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                  Trust this site
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  Auto-sign all future requests from <strong>{domain}</strong>
                </p>
              </div>
              <button
                onClick={() => setAddToWhitelist(!addToWhitelist)}
                className={`toggle ${addToWhitelist ? 'on' : ''}`}
              >
                <span className="toggle-knob" />
              </button>
            </div>
          </div>
        )}

        {isLedger && (
          <div className="confirm-warning" style={{ fontSize: 11 }}>
            <LedgerBadge title="Ledger hardware wallet" /> Approve and confirm on your Ledger device. Make sure the Ethereum app is open.
          </div>
        )}

        {/* Warning */}
        {!isLedger && (
          <div className="confirm-warning" style={{ fontSize: 11 }}>
            {addToWhitelist
              ? 'This domain will be added to your auto-sign whitelist.'
              : 'This request is not in your whitelist. Review carefully.'}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        {busy && busyMsg && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>{busyMsg}</p>
        )}
      </main>

      {/* Footer */}
      <footer className="confirm-footer">
        <button onClick={reject} disabled={busy} className="btn-secondary" style={{ flex: 1 }}>
          Reject
        </button>
        <button onClick={approve} disabled={busy} className="btn-primary" style={{ flex: 1 }}>
          {busy ? 'Signing…' : 'Approve'}
        </button>
      </footer>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<ConfirmPage />);
