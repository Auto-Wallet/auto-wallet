import React from 'react';
import { LedgerBadge } from './LedgerBadge';
import type { AccountSource } from '../lib/key-manager.core';

export function AccountBadge({
  source,
  size = 12,
}: {
  source?: AccountSource;
  size?: number;
}) {
  if (source === 'ledger') {
    return <LedgerBadge size={size} title="Ledger hardware wallet" />;
  }

  if (source === 'watchOnly') {
    return (
      <span className="account-type-badge watch-only" title="Watch-only address (read only)" aria-label="Watch-only address">
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" />
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
          </g>
        </svg>
      </span>
    );
  }

  if (source === 'mnemonic') {
    return (
      <span className="account-type-badge mnemonic" title="Mnemonic account" aria-label="Mnemonic account">
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4a4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3M4 9a5 5 0 0 1 8 4a5 5 0 0 1-8-4m1 12h14" />
        </svg>
      </span>
    );
  }

  return (
    <span className="account-type-badge private-key" title="Private key account" aria-label="Private key account">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <path fill="currentColor" d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
          <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
        </g>
      </svg>
    </span>
  );
}
