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
import {
  SettingsIcon, ChevronDownIcon, WalletIcon, ShieldCheckIcon, BookIcon, LinkIcon, ScrollIcon,
} from './icons';

type Page = 'loading' | 'setup' | 'unlock' | 'account' | 'whitelist' | 'addressBook' | 'networks' | 'txlog' | 'settings';

interface AccountInfo {
  id: string;
  label: string;
  address: string;
  type: 'private' | 'ledger';
  source: AccountSource;
  derivationPath?: string;
}

const NAV_ITEMS: { page: Page; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { page: 'account',     label: 'Wallet', Icon: WalletIcon },
  { page: 'whitelist',   label: 'Rules',  Icon: ShieldCheckIcon },
  { page: 'addressBook', label: 'Book',   Icon: BookIcon },
  { page: 'networks',    label: 'Chains', Icon: LinkIcon },
  { page: 'txlog',       label: 'Log',    Icon: ScrollIcon },
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
                <span className="account-trigger-label">
                  {activeAccount && <AccountBadge source={activeAccount.source} />}
                  {activeAccount?.label ?? 'Account'}
                </span>
                <span className="account-trigger-addr">{shortAddr}</span>
                <ChevronDownIcon size={10} className="account-trigger-chevron" />
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
              <SettingsIcon size={15} />
            </button>
          </div>

          {/* Row 2: Navigation tabs */}
          <nav className="header-row-nav">
            {NAV_ITEMS.map(({ page: p, label, Icon }) => (
              <button
                key={p}
                onClick={() => nav(p)}
                className={`nav-tab ${page === p ? 'active' : ''}`}
                aria-label={label}
              >
                <span className="nav-tab-icon"><Icon size={14} /></span>
                <span className="nav-tab-label">{label}</span>
              </button>
            ))}
          </nav>
        </header>
      )}

      <main className="app-main">
        {page === 'loading' && <div className="loading-page"><div className="spinner" /></div>}
        {page === 'setup' && <SetupPage onDone={() => nav('account')} />}
        {page === 'unlock' && <UnlockPage onUnlock={() => nav('account')} />}
        {page === 'account' && (
          activeAccount
            ? <AccountPage key={activeAccount.id} onLock={() => nav('unlock')} />
            : <div className="loading-page"><div className="spinner" /></div>
        )}
        {page === 'whitelist' && <WhitelistPage />}
        {page === 'addressBook' && <AddressBookPage />}
        {page === 'networks' && <NetworkPage />}
        {page === 'txlog' && <TxLogPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
