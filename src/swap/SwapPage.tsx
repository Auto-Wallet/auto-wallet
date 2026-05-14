import React, { useEffect, useMemo, useRef, useState } from 'react';
import { callBackground } from '../popup/api';
import { ArrowDownIcon, ChevronDownIcon, ExternalLinkIcon, RefreshIcon } from '../popup/icons';
import {
  buildTx as xfBuildTx,
  getQuote,
  getStatus,
  getSupportedChains,
  getSupportedTokens,
  isEvmChain,
  isNativeToken,
  type XfChain,
  type XfQuote,
  type XfStatus,
  type XfToken,
} from '../lib/xflows';
import { TokenPicker, type PickerSelection } from './TokenPicker';
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits, toHex } from 'viem';
import type { Network } from '../types/network';

interface ActiveInfo {
  id: string;
  label: string;
  address: string;
  type: 'private' | 'ledger';
  derivationPath?: string;
}

interface Selection {
  chain: XfChain;
  token: XfToken;
}

type PickerSide = 'from' | 'to' | null;

type SwapStage =
  | { kind: 'idle' }
  | { kind: 'approving'; allowanceTx?: string }
  | { kind: 'swapping' }
  | { kind: 'submitted'; hash: string }
  | { kind: 'error'; message: string };

// XFlows uses 1% default; matches typical swap UIs.
const DEFAULT_SLIPPAGE = 0.01;
const SLIPPAGE_OPTIONS = [0.005, 0.01, 0.03];

// Max uint256 — used as the approve amount so the user only has to authorize
// the spender once per source token. XFlows quotes can return slightly
// different `approvalAddress`es as bridges/dexes change, so an exact-amount
// approve would force a new approval per quote.
const MAX_UINT256 = (1n << 256n) - 1n;

export function SwapPage() {
  const [active, setActive] = useState<ActiveInfo | null>(null);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [chains, setChains] = useState<XfChain[]>([]);
  const [tokensByChain, setTokensByChain] = useState<Map<number, XfToken[]>>(new Map());
  const [networks, setNetworks] = useState<Network[]>([]);

  const [from, setFrom] = useState<Selection | null>(null);
  const [to, setTo] = useState<Selection | null>(null);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);
  const [showSlippage, setShowSlippage] = useState(false);

  const [picker, setPicker] = useState<PickerSide>(null);

  const [quote, setQuote] = useState<XfQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const [balance, setBalance] = useState<string>(''); // human-formatted fromToken balance
  const [allowance, setAllowance] = useState<bigint | null>(null);

  const [stage, setStage] = useState<SwapStage>({ kind: 'idle' });
  // Live status polled from XFlows /api/v3/status after submission. `null`
  // means we're still waiting for the first poll to return.
  const [swapStatus, setSwapStatus] = useState<XfStatus | null>(null);
  const [statusPolling, setStatusPolling] = useState(false);
  // Bumped after a swap is submitted to force balance + quote re-fetch.
  // The previous quote's `amountOut` is stale once the source tx lands, since
  // the user's balance has dropped and rates may have moved.
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Per-swap cancellation token; used so a newly-started swap aborts the
  // polling loop from any previous one still in flight.
  const pollSeqRef = useRef(0);

  // Re-fetch quote when inputs change.
  const reqIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [info, isUnlocked, nets] = await Promise.all([
          callBackground<ActiveInfo>('getActiveAccountInfo').catch(() => null),
          callBackground<boolean>('isUnlocked').catch(() => false),
          callBackground<Network[]>('getNetworks').catch(() => [] as Network[]),
        ]);
        setActive(info);
        setUnlocked(isUnlocked);
        setNetworks(nets);
      } catch {
        setUnlocked(false);
      }

      const [chainList, tokenList] = await Promise.all([
        getSupportedChains(),
        getSupportedTokens(),
      ]);
      setChains(chainList.filter((c) => isEvmChain(c.chainId)));
      const map = new Map<number, XfToken[]>();
      for (const entry of tokenList) {
        if (!isEvmChain(entry.chainId)) continue;
        map.set(entry.chainId, entry.tokens);
      }
      setTokensByChain(map);
    })();
  }, []);

  // Pre-seed from-token with the wallet's active network + native token, if
  // XFlows supports that chain. Cleaner than asking the user to pick blindly.
  useEffect(() => {
    if (from || chains.length === 0 || tokensByChain.size === 0) return;
    (async () => {
      try {
        const net = await callBackground<Network>('getActiveNetwork');
        const chain = chains.find((c) => c.chainId === net.chainId);
        const tokens = tokensByChain.get(net.chainId);
        if (!chain || !tokens) return;
        const native = tokens.find((t) => isNativeToken(t.tokenContractAddress));
        if (native) setFrom({ chain, token: native });
      } catch {
        // No active network or unsupported chain — leave selection empty.
      }
    })();
  }, [chains, tokensByChain, from]);

  // Load source-side balance whenever the from-token or wallet changes. The
  // helper handles native vs. ERC20 internally and uses the source chain's
  // RPC client — independent of the wallet's active chain.
  useEffect(() => {
    if (!from || !active) { setBalance(''); setAllowance(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const info = await callBackground<{ balance: string; decimals: number }>('getBalanceForChain', {
          chainId: from.chain.chainId,
          tokenAddress: from.token.tokenContractAddress,
          owner: active.address,
        });
        if (cancelled) return;
        setBalance(info.balance);
        setAllowance(null);
      } catch {
        if (!cancelled) { setBalance(''); setAllowance(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [from, active, refreshNonce]);

  // Fetch a quote whenever from/to/amount/slippage changes (debounced).
  useEffect(() => {
    if (!from || !to || !active) { setQuote(null); setQuoteError(''); return; }
    const amt = amount.trim();
    if (!amt || !/^\d+(\.\d+)?$/.test(amt) || parseFloat(amt) <= 0) {
      setQuote(null); setQuoteError(''); return;
    }
    const id = ++reqIdRef.current;
    setQuoteLoading(true);
    setQuoteError('');
    const timer = setTimeout(async () => {
      try {
        const q = await getQuote({
          fromChainId: from.chain.chainId,
          toChainId: to.chain.chainId,
          fromTokenAddress: from.token.tokenContractAddress,
          toTokenAddress: to.token.tokenContractAddress,
          fromAddress: active.address,
          toAddress: active.address,
          fromAmount: amt,
          slippage,
        });
        if (id !== reqIdRef.current) return;
        if (q.error) {
          setQuote(null);
          setQuoteError(q.error);
        } else {
          setQuote(q);
        }
      } catch (e: any) {
        if (id !== reqIdRef.current) return;
        setQuote(null);
        setQuoteError(e?.message ?? 'Quote failed');
      } finally {
        if (id === reqIdRef.current) setQuoteLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [from, to, amount, active, slippage, refreshNonce]);

  // Once we have a quote, refresh the allowance for its approvalAddress.
  useEffect(() => {
    if (!from || !active || !quote?.approvalAddress) { setAllowance(null); return; }
    if (isNativeToken(from.token.tokenContractAddress)) { setAllowance(0n); return; }
    let cancelled = false;
    (async () => {
      try {
        const raw = await callBackground<string>('getErc20Allowance', {
          chainId: from.chain.chainId,
          tokenAddress: from.token.tokenContractAddress,
          owner: active.address,
          spender: quote.approvalAddress,
        });
        if (!cancelled) setAllowance(BigInt(raw));
      } catch {
        if (!cancelled) setAllowance(null);
      }
    })();
    return () => { cancelled = true; };
  }, [quote?.approvalAddress, from, active]);

  const fromDecimals = useMemo(() => from ? Number(from.token.decimals) : 18, [from]);
  const toDecimals = useMemo(() => to ? Number(to.token.decimals) : 18, [to]);

  const amountRaw = useMemo<bigint | null>(() => {
    if (!from) return null;
    try { return parseUnits(amount.trim() || '0', fromDecimals); } catch { return null; }
  }, [amount, from, fromDecimals]);

  const needsApprove = useMemo(() => {
    if (!from) return false;
    if (isNativeToken(from.token.tokenContractAddress)) return false;
    if (!quote?.approvalAddress || amountRaw === null) return false;
    if (allowance === null) return false;
    return allowance < amountRaw;
  }, [from, quote?.approvalAddress, amountRaw, allowance]);

  const insufficientBalance = useMemo(() => {
    if (!balance || !amountRaw || !from) return false;
    try {
      const balRaw = parseUnits(balance, fromDecimals);
      return balRaw < amountRaw;
    } catch { return false; }
  }, [balance, amountRaw, fromDecimals, from]);

  function swapDirections() {
    if (!from || !to) return;
    setFrom(to);
    setTo(from);
  }

  function handlePick(side: PickerSide, sel: PickerSelection) {
    const chain = chains.find((c) => c.chainId === sel.chainId);
    if (!chain) return;
    const picked: Selection = { chain, token: sel.token };
    if (side === 'from') setFrom(picked);
    else if (side === 'to') setTo(picked);
    setPicker(null);
  }

  async function performApprove() {
    if (!from || !active || !quote?.approvalAddress || !amountRaw) return;
    setStage({ kind: 'approving' });
    try {
      const tokenAddr = from.token.tokenContractAddress as `0x${string}`;
      const spender = quote.approvalAddress as `0x${string}`;

      // USDT-style ERC20s require allowance to be reset to 0 before increasing
      // to a new non-zero value. Defensive: do this whenever the current
      // allowance is > 0 and lower than the target.
      if (allowance !== null && allowance > 0n) {
        const resetData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [spender, 0n],
        });
        await callBackground<string>('submitTxViaConfirm', {
          chainId: from.chain.chainId,
          origin: 'Auto Wallet Swap · Approve(0)',
          tx: { from: active.address, to: tokenAddr, data: resetData, value: '0x0' },
        });
      }

      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, MAX_UINT256],
      });
      const approveHash = await callBackground<string>('submitTxViaConfirm', {
        chainId: from.chain.chainId,
        origin: 'Auto Wallet Swap · Approve',
        tx: { from: active.address, to: tokenAddr, data: approveData, value: '0x0' },
      });
      setStage({ kind: 'approving', allowanceTx: approveHash });
      // Pessimistic refresh — the receipt may not be mined yet but we want to
      // unblock the Swap button as soon as the user signs.
      setAllowance(MAX_UINT256);
    } catch (e: any) {
      setStage({ kind: 'error', message: e?.message ?? 'Approve rejected' });
    }
  }

  async function performSwap() {
    if (!from || !to || !active || !amountRaw || !quote) return;
    // Cancel any polling loop from a previous swap and clear its display.
    pollSeqRef.current += 1;
    setSwapStatus(null);
    setStatusPolling(false);
    setStage({ kind: 'swapping' });
    try {
      const built = await xfBuildTx({
        fromChainId: from.chain.chainId,
        toChainId: to.chain.chainId,
        fromTokenAddress: from.token.tokenContractAddress,
        toTokenAddress: to.token.tokenContractAddress,
        fromAddress: active.address,
        toAddress: active.address,
        fromAmount: amount.trim(),
        slippage,
        partner: 'auto-wallet',
      });
      if (!built.tx?.to) throw new Error('XFlows did not return a target tx');

      const valueHex = built.tx.value
        ? toHex(BigInt(built.tx.value))
        : '0x0';
      const hash = await callBackground<string>('submitTxViaConfirm', {
        chainId: built.chainId ?? from.chain.chainId,
        origin: 'Auto Wallet Swap',
        tx: {
          from: active.address,
          to: built.tx.to,
          data: built.tx.data ?? '0x',
          value: valueHex,
        },
      });
      setStage({ kind: 'submitted', hash });
      // Invalidate the displayed quote — the source balance just dropped and
      // the rate may have moved. The balance + quote effects re-run when
      // `refreshNonce` bumps and will repaint with fresh numbers.
      setQuote(null);
      setRefreshNonce((n) => n + 1);
      setSwapStatus(null);
      pollSwapStatus(hash);
    } catch (e: any) {
      setStage({ kind: 'error', message: e?.message ?? 'Swap failed' });
    }
  }

  /**
   * Poll /api/v3/status every 5s until a terminal state is reached or we hit
   * the cap (~10 min). Statuses 1/2/4/5/7 are terminal. Status 3 (Processing)
   * and 6 (Trusteeship) keep the loop running — Trusteeship means the user
   * needs to contact support so we still keep showing the latest snapshot.
   *
   * Bumping `pollSeqRef.current` cancels any earlier in-flight polling loop.
   */
  async function pollSwapStatus(hash: string) {
    if (!from || !to || !active) return;
    const mySeq = ++pollSeqRef.current;
    const fromAmt = amount.trim();
    const req = {
      fromChainId: from.chain.chainId,
      toChainId: to.chain.chainId,
      fromTokenAddress: from.token.tokenContractAddress,
      toTokenAddress: to.token.tokenContractAddress,
      fromAddress: active.address,
      toAddress: active.address,
      fromAmount: fromAmt,
      hash,
    };
    setStatusPolling(true);
    const MAX_ATTEMPTS = 120; // 5s × 120 = 10 min
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (mySeq !== pollSeqRef.current) return; // superseded by a newer swap
      try {
        const status = await getStatus(req);
        if (mySeq !== pollSeqRef.current) return;
        setSwapStatus(status);
        if (isTerminalStatus(status.statusCode)) {
          setStatusPolling(false);
          return;
        }
      } catch {
        // Source tx may not be indexed yet — keep polling silently.
      }
    }
    if (mySeq === pollSeqRef.current) setStatusPolling(false);
  }

  if (unlocked === false) {
    return (
      <div className="swap-shell">
        <div className="swap-locked">
          <p>The wallet is locked. Open the Auto Wallet popup, unlock it, and reload this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="swap-shell">
      <header className="swap-header">
        <div className="swap-header-left">
          <img src="icons/icon48.png" alt="" width={26} height={26} />
          <span className="swap-header-title">Cross-Chain Swap</span>
          <span className="swap-header-sub">powered by Wanchain XFlows</span>
        </div>
        <div className="swap-header-right">
          {active && (
            <span className="swap-header-addr">{active.label} · {shortAddr(active.address)}</span>
          )}
        </div>
      </header>

      <main className="swap-main">
        <div className="swap-card">
          <div className="swap-side">
            <div className="swap-side-label">From</div>
            <div className="swap-side-row">
              <input
                type="text"
                inputMode="decimal"
                className="swap-amount-input"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              />
              <button className="swap-token-pill" onClick={() => setPicker('from')} type="button">
                {from ? (
                  <>
                    <TokenAvatar token={from.token} />
                    <span className="swap-token-pill-text">
                      <span className="swap-token-symbol">{from.token.tokenSymbol}</span>
                      <span className="swap-token-chain">on {from.chain.chainName}</span>
                    </span>
                  </>
                ) : (
                  <span className="swap-token-placeholder">Select token</span>
                )}
                <ChevronDownIcon size={14} />
              </button>
            </div>
            {balance && from && (
              <div className="swap-side-meta">
                <span>Balance: {trimAmount(balance, 6)} {from.token.tokenSymbol}</span>
                <button
                  type="button"
                  className="swap-max-btn"
                  onClick={() => setAmount(balance)}
                >
                  MAX
                </button>
              </div>
            )}
          </div>

          <button type="button" className="swap-flip" aria-label="Flip direction" onClick={swapDirections}>
            <ArrowDownIcon size={16} />
          </button>

          <div className="swap-side">
            <div className="swap-side-label">To</div>
            <div className="swap-side-row">
              <div className="swap-amount-readonly">
                {quoteLoading
                  ? <span className="swap-amount-placeholder">Fetching quote…</span>
                  : quote
                    ? trimAmount(quote.amountOut, 8)
                    : <span className="swap-amount-placeholder">—</span>}
              </div>
              <button className="swap-token-pill" onClick={() => setPicker('to')} type="button">
                {to ? (
                  <>
                    <TokenAvatar token={to.token} />
                    <span className="swap-token-pill-text">
                      <span className="swap-token-symbol">{to.token.tokenSymbol}</span>
                      <span className="swap-token-chain">on {to.chain.chainName}</span>
                    </span>
                  </>
                ) : (
                  <span className="swap-token-placeholder">Select token</span>
                )}
                <ChevronDownIcon size={14} />
              </button>
            </div>
            {quote && to && (
              <div className="swap-side-meta swap-side-meta-muted">
                Min received: {trimAmount(quote.amountOutMin, 8)} {to.token.tokenSymbol}
              </div>
            )}
          </div>
        </div>

        {/* Action button */}
        <div className="swap-actions">
          {insufficientBalance ? (
            <button className="btn-primary swap-btn" disabled>Insufficient balance</button>
          ) : needsApprove ? (
            <button
              className="btn-primary swap-btn"
              onClick={performApprove}
              disabled={stage.kind === 'approving' || stage.kind === 'swapping'}
            >
              {stage.kind === 'approving' ? 'Approving…' : `Approve ${from?.token.tokenSymbol ?? ''}`}
            </button>
          ) : (
            <button
              className="btn-primary swap-btn"
              onClick={performSwap}
              disabled={
                !quote
                  || quoteLoading
                  || stage.kind === 'swapping'
                  || !!quoteError
                  || !amountRaw
              }
            >
              {stage.kind === 'swapping' ? 'Submitting…' : 'Swap'}
            </button>
          )}
        </div>

        {/* Live stage feedback */}
        {stage.kind === 'submitted' && from && to && (
          <SwapStatusCard
            sourceHash={stage.hash}
            status={swapStatus}
            polling={statusPolling}
            sourceChainId={from.chain.chainId}
            destChainId={to.chain.chainId}
            destSymbol={to.token.tokenSymbol}
            networks={networks}
          />
        )}
        {stage.kind === 'error' && (
          <div className="swap-status swap-status-error">
            {stage.message}
            <button
              type="button"
              className="btn-ghost"
              style={{ marginLeft: 8 }}
              onClick={() => setStage({ kind: 'idle' })}
            >
              <RefreshIcon size={12} /> Retry
            </button>
          </div>
        )}

        {/* Quote summary below the action */}
        <div className="swap-summary">
          <div className="swap-summary-row">
            <span>Slippage</span>
            <div className="swap-slippage">
              {SLIPPAGE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`swap-slippage-pill ${slippage === s ? 'is-active' : ''}`}
                  onClick={() => setSlippage(s)}
                >
                  {(s * 100).toFixed(s < 0.01 ? 1 : 0)}%
                </button>
              ))}
              <button
                type="button"
                className="swap-slippage-pill"
                onClick={() => setShowSlippage((v) => !v)}
              >
                ⋯
              </button>
            </div>
          </div>
          {showSlippage && (
            <div className="swap-summary-row">
              <span>Custom (%)</span>
              <input
                type="number"
                className="input-field swap-slippage-input"
                value={(slippage * 100).toString()}
                step={0.1}
                min={0.05}
                max={50}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) setSlippage(v / 100);
                }}
              />
            </div>
          )}

          {quote && (
            <>
              <div className="swap-summary-row">
                <span>Route</span>
                <span className="swap-summary-value">
                  {describeWorkMode(quote.workMode)}{quote.bridge ? ` · ${quote.bridge}` : ''}{quote.dex ? ` · ${quote.dex}` : ''}
                </span>
              </div>
              {quote.priceImpact !== undefined && (
                <div className="swap-summary-row">
                  <span>Price impact</span>
                  <span className={`swap-summary-value ${Math.abs(quote.priceImpact) > 5 ? 'is-warn' : ''}`}>
                    {quote.priceImpact.toFixed(2)}%
                  </span>
                </div>
              )}
              {quote.nativeFees?.map((f, idx) => f.nativeFeeAmount && f.nativeFeeSymbol && (
                <div key={`nf-${idx}`} className="swap-summary-row">
                  <span>Network fee</span>
                  <span className="swap-summary-value">
                    {formatRaw(f.nativeFeeAmount, f.nativeFeeDecimals ?? 18)} {f.nativeFeeSymbol}
                  </span>
                </div>
              ))}
              {quote.tokenFees?.map((f, idx) => f.tokenFeeAmount && f.tokenFeeSymbol && (
                <div key={`tf-${idx}`} className="swap-summary-row">
                  <span>Bridge fee</span>
                  <span className="swap-summary-value">
                    {formatRaw(f.tokenFeeAmount, f.tokenFeeDecimals ?? 18)} {f.tokenFeeSymbol}
                  </span>
                </div>
              ))}
            </>
          )}

          {quoteError && <div className="swap-summary-error">{quoteError}</div>}
        </div>
      </main>

      {picker && (
        <TokenPicker
          title={picker === 'from' ? 'Select source token' : 'Select destination token'}
          chains={chains}
          tokensByChain={tokensByChain}
          showBalances={picker === 'from'}
          ownerAddress={active?.address}
          onClose={() => setPicker(null)}
          onPick={(sel) => handlePick(picker, sel)}
        />
      )}
    </div>
  );
}

function TokenAvatar({ token }: { token: XfToken }) {
  const [failed, setFailed] = useState(false);
  if (failed || !token.tokenLogoUrl) {
    const hue = token.tokenSymbol.split('').reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    return (
      <span
        className="swap-token-fallback"
        style={{ background: `hsl(${hue}, 50%, 92%)`, color: `hsl(${hue}, 55%, 38%)` }}
      >
        {token.tokenSymbol.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={token.tokenLogoUrl}
      alt={token.tokenSymbol}
      width={20}
      height={20}
      className="swap-token-logo"
      onError={() => setFailed(true)}
    />
  );
}

function describeWorkMode(workMode: number): string {
  switch (workMode) {
    case 1: return 'Direct bridge (WanBridge)';
    case 2: return 'Direct bridge (QUiX)';
    case 3: return 'Bridge + destination swap';
    case 4: return 'Bridge via Wanchain + swap out';
    case 5: return 'Same-chain swap';
    case 6: return 'Swap + bridge out';
    default: return `Mode ${workMode}`;
  }
}

function formatRaw(raw: string, decimals: number): string {
  try { return trimAmount(formatUnits(BigInt(raw), decimals), 8); } catch { return raw; }
}

function trimAmount(s: string, maxDecimals: number): string {
  const num = parseFloat(s);
  if (!isFinite(num)) return s;
  if (num === 0) return '0';
  if (num >= 1) return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const fixed = num.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '');
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// --- Status display ---

function isTerminalStatus(code: number): boolean {
  // 1 Success, 2 Failed, 4 Refunded (source), 5 Refunded (Wanchain),
  // 7 Risk transaction. 3 (Processing) and 6 (Trusteeship) keep polling.
  return code === 1 || code === 2 || code === 4 || code === 5 || code === 7;
}

type StepState = 'done' | 'active' | 'pending' | 'failed';

interface StepDescriptor {
  label: string;
  state: StepState;
  hash?: string;
  chainId?: number;
  hint?: string;
}

interface StatusCardProps {
  sourceHash: string;
  status: XfStatus | null;
  polling: boolean;
  sourceChainId: number;
  destChainId: number;
  destSymbol: string;
  networks: Network[];
}

function SwapStatusCard({
  sourceHash, status, polling, sourceChainId, destChainId, destSymbol, networks,
}: StatusCardProps) {
  const sourceExplorer = networks.find((n) => n.chainId === sourceChainId)?.blockExplorerUrl;
  const destExplorer = networks.find((n) => n.chainId === destChainId)?.blockExplorerUrl;

  // Per-step status. The first step is always "done" because we have the
  // source hash already. The bridge step shows "active" until /status reports
  // a terminal code. The destination step turns "done" once we receive a
  // `destinationHash`, or jumps straight to "failed" on a refund/failure.
  const code = status?.statusCode;
  const terminal = code !== undefined && isTerminalStatus(code);
  const success = code === 1;
  const refunded = code === 4 || code === 5;
  const failed = code === 2 || code === 7;

  const steps: StepDescriptor[] = [
    {
      label: 'Source transaction submitted',
      state: 'done',
      hash: sourceHash,
      chainId: sourceChainId,
    },
    {
      label: refunded
        ? 'Refunded'
        : failed
          ? 'Bridge failed'
          : terminal
            ? 'Bridge processed'
            : 'Bridging across chains',
      state: refunded || failed
        ? 'failed'
        : status?.destinationHash || (terminal && success)
          ? 'done'
          : 'active',
      hint: code === 6 ? 'Trusteeship — contact techsupport@wanchain.org' : undefined,
    },
    {
      label: status?.destinationHash
        ? `Received on destination chain${status.receiveAmount ? ` · ${formatLooseAmount(status.receiveAmount)} ${destSymbol}` : ''}`
        : refunded
          ? 'No destination delivery'
          : failed
            ? 'Destination not reached'
            : 'Waiting for destination delivery',
      state: status?.destinationHash
        ? 'done'
        : refunded || failed
          ? 'failed'
          : terminal && success
            ? 'done'
            : 'pending',
      hash: status?.destinationHash,
      chainId: destChainId,
    },
  ];

  const banner = (() => {
    if (success) {
      return { kind: 'success' as const, text: `Swap complete${status?.receiveAmount ? ` — received ${formatLooseAmount(status!.receiveAmount!)} ${destSymbol}` : ''}` };
    }
    if (refunded) return { kind: 'warn' as const, text: 'Refunded — funds returned to your address' };
    if (failed) return { kind: 'error' as const, text: status?.statusMsg ?? 'Swap failed' };
    if (code === 6) return { kind: 'warn' as const, text: 'Trusteeship — manual review required' };
    return { kind: 'info' as const, text: polling ? 'Tracking swap status…' : 'Status polling stopped' };
  })();

  return (
    <div className="swap-status-card">
      <div className={`swap-status-banner is-${banner.kind}`}>
        {polling && !terminal && <span className="swap-status-spinner" aria-hidden />}
        <span>{banner.text}</span>
      </div>

      <ol className="swap-steps">
        {steps.map((step, idx) => (
          <li key={idx} className={`swap-step is-${step.state}`}>
            <span className="swap-step-dot" />
            <div className="swap-step-body">
              <div className="swap-step-label">{step.label}</div>
              {step.hash && (
                <TxLink hash={step.hash} explorerUrl={
                  step.chainId === sourceChainId ? sourceExplorer : destExplorer
                } />
              )}
              {step.hint && <div className="swap-step-hint">{step.hint}</div>}
            </div>
          </li>
        ))}
      </ol>

      {status?.refundHash && (
        <div className="swap-status-extra">
          Refund tx:&nbsp;
          <TxLink hash={status.refundHash} explorerUrl={sourceExplorer} />
        </div>
      )}
      {status?.swapHash && status.swapHash !== status.destinationHash && (
        <div className="swap-status-extra">
          Swap tx:&nbsp;
          <TxLink hash={status.swapHash} explorerUrl={destExplorer} />
        </div>
      )}
    </div>
  );
}

function TxLink({ hash, explorerUrl }: { hash: string; explorerUrl?: string }) {
  const short = `${hash.slice(0, 12)}…${hash.slice(-8)}`;
  if (!explorerUrl) {
    return <span className="tx-link" style={{ cursor: 'default' }}>{short}</span>;
  }
  return (
    <a className="tx-link" href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noopener noreferrer">
      {short}
      <ExternalLinkIcon size={11} className="tx-link-icon" />
    </a>
  );
}

function formatLooseAmount(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n) || n === 0) return s;
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return n.toFixed(8).replace(/\.?0+$/, '');
}
