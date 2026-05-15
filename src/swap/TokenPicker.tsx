import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon, SearchIcon, StarIcon } from '../popup/icons';
import { isEvmChainId, type MergedChain, type MergedToken, type ProviderId } from '../lib/swap';
import { callBackground } from '../popup/api';

export interface PickerSelection {
  chainId: number;
  token: MergedToken;
}

interface Props {
  title: string;
  chains: MergedChain[];
  tokensByChain: Map<number, MergedToken[]>;
  /** When provided, restrict chains to this list. */
  allowedChainIds?: Set<number>;
  /**
   * When true, the picker lazily fetches user balances for tokens on the
   * currently-selected chain and shows them on the right. Use for the FROM
   * side; the TO side doesn't need balances.
   */
  showBalances?: boolean;
  ownerAddress?: string;
  onClose: () => void;
  onPick: (sel: PickerSelection) => void;
}

const ALL_CHAINS = -1;

interface BalanceInfo {
  raw: bigint;
  formatted: string;
}

export function TokenPicker({
  title, chains, tokensByChain, allowedChainIds, showBalances, ownerAddress, onClose, onPick,
}: Props) {
  const [chainQuery, setChainQuery] = useState('');
  const [tokenQuery, setTokenQuery] = useState('');
  const [selectedChainId, setSelectedChainId] = useState<number>(ALL_CHAINS);
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [starredLoaded, setStarredLoaded] = useState(false);
  // Keyed by `${chainId}:${tokenContractAddress}`
  const [balances, setBalances] = useState<Map<string, BalanceInfo>>(new Map());

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load persisted starred chains once.
  useEffect(() => {
    (async () => {
      try {
        const ids = await callBackground<number[]>('getStarredSwapChains');
        setStarred(new Set(ids ?? []));
      } catch {
        // Storage unreachable — leave empty.
      } finally {
        setStarredLoaded(true);
      }
    })();
  }, []);

  function toggleStar(chainId: number) {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      // Fire-and-forget persist; failure here is non-fatal.
      callBackground('setStarredSwapChains', { chainIds: Array.from(next) }).catch(() => {});
      return next;
    });
  }

  const visibleChains = useMemo(() => {
    const q = chainQuery.trim().toLowerCase();
    return chains
      .filter((c) => isEvmChainId(c.chainId))
      .filter((c) => !allowedChainIds || allowedChainIds.has(c.chainId))
      .filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [chains, chainQuery, allowedChainIds]);

  const starredChains = useMemo(() => {
    if (starred.size === 0) return [];
    return visibleChains.filter((c) => starred.has(c.chainId));
  }, [visibleChains, starred]);

  const azChains = useMemo(() => {
    return [...visibleChains]
      .filter((c) => !starred.has(c.chainId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleChains, starred]);

  const visibleTokens = useMemo<{ chainId: number; chainName: string; token: MergedToken }[]>(() => {
    const q = tokenQuery.trim().toLowerCase();
    const isAddrSearch = q.startsWith('0x') && q.length >= 6;
    const chainsToShow = selectedChainId === ALL_CHAINS
      ? visibleChains
      : visibleChains.filter((c) => c.chainId === selectedChainId);

    const out: { chainId: number; chainName: string; token: MergedToken }[] = [];
    for (const c of chainsToShow) {
      const tokens = tokensByChain.get(c.chainId) ?? [];
      for (const t of tokens) {
        if (q) {
          const matchAddr = isAddrSearch && t.address.toLowerCase().includes(q);
          const matchSymbol = t.symbol.toLowerCase().includes(q);
          const matchName = t.name.toLowerCase().includes(q);
          if (!matchAddr && !matchSymbol && !matchName) continue;
        }
        out.push({ chainId: c.chainId, chainName: c.name, token: t });
      }
    }
    return out;
  }, [tokensByChain, visibleChains, selectedChainId, tokenQuery]);

  /**
   * Lazy-load balances for tokens on the currently-selected chain via
   * multicall3 (one round-trip for all ERC20s + one native call). Skipped for
   * 'All Chains' to avoid querying every supported chain at once.
   *
   * `fetchedRef` is per-chain so switching chains triggers a fresh fetch
   * without re-fetching the chain you came from.
   */
  const fetchedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!showBalances || !ownerAddress) return;
    if (selectedChainId === ALL_CHAINS) return;
    if (fetchedRef.current.has(selectedChainId)) return;
    const tokens = (tokensByChain.get(selectedChainId) ?? []).slice(0, 50);
    if (tokens.length === 0) return;
    fetchedRef.current.add(selectedChainId);
    let cancelled = false;
    (async () => {
      try {
        const results = await callBackground<Array<{ address: string; balance: string; balanceRaw: string }>>(
          'getBalancesBatch',
          {
            chainId: selectedChainId,
            owner: ownerAddress,
            tokens: tokens.map((t) => ({ address: t.address, decimals: t.decimals })),
          },
        );
        if (cancelled) return;
        setBalances((prev) => {
          const next = new Map(prev);
          for (const r of results) {
            const raw = BigInt(r.balanceRaw);
            if (raw === 0n) continue;
            const key = `${selectedChainId}:${r.address.toLowerCase()}`;
            next.set(key, { raw, formatted: r.balance });
          }
          return next;
        });
      } catch {
        // Drop the marker so the next selection retries.
        fetchedRef.current.delete(selectedChainId);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedChainId, tokensByChain, showBalances, ownerAddress]);

  function renderChainRow(c: MergedChain) {
    const active = c.chainId === selectedChainId;
    const isStarred = starred.has(c.chainId);
    return (
      <div key={c.chainId} className={`tp-chain-row ${active ? 'is-active' : ''}`}>
        <button
          type="button"
          className="tp-chain-row-main"
          onClick={() => setSelectedChainId(c.chainId)}
        >
          <ChainLogo logo={c.logo} symbol={c.nativeSymbol || c.name} size={20} />
          <span className="tp-chain-name">{c.name}</span>
          <ProviderBadges providers={c.providers} compact />
        </button>
        <button
          type="button"
          className={`tp-chain-star-btn ${isStarred ? 'is-starred' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleStar(c.chainId); }}
          aria-label={isStarred ? 'Unstar chain' : 'Star chain'}
          title={isStarred ? 'Unstar chain' : 'Star chain'}
        >
          <StarIcon size={12} />
        </button>
      </div>
    );
  }

  const showStarredSection = starredLoaded && starredChains.length > 0;

  return (
    <div className="tp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tp-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="tp-header">
          <span className="tp-title">{title}</span>
          <button onClick={onClose} className="tp-close" aria-label="Close">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="tp-body">
          {/* Left: chains */}
          <div className="tp-chains">
            <div className="tp-search">
              <SearchIcon size={12} />
              <input
                type="text"
                placeholder="Search chains"
                value={chainQuery}
                onChange={(e) => setChainQuery(e.target.value)}
              />
            </div>

            <button
              type="button"
              className={`tp-chain-row tp-all ${selectedChainId === ALL_CHAINS ? 'is-active' : ''}`}
              onClick={() => setSelectedChainId(ALL_CHAINS)}
            >
              <span className="tp-all-icon">⊞</span>
              <span className="tp-chain-name">All Chains</span>
            </button>

            {showStarredSection && (
              <>
                <div className="tp-section-label">
                  <StarIcon size={9} /> Starred Chains
                </div>
                {starredChains.map((c) => renderChainRow(c))}
              </>
            )}

            {azChains.length > 0 && (
              <>
                <div className="tp-section-label tp-muted">Chains A-Z</div>
                {azChains.map((c) => renderChainRow(c))}
              </>
            )}
          </div>

          {/* Right: tokens */}
          <div className="tp-tokens">
            <div className="tp-search tp-search-wide">
              <SearchIcon size={12} />
              <input
                type="text"
                placeholder="Search for a token or paste address"
                value={tokenQuery}
                onChange={(e) => setTokenQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className="tp-tokens-list">
              {visibleTokens.length === 0 ? (
                <div className="tp-empty">No tokens match your search.</div>
              ) : (
                visibleTokens.slice(0, 200).map(({ chainId, chainName, token }) => {
                  const key = `${chainId}:${token.address.toLowerCase()}`;
                  const bal = balances.get(key);
                  return (
                    <button
                      key={`${chainId}:${token.address}`}
                      type="button"
                      className="tp-token-row"
                      onClick={() => onPick({ chainId, token })}
                    >
                      <div className="tp-token-icon-wrap">
                        <TokenLogo url={token.logo} symbol={token.symbol} size={32} />
                      </div>
                      <div className="tp-token-info">
                        <div className="tp-token-symbol-row">
                          <span className="tp-token-symbol">{token.symbol}</span>
                          <ProviderBadges providers={token.providers} compact />
                        </div>
                        <div className="tp-token-sub">
                          <span>{chainName}</span>
                          <span className="tp-token-addr">{shortAddress(token.address)}</span>
                        </div>
                      </div>
                      <div className="tp-token-right">
                        {bal ? (
                          <>
                            <div className="tp-token-balance">{formatBalance(bal.formatted)}</div>
                            <div className="tp-token-balance-sub">{token.symbol}</div>
                          </>
                        ) : (
                          <span className="tp-token-balance-empty">{' '}</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderBadges({ providers, compact }: { providers: ProviderId[]; compact?: boolean }) {
  // Two dot-badges, "X" + "R". The dim variant means the provider doesn't
  // support this chain/token. Hover title spells it out.
  const has = (id: ProviderId) => providers.includes(id);
  return (
    <span className={`tp-provider-badges ${compact ? 'is-compact' : ''}`}>
      <span
        className={`tp-provider-dot is-x ${has('xflows') ? 'is-on' : ''}`}
        title={has('xflows') ? 'Supported by XFlows' : 'Not on XFlows'}
      >
        X
      </span>
      <span
        className={`tp-provider-dot is-r ${has('relay') ? 'is-on' : ''}`}
        title={has('relay') ? 'Supported by Relay' : 'Not on Relay'}
      >
        R
      </span>
    </span>
  );
}

function ChainLogo({ logo, symbol, size = 20 }: { logo: string; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed || !logo) {
    return (
      <div className="tp-chain-fallback" style={{ width: size, height: size, fontSize: size * 0.45 }}>
        {symbol.slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      src={logo}
      alt={symbol}
      width={size}
      height={size}
      className="tp-chain-logo"
      onError={() => setFailed(true)}
    />
  );
}

function TokenLogo({ url, symbol, size = 32 }: { url: string; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed || !url) {
    const hue = symbol.split('').reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    return (
      <div
        className="tp-token-fallback"
        style={{
          width: size, height: size, borderRadius: size / 2,
          background: `hsl(${hue}, 50%, 92%)`, color: `hsl(${hue}, 55%, 38%)`,
          fontSize: size * 0.36,
        }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={symbol}
      width={size}
      height={size}
      className="tp-token-logo"
      onError={() => setFailed(true)}
    />
  );
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatBalance(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n) || n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (n >= 0.0001) return n.toFixed(6).replace(/\.?0+$/, '');
  return n.toExponential(2);
}
