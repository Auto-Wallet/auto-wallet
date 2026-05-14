import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../popup/styles.css';

function UnlockPopup() {
  const [origin, setOrigin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrigin(params.get('origin') ?? 'Unknown dApp');
  }, []);

  async function handleUnlock() {
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    setError('');
    try {
      // Send unlock request to background
      chrome.runtime.sendMessage(
        {
          source: 'auto-wallet',
          type: 'popup_request',
          id: crypto.randomUUID(),
          action: 'unlock',
          payload: { password },
        },
        (response) => {
          if (response?.error) {
            setError('Wrong password');
            setLoading(false);
          } else {
            // Notify background that unlock succeeded
            chrome.runtime.sendMessage({
              source: 'auto-wallet',
              type: 'unlock_response',
              success: true,
            });
          }
        },
      );
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  function handleReject() {
    chrome.runtime.sendMessage({
      source: 'auto-wallet',
      type: 'unlock_response',
      success: false,
    });
  }

  let domain = origin;
  try { domain = new URL(origin).hostname; } catch {}

  return (
    <div className="confirm-shell">
      <header className="confirm-header">
        <img src="icons/icon48.png" alt="" style={{ width: 24, height: 24 }} />
        <span className="confirm-header-title">Unlock Wallet</span>
      </header>

      <main className="confirm-body" style={{ justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <img src="icons/icon128.png" alt="Auto Wallet" style={{ width: 56, height: 56, marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong>{domain}</strong> wants to connect.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Enter your password to unlock.
          </p>
        </div>

        <input
          type="password"
          className="input-field"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          style={{ textAlign: 'center', fontFamily: 'var(--font-sans)' }}
          autoFocus
        />

        {error && <p className="error-text" style={{ textAlign: 'center' }}>{error}</p>}
      </main>

      <footer className="confirm-footer">
        <button onClick={handleReject} className="btn-secondary" style={{ flex: 1 }}>
          Reject
        </button>
        <button onClick={handleUnlock} disabled={loading} className="btn-primary" style={{ flex: 1 }}>
          {loading ? 'Unlocking...' : 'Unlock'}
        </button>
      </footer>
    </div>
  );
}

import { initTheme } from '../popup/theme';
initTheme();

const root = createRoot(document.getElementById('root')!);
root.render(<UnlockPopup />);
