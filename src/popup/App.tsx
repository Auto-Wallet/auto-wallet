import React, { useState, useEffect, useRef } from 'react';
import { callBackground } from './api';
import { AccountPage } from './pages/AccountPage';
import { UnlockPage } from './pages/UnlockPage';
import { SetupPage } from './pages/SetupPage';
import { WhitelistPage } from './pages/WhitelistPage';
import { NetworkPage } from './pages/NetworkPage';
import { TxLogPage } from './pages/TxLogPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountMenu } from './pages/AccountMenu';

type Page = 'loading' | 'setup' | 'unlock' | 'account' | 'whitelist' | 'networks' | 'txlog' | 'settings';

interface AccountInfo { id: string; label: string; address: string; }

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'account', label: 'Wallet' },
  { page: 'whitelist', label: 'Rules' },
  { page: 'networks', label: 'Chains' },
  { page: 'txlog', label: 'Log' },
  { page: 'settings', label: 'Settings' },
];

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
                <span className="account-trigger-label">{activeAccount?.label ?? 'Account'}</span>
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
        {page === 'account' && <AccountPage onLock={() => nav('unlock')} />}
        {page === 'whitelist' && <WhitelistPage />}
        {page === 'networks' && <NetworkPage />}
        {page === 'txlog' && <TxLogPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
