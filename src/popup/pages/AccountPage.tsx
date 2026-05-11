import React, { useState, useEffect, useMemo } from 'react';
import { callBackground } from '../api';
import type { Network } from '../../types/network';
import type { Token } from '../../types/token';
import type { AddressBookEntry } from '../../types/address-book';
import { encodeFunctionData, erc20Abi, parseEther, parseUnits, toHex } from 'viem';
import { FeeEditor, type FeeOverride, type FeeEditorRequest } from '../FeeEditor';
import { LedgerBadge } from '../LedgerBadge';
import { signLedgerSendTx } from '../ledger-signer';
import { matchAddressBookEntries, resolveAddressBookInput } from '../../lib/address-book.core';

type SendTarget = {
  type: 'native';
  symbol: string;
  balance: string;
} | {
  type: 'token';
  token: Token;
  balance: string;
}

// --- Token Icon helpers ---

const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum', 56: 'smartchain', 137: 'polygon', 42161: 'arbitrum',
  10: 'optimism', 43114: 'avalanchec', 250: 'fantom', 100: 'xdai',
  8453: 'base', 324: 'zksync', 59144: 'linea', 534352: 'scroll',
};

// Well-known token symbol → Ethereum mainnet address (checksummed)
// Used as fallback when the token is on a chain not covered by Trust Wallet CDN
const KNOWN_TOKEN_ETH_ADDRESS: Record<string, string> = {
  'USDT':  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'USDC':  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'DAI':   '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  'WBTC':  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  'WETH':  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  'LINK':  '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  'UNI':   '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  'AAVE':  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  'SHIB':  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  'MATIC': '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
  'CRV':   '0xD533a949740bb3306d119CC777fa900bA034cd52',
  'MKR':   '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  'COMP':  '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  'SNX':   '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
  'SUSHI': '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
  'YFI':   '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
  'GRT':   '0xc944E90C64B2c07662A292be6244BDf05Cda44a7',
  'BAT':   '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
  'ENJ':   '0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c',
  'MANA':  '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942',
  'SAND':  '0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
  'AXS':   '0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b',
  'FTM':   '0x4E15361FD6b4BB609Fa63C81A2be19d873717870',
  'LDO':   '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
  'RPL':   '0xD33526068D116cE69F19A9ee46F0bd304F21A51f',
  'APE':   '0x4d224452801ACEd8B2F0aebE155379bb5D594381',
  'DYDX':  '0x92D6C1e31e14520e676a687F0a93788B716BEff5',
  'BNB':   '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
  'BUSD':  '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
  'TUSD':  '0x0000000000085d4780B73119b644AE5ecd22b376',
  'FRAX':  '0x853d955aCEf822Db058eb8505911ED77F175b99e',
  'LUNC':  '0xd2877702675e6cEb975b4A1dFf9fb7BAF4C91ea9',
  'stETH': '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  'rETH':  '0xae78736Cd615f374D3085123A210448E74Fc6393',
  'cbETH': '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
  'ARB':   '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
  'OP':    '0x4200000000000000000000000000000000000042',
  'PEPE':  '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
  'WLD':   '0x163f8C2467924be0ae7B5347228CABF260318753',
  'BLUR':  '0x5283D291DBCF85356A21bA090E6db59121208b44',
};

function getIconUrls(chainId: number, address: string, symbol: string): string[] {
  const urls: string[] = [];
  const cleanSymbol = symbol.replace(/^wan/i, '').toUpperCase();

  // 1. Try Trust Wallet CDN with the actual chain + address
  const chain = CHAIN_NAMES[chainId];
  if (chain) {
    urls.push(`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${address}/logo.png`);
  }

  // 2. Try known token symbol → Ethereum mainnet address on Trust Wallet CDN
  const ethAddr = KNOWN_TOKEN_ETH_ADDRESS[cleanSymbol];
  if (ethAddr) {
    urls.push(`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${ethAddr}/logo.png`);
  }

  // 3. Try the raw address on Ethereum CDN (might work for cross-chain deploys)
  if (!chain || chain !== 'ethereum') {
    urls.push(`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`);
  }

  return urls;
}

function TokenIcon({ token, size = 32 }: { token: Token; size?: number }) {
  const urls = getIconUrls(token.chainId, token.address, token.symbol);
  const [attempt, setAttempt] = useState(0);

  const displaySymbol = token.symbol.replace(/^wan/i, '').toUpperCase();

  if (attempt >= urls.length) {
    // All CDN attempts failed → colored initials
    const hue = displaySymbol.split('').reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    return (
      <div className="token-icon-fallback" style={{
        width: size, height: size, borderRadius: size / 2,
        background: `hsl(${hue}, 50%, 92%)`,
        color: `hsl(${hue}, 55%, 38%)`,
        fontSize: size * 0.36,
      }}>
        {displaySymbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={urls[attempt]}
      alt={token.symbol}
      width={size}
      height={size}
      className="token-icon-img"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

interface ActiveInfo {
  id: string;
  label: string;
  address: string;
  type: 'private' | 'ledger';
  derivationPath?: string;
}

export function AccountPage({ onLock }: { onLock: () => void }) {
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('');
  const [network, setNetwork] = useState<Network | null>(null);
  const [tokens, setTokens] = useState<{ token: Token; balance: string }[]>([]);
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<ActiveInfo | null>(null);

  // Send
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [sendFee, setSendFee] = useState<FeeOverride | null>(null);
  const [selectedAddressBookId, setSelectedAddressBookId] = useState<string | null>(null);

  // Add token
  const [showAddToken, setShowAddToken] = useState(false);
  const [tokenAddress, setTokenAddress] = useState('');
  const [addingToken, setAddingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [info, net] = await Promise.all([
      callBackground<ActiveInfo>('getActiveAccountInfo'),
      callBackground<Network>('getActiveNetwork'),
    ]);
    setActive(info);
    setAddress(info.address);
    setNetwork(net);

    const bal = await callBackground<string>('getNativeBalance');
    setBalance(bal);

    const allTokens = await callBackground<Token[]>('getTokens');
    const chainTokens = allTokens.filter((t) => t.chainId === net.chainId);
    const withBalances = await Promise.all(
      chainTokens.map(async (token) => {
        try {
          const b = await callBackground<string>('getTokenBalance', { token });
          return { token, balance: b };
        } catch {
          return { token, balance: '?' };
        }
      }),
    );
    setTokens(withBalances);

    const entries = await callBackground<AddressBookEntry[]>('getAddressBook');
    setAddressBook(entries);
  }

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  function openSendNative() {
    setSendTarget({ type: 'native', symbol: network?.symbol ?? 'ETH', balance });
    setSendTo(''); setSendAmount(''); setSendError(''); setSendSuccess(''); setSendFee(null); setSelectedAddressBookId(null);
  }

  function openSendToken(token: Token, tokenBalance: string) {
    setSendTarget({ type: 'token', token, balance: tokenBalance });
    setSendTo(''); setSendAmount(''); setSendError(''); setSendSuccess(''); setSendFee(null); setSelectedAddressBookId(null);
  }

  function closeSend() {
    setSendTarget(null); setSendTo(''); setSendAmount('');
    setSendError(''); setSendSuccess(''); setSendFee(null); setSelectedAddressBookId(null);
  }

  const sendMatches = useMemo(
    () => matchAddressBookEntries(addressBook, sendTo).slice(0, 5),
    [addressBook, sendTo],
  );

  const resolvedSendTo = useMemo(
    () => resolveAddressBookInput(addressBook, sendTo),
    [addressBook, sendTo],
  );

  function selectAddressBookEntry(entry: AddressBookEntry) {
    setSendTo(entry.address);
    setSelectedAddressBookId(entry.id);
    setSendError('');
  }

  async function handleSend() {
    if (!sendTarget) return;
    const toAddress = resolvedSendTo;
    if (!toAddress) {
      const matches = matchAddressBookEntries(addressBook, sendTo);
      setSendError(matches.length > 1 ? 'Multiple address book matches. Pick one.' : 'Invalid address');
      return;
    }
    const amount = parseFloat(sendAmount);
    if (!sendAmount.trim() || isNaN(amount) || amount <= 0) { setSendError('Invalid amount'); return; }
    setSending(true); setSendError(''); setSendSuccess('');
    try {
      let hash: string;
      const isLedger = active?.type === 'ledger';
      if (sendTarget.type === 'native') {
        if (isLedger) {
          hash = await signLedgerSendTx({
            kind: 'native',
            to: toAddress,
            amount: sendAmount.trim(),
            fee: sendFee,
            derivationPath: active!.derivationPath!,
          });
        } else {
          hash = await callBackground<string>('sendNative', {
            to: toAddress, amount: sendAmount.trim(), fee: sendFee,
          });
        }
      } else {
        if (isLedger) {
          hash = await signLedgerSendTx({
            kind: 'token',
            to: toAddress,
            amount: sendAmount.trim(),
            tokenAddress: sendTarget.token.address,
            decimals: sendTarget.token.decimals,
            fee: sendFee,
            derivationPath: active!.derivationPath!,
          });
        } else {
          hash = await callBackground<string>('sendToken', {
            to: toAddress,
            amount: sendAmount.trim(),
            tokenAddress: sendTarget.token.address,
            decimals: sendTarget.token.decimals,
            fee: sendFee,
          });
        }
      }
      setSendSuccess(hash);
      setSendTo(''); setSendAmount(''); setSelectedAddressBookId(null);
      setTimeout(loadData, 2000);
    } catch (e: any) { setSendError(e.message); }
    setSending(false);
  }

  // Build the fee-suggestion request for the active send. Returns null when
  // inputs aren't valid enough yet — FeeEditor will still load suggestions
  // (just without a gas estimate).
  const feeRequest = useMemo<FeeEditorRequest | null>(() => {
    if (!sendTarget || !address) return null;
    const toAddress = resolvedSendTo;

    if (sendTarget.type === 'native') {
      let valueHex: string | undefined;
      try {
        if (sendAmount.trim()) valueHex = toHex(parseEther(sendAmount.trim()));
      } catch { /* leave undefined */ }
      return {
        from: address,
        to: toAddress ?? undefined,
        value: valueHex,
      };
    }

    // Token transfer: encode transfer(to, amount) so the gas estimate is realistic
    let data: string | undefined;
    if (toAddress && sendAmount.trim()) {
      try {
        const amt = parseUnits(sendAmount.trim(), sendTarget.token.decimals);
        data = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [toAddress as `0x${string}`, amt],
        });
      } catch { /* leave undefined */ }
    }
    return {
      from: address,
      to: sendTarget.token.address,
      data,
    };
  }, [sendTarget, sendTo, sendAmount, address, resolvedSendTo]);

  async function handleAddToken() {
    if (!tokenAddress.trim() || !network) return;
    setAddingToken(true); setTokenError('');
    try {
      await callBackground('addToken', { chainId: network.chainId, address: tokenAddress.trim() });
      setTokenAddress(''); setShowAddToken(false);
      loadData();
    } catch (e: any) { setTokenError(e.message); }
    setAddingToken(false);
  }

  async function removeToken(token: Token) {
    await callBackground('removeToken', { chainId: token.chainId, address: token.address });
    setConfirmDeleteId(null);
    loadData();
  }

  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  const balanceDisplay = balance ? parseFloat(balance).toFixed(4) : '---';
  const sendSymbol = sendTarget?.type === 'native' ? (network?.symbol ?? 'ETH') : sendTarget?.token.symbol ?? '';
  const sendMaxBalance = sendTarget?.balance ?? '';

  return (
    <div className="stack stack-md animate-in">
      {/* Network */}
      <div className="row row-center">
        <span className="badge badge-network">
          <span className="pulse-dot" />
          {network?.name ?? '...'}
        </span>
      </div>

      {/* Address */}
      <div className="text-center">
        <button onClick={copyAddress} className="address-chip">
          {active?.type === 'ledger' && <LedgerBadge title="Ledger hardware wallet" />}
          {short}
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 15 2 2 4-4"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="copy-icon">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          )}
        </button>
      </div>

      {/* Balance */}
      <div className="hero-balance">
        <div className="balance-value">{balanceDisplay}</div>
        <div className="balance-symbol">{network?.symbol ?? 'ETH'}</div>
      </div>

      {/* Actions */}
      <div className="row row-center gap-sm">
        <button onClick={openSendNative} className="action-btn">
          <span className="action-btn-icon">&#8593;</span>
          Send
        </button>
        <button onClick={loadData} className="action-btn">
          <span className="action-btn-icon">&#8635;</span>
          Refresh
        </button>
      </div>

      {/* Send form */}
      {sendTarget && (
        <div className="card-form animate-in">
          <div className="row row-between">
            <p className="page-title">Send {sendSymbol}</p>
            {sendTarget.type === 'token' && (
              <span className="badge badge-network" style={{ fontSize: 9 }}>{sendTarget.token.symbol}</span>
            )}
          </div>
          <div className="recipient-field">
            <input className="input-field" placeholder="Recipient address, name, or prefix"
              value={sendTo}
              onChange={(e) => {
                setSendTo(e.target.value);
                setSelectedAddressBookId(null);
              }}
            />
            {sendTo.trim() && sendMatches.length > 0 && selectedAddressBookId === null && (
              <div className="address-suggestions">
                {sendMatches.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectAddressBookEntry(entry)}
                    className="address-suggestion"
                  >
                    <span className="address-suggestion-name">{entry.name}</span>
                    <span className="address-suggestion-address">
                      {entry.address.slice(0, 10)}...{entry.address.slice(-6)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <input className="input-field" placeholder={`Amount (${sendSymbol})`} value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)} type="text" inputMode="decimal"
              style={{ paddingRight: 58 }} />
            {sendMaxBalance && sendMaxBalance !== '?' && (
              <button onClick={() => setSendAmount(sendMaxBalance)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 10, fontWeight: 600, color: 'var(--accent)',
                  background: 'var(--accent-subtle)', border: 'none', borderRadius: 4,
                  padding: '2px 6px', cursor: 'pointer',
                }}>MAX</button>
            )}
          </div>
          {sendMaxBalance && sendMaxBalance !== '?' && (
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -4 }}>
              Balance: {parseFloat(sendMaxBalance).toFixed(6)} {sendSymbol}
            </p>
          )}
          {feeRequest && (
            <FeeEditor request={feeRequest} onChange={setSendFee} />
          )}
          {sendError && <p className="error-text">{sendError}</p>}
          {sendSuccess && (
            <div style={{
              fontSize: 11, color: 'var(--success)', background: 'var(--success-bg)',
              padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)',
            }}>
              <div style={{ marginBottom: 6, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>Transaction sent!</div>
              {network?.blockExplorerUrl ? (
                <a href={`${network.blockExplorerUrl}/tx/${sendSuccess}`}
                  target="_blank" rel="noopener noreferrer" className="tx-link">
                  {sendSuccess.slice(0, 18)}...{sendSuccess.slice(-8)} &#8599;
                </a>
              ) : (
                <span style={{ wordBreak: 'break-all', fontSize: 10 }}>{sendSuccess}</span>
              )}
            </div>
          )}
          <div className="row gap-sm">
            <button onClick={handleSend} disabled={sending} className="btn-primary" style={{ flex: 1 }}>
              {sending ? 'Sending...' : `Send ${sendSymbol}`}
            </button>
            <button onClick={closeSend} className="btn-secondary"
              style={{ flex: 0, width: 'auto', padding: '9px 16px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Token list */}
      <div className="stack stack-xs">
        <div className="row row-between">
          <p className="section-label">Tokens</p>
          <button onClick={() => setShowAddToken(!showAddToken)} className="btn-ghost accent" style={{ fontSize: 10 }}>
            {showAddToken ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showAddToken && (
          <div className="row gap-xs animate-in">
            <input className="input-field flex-1" placeholder="Contract address (0x...)"
              value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)}
              style={{ fontSize: 11, padding: '7px 10px' }} />
            <button onClick={handleAddToken} disabled={addingToken} className="btn-primary"
              style={{ width: 'auto', padding: '7px 12px', fontSize: 11, flex: 'none' }}>
              {addingToken ? '...' : 'Add'}
            </button>
          </div>
        )}
        {tokenError && <p className="error-text">{tokenError}</p>}

        {tokens.length === 0 && !showAddToken && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            No tokens added
          </div>
        )}

        {tokens.map(({ token, balance: b }) => {
          const isConfirming = confirmDeleteId === token.address;
          return (
            <div key={`${token.chainId}-${token.address}`} className="token-card">
              <div className="row gap-md" style={{ flex: 1, minWidth: 0 }}>
                <TokenIcon token={token} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row gap-xs" style={{ marginBottom: 2 }}>
                    <span className="token-card-symbol">{token.symbol}</span>
                    {token.name && <span className="token-card-name truncate">{token.name}</span>}
                  </div>
                  <div className="token-card-balance mono">
                    {typeof b === 'string' && b !== '?' ? parseFloat(b).toFixed(4) : b} {token.symbol}
                  </div>
                </div>
              </div>

              <div className="token-card-actions">
                {isConfirming ? (
                  <div className="row gap-xs">
                    <button onClick={() => removeToken(token)} className="btn-ghost danger" style={{ fontSize: 10 }}>
                      Confirm
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="btn-ghost" style={{ fontSize: 10 }}>
                      No
                    </button>
                  </div>
                ) : (
                  <div className="row gap-xs">
                    <button onClick={() => openSendToken(token, b)} className="btn-ghost accent"
                      style={{ fontSize: 10 }}>Send</button>
                    <button onClick={() => setConfirmDeleteId(token.address)} className="btn-ghost danger"
                      style={{ fontSize: 10, opacity: 0.4 }}>Del</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
