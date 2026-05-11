import React, { useState, useEffect, useRef } from 'react';
import { callBackground } from './api';
import { AccountPage } from './pages/AccountPage';
import { UnlockPage } from './pages/UnlockPage';
import { SetupPage } from './pages/SetupPage';
import { WhitelistPage } from './pages/WhitelistPage';
import { NetworkPage } from './pages/NetworkPage';
import { TxLogPage } from './pages/TxLogPage';
import { SettingsPage } from './pages/SettingsPage';
import { AddressBookPage } from './pages/AddressBookPage';
import { AccountMenu } from './pages/AccountMenu';
import { AccountBadge } from './AccountBadge';
import type { AccountSource } from '../lib/key-manager.core';

type Page = 'loading' | 'setup' | 'unlock' | 'account' | 'whitelist' | 'addressBook' | 'networks' | 'txlog' | 'settings';

interface AccountInfo {
  id: string;
  label: string;
  address: string;
  type: 'private' | 'ledger';
  source: AccountSource;
  derivationPath?: string;
}

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'account', label: 'Wallet' },
  { page: 'whitelist', label: 'Rules' },
  { page: 'addressBook', label: 'Book' },
  { page: 'networks', label: 'Chains' },
  { page: 'txlog', label: 'Log' },
];

function SettingsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0a2.34 2.34 0 0 0 3.319 1.915a2.34 2.34 0 0 1 2.33 4.033a2.34 2.34 0 0 0 0 3.831a2.34 2.34 0 0 1-2.33 4.033a2.34 2.34 0 0 0-3.319 1.915a2.34 2.34 0 0 1-4.659 0a2.34 2.34 0 0 0-3.32-1.915a2.34 2.34 0 0 1-2.33-4.033a2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('loading');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [activeAccount, setActiveAccount] = useState<AccountInfo | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const has = await callBackground<boolean>('hasWallet');
      if (!has) { setPage('setup'); return; }
      const unlocked = await callBackground<boolean>('isUnlocked');
      setPage(unlocked ? 'account' : 'unlock');
    })();
  }, []);

  useEffect(() => {
    if (page !== 'loading' && page !== 'setup' && page !== 'unlock') {
      refreshActiveAccount();
    }
  }, [page]);

  async function refreshActiveAccount() {
    try {
      const [accts, aId] = await Promise.all([
        callBackground<AccountInfo[]>('listAccounts'),
        callBackground<string>('getActiveAccountId'),
      ]);
      setActiveAccount(accts.find((a) => a.id === aId) ?? null);
    } catch {}
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    }
    if (showAccountMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAccountMenu]);

  const nav = (p: Page) => { setPage(p); setShowAccountMenu(false); };
  const showChrome = page !== 'loading' && page !== 'setup' && page !== 'unlock';

  const shortAddr = activeAccount
    ? `${activeAccount.address.slice(0, 6)}...${activeAccount.address.slice(-4)}`
    : '';

  return (
    <div className="app-shell">
      {showChrome && (
        <header className="app-header-wrap">
          {/* Row 1: Account selector */}
          <div className="header-row-account">
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowAccountMenu(!showAccountMenu)} className="account-trigger">
                <span className="account-trigger-dot" />
                <span className="account-trigger-label">
                  {activeAccount && <AccountBadge source={activeAccount.source} />}
                  {activeAccount?.label ?? 'Account'}
                </span>
                <span className="account-trigger-addr">{shortAddr}</span>
                <span className="account-trigger-chevron">&#9662;</span>
              </button>
              {showAccountMenu && (
                <AccountMenu
                  onSwitch={() => { setShowAccountMenu(false); refreshActiveAccount(); nav('account'); }}
                  onClose={() => setShowAccountMenu(false)}
                />
              )}
            </div>
            <button
              onClick={() => nav('settings')}
              className={`settings-icon-btn ${page === 'settings' ? 'active' : ''}`}
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon />
            </button>
          </div>

          {/* Row 2: Navigation tabs */}
          <nav className="header-row-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.page}
                onClick={() => nav(item.page)}
                className={`nav-tab ${page === item.page ? 'active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>
      )}

      <main className="app-main">
        {page === 'loading' && <div className="loading-page"><div className="spinner" /></div>}
        {page === 'setup' && <SetupPage onDone={() => nav('account')} />}
        {page === 'unlock' && <UnlockPage onUnlock={() => nav('account')} />}
        {page === 'account' && <AccountPage key={activeAccount?.id ?? 'none'} onLock={() => nav('unlock')} />}
        {page === 'whitelist' && <WhitelistPage />}
        {page === 'addressBook' && <AddressBookPage />}
        {page === 'networks' && <NetworkPage />}
        {page === 'txlog' && <TxLogPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
