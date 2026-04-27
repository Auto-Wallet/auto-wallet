import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MSG_SOURCE } from '../types/messages';
import { FeeEditor, type FeeOverride, type FeeEditorRequest } from '../popup/FeeEditor';
import '../popup/styles.css';

interface PendingRequest {
  id: string;
  method: string;
  origin: string;
  params: any;
  signerAddress?: string;
  chainId?: number;
}

function ConfirmPage() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [addToWhitelist, setAddToWhitelist] = useState(false);
  const [feeOverride, setFeeOverride] = useState<FeeOverride | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('id');
    if (requestId) {
      const key = `confirm_${requestId}`;
      chrome.storage.session.get(key, (result) => {
        if (result[key]) setRequest(result[key]);
      });
    }
  }, []);

  function approve() {
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

  return (
    <div className="confirm-shell">
      {/* Header */}
      <header className="confirm-header">
        <img src="icons/icon48.png" alt="" style={{ width: 24, height: 24 }} />
        <span className="confirm-header-title">Confirm Request</span>
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

        {/* Fee editor */}
        {feeRequest && (
          <FeeEditor
            request={feeRequest}
            prefill={{
              gas: tx.gas ?? tx.gasLimit,
              maxFeePerGas: tx.maxFeePerGas,
              maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
              gasPrice: tx.gasPrice,
            }}
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
              {typeof request.params?.[1] === 'string'
                ? request.params[1]
                : JSON.stringify(request.params?.[1], null, 2)}
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

        {/* Whitelist toggle */}
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

        {/* Warning */}
        <div className="confirm-warning" style={{ fontSize: 11 }}>
          {addToWhitelist
            ? 'This domain will be added to your auto-sign whitelist.'
            : 'This request is not in your whitelist. Review carefully.'}
        </div>
      </main>

      {/* Footer */}
      <footer className="confirm-footer">
        <button onClick={reject} className="btn-secondary" style={{ flex: 1 }}>
          Reject
        </button>
        <button onClick={approve} className="btn-primary" style={{ flex: 1 }}>
          Approve
        </button>
      </footer>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<ConfirmPage />);
