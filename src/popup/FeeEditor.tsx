import React, { useEffect, useMemo, useState } from 'react';
import { MSG_SOURCE, genId } from '../types/messages';
import type { FeeSuggestions } from '../background/popup-handler';

// User-edited values flow back as decimal-wei strings.
export interface FeeOverride {
  type: 'eip1559' | 'legacy';
  gas: string | null;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  gasPrice: string | null;
}

export interface FeeEditorRequest {
  to?: string;
  from?: string;
  data?: string;
  value?: string;
}

const GWEI = 1_000_000_000n;
const ETHER = 1_000_000_000_000_000_000n;

export function hexToBigIntSafe(hex: string | undefined): bigint | null {
  if (!hex) return null;
  try { return BigInt(hex); } catch { return null; }
}

export function weiToGweiInput(wei: string | null): string {
  if (wei === null) return '';
  try {
    const n = BigInt(wei);
    const whole = n / GWEI;
    const remainder = n % GWEI;
    if (remainder === 0n) return whole.toString();
    const frac = remainder.toString().padStart(9, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch { return ''; }
}

export function gweiInputToWei(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const parts = s.split('.');
  const whole = parts[0] ?? '0';
  const frac = parts[1] ?? '';
  const fracPadded = (frac + '000000000').slice(0, 9);
  try {
    const wei = BigInt(whole) * GWEI + BigInt(fracPadded);
    return wei.toString();
  } catch { return null; }
}

export function formatEthFromWei(wei: bigint): string {
  if (wei === 0n) return '0';
  const whole = wei / ETHER;
  const remainder = wei % ETHER;
  if (remainder === 0n) return whole.toString();
  const fracStr = remainder.toString().padStart(18, '0').slice(0, 8).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

interface FeeEditorProps {
  request: FeeEditorRequest;
  // Pre-fills from a tx (e.g. dApp-supplied values, hex strings)
  prefill?: {
    gas?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
  };
  defaultOpen?: boolean;
  onChange: (override: FeeOverride | null) => void;
}

export function FeeEditor({ request, prefill, defaultOpen = false, onChange }: FeeEditorProps) {
  const [fees, setFees] = useState<FeeSuggestions | null>(null);
  const [feesError, setFeesError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  const [gasInput, setGasInput] = useState('');
  const [maxFeeInput, setMaxFeeInput] = useState('');
  const [priorityInput, setPriorityInput] = useState('');
  const [gasPriceInput, setGasPriceInput] = useState('');

  // Fetch suggestions whenever the request changes
  useEffect(() => {
    let cancelled = false;
    chrome.runtime.sendMessage(
      {
        source: MSG_SOURCE,
        id: genId(),
        type: 'popup_request',
        action: 'getFeeSuggestions',
        payload: {
          to: request.to,
          from: request.from,
          data: request.data,
          value: request.value,
        },
      },
      (response) => {
        if (cancelled) return;
        if (chrome.runtime.lastError) {
          setFeesError(chrome.runtime.lastError.message ?? 'Failed to fetch fees');
          return;
        }
        if (response?.error) {
          setFeesError(typeof response.error === 'string' ? response.error : response.error.message);
          return;
        }
        const f = response.result as FeeSuggestions;
        setFees(f);

        const pfGas = hexToBigIntSafe(prefill?.gas);
        const pfMax = hexToBigIntSafe(prefill?.maxFeePerGas);
        const pfPrio = hexToBigIntSafe(prefill?.maxPriorityFeePerGas);
        const pfPrice = hexToBigIntSafe(prefill?.gasPrice);

        setGasInput((pfGas ?? (f.gasEstimate ? BigInt(f.gasEstimate) : null))?.toString() ?? '');
        setMaxFeeInput(weiToGweiInput(pfMax?.toString() ?? f.maxFeePerGas));
        setPriorityInput(weiToGweiInput(pfPrio?.toString() ?? f.maxPriorityFeePerGas));
        setGasPriceInput(weiToGweiInput(pfPrice?.toString() ?? f.gasPrice));
      },
    );
    return () => { cancelled = true; };
    // We intentionally re-fetch only when request fields change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.to, request.from, request.data, request.value]);

  // Push override up whenever inputs change
  useEffect(() => {
    if (!fees) {
      onChange(null);
      return;
    }
    const gas = (() => { try { return gasInput ? BigInt(gasInput).toString() : null; } catch { return null; } })();
    if (fees.type === 'eip1559') {
      onChange({
        type: 'eip1559',
        gas,
        maxFeePerGas: gweiInputToWei(maxFeeInput),
        maxPriorityFeePerGas: gweiInputToWei(priorityInput),
        gasPrice: null,
      });
    } else {
      onChange({
        type: 'legacy',
        gas,
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        gasPrice: gweiInputToWei(gasPriceInput),
      });
    }
  }, [fees, gasInput, maxFeeInput, priorityInput, gasPriceInput]);

  const feePreview = useMemo(() => {
    if (!fees) return null;
    let gas: bigint;
    try { gas = gasInput ? BigInt(gasInput) : 0n; } catch { return null; }
    if (gas === 0n) return null;
    let priceWei: bigint | null = null;
    if (fees.type === 'eip1559') {
      const w = gweiInputToWei(maxFeeInput);
      if (w) priceWei = BigInt(w);
    } else {
      const w = gweiInputToWei(gasPriceInput);
      if (w) priceWei = BigInt(w);
    }
    if (priceWei === null) return null;
    return gas * priceWei;
  }, [fees, gasInput, maxFeeInput, gasPriceInput]);

  return (
    <div className="card" style={{ padding: 12 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="row row-between"
        style={{
          width: '100%', padding: 0, background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span className="confirm-label" style={{ marginBottom: 0 }}>Network Fee</span>
        <span className="confirm-value mono" style={{ fontSize: 10 }}>
          {(() => {
            if (!fees) return 'loading...';
            if (feePreview !== null) {
              return `≈ ${formatEthFromWei(feePreview)} ${fees.symbol}`;
            }
            // No total yet — fall back to current gas price so the value isn't blank
            const priceWei = fees.type === 'eip1559' ? fees.maxFeePerGas : fees.gasPrice;
            if (priceWei) return `${weiToGweiInput(priceWei)} gwei`;
            return '—';
          })()}
          <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>{collapsed ? '▾' : '▴'}</span>
        </span>
      </button>

      {!collapsed && (
        <div style={{ marginTop: 10 }}>
          {feesError && (
            <div className="confirm-warning" style={{ marginBottom: 8, fontSize: 10 }}>
              Failed to load suggestions: {feesError}. You can still set values manually.
            </div>
          )}

          {fees?.baseFeePerGas && (
            <div className="confirm-field">
              <span className="confirm-label">Base Fee</span>
              <span className="confirm-value mono" style={{ fontSize: 11 }}>
                {weiToGweiInput(fees.baseFeePerGas)} gwei
              </span>
            </div>
          )}

          <div className="confirm-field">
            <span className="confirm-label">Gas Limit (units)</span>
            <input
              className="input-field"
              inputMode="numeric"
              value={gasInput}
              onChange={(e) => setGasInput(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={fees?.gasEstimate ?? '21000'}
            />
          </div>

          {(!fees || fees.type === 'eip1559') && (
            <>
              <div className="confirm-field">
                <span className="confirm-label">Max Fee Per Gas (gwei)</span>
                <input
                  className="input-field"
                  inputMode="decimal"
                  value={maxFeeInput}
                  onChange={(e) => setMaxFeeInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={fees?.maxFeePerGas ? weiToGweiInput(fees.maxFeePerGas) : '0'}
                />
              </div>
              <div className="confirm-field">
                <span className="confirm-label">Priority Fee (gwei)</span>
                <input
                  className="input-field"
                  inputMode="decimal"
                  value={priorityInput}
                  onChange={(e) => setPriorityInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={fees?.maxPriorityFeePerGas ? weiToGweiInput(fees.maxPriorityFeePerGas) : '0'}
                />
              </div>
            </>
          )}

          {fees?.type === 'legacy' && (
            <div className="confirm-field">
              <span className="confirm-label">Gas Price (gwei)</span>
              <input
                className="input-field"
                inputMode="decimal"
                value={gasPriceInput}
                onChange={(e) => setGasPriceInput(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={fees?.gasPrice ? weiToGweiInput(fees.gasPrice) : '0'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
