import React from 'react';

export function LedgerBadge({ size = 11, title }: { size?: number; title?: string }) {
  return (
    <span className="ledger-badge" title={title ?? 'Ledger hardware wallet'} aria-label="Ledger">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M0 17.59V24h9.85v-1.43H1.43v-4.98H0zm22.57 0v4.98h-8.42V24H24v-6.41h-1.43zM9.86 7.4v9.21h4.27V15.3h-2.84V7.4H9.86zM0 0v6.4h1.43V1.43h8.42V0H0zm14.15 0v1.43h8.42V6.4H24V0h-9.85z"/>
      </svg>
    </span>
  );
}
