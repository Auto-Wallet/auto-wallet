// Manages the confirmation popup window for non-whitelisted requests

import { MSG_SOURCE, genId } from '../types/messages';
import { addRule } from '../lib/whitelist';
import type { WhitelistRule } from '../types/whitelist';
import { createPopupWindow } from './window-utils';
import type { TenderlySimulationPreview } from './tenderly-simulation';

export interface FeeOverride {
  type: 'eip1559' | 'legacy';
  gas: string | null;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  gasPrice: string | null;
}

/**
 * When the active account is a Ledger, the confirm popup performs the
 * actual signing locally (WebHID is unavailable in the service worker).
 * `signedRawTx` is set for transactions, `signature` for sign-message flows.
 */
export interface ConfirmResult {
  approved: boolean;
  feeOverride?: FeeOverride | null;
  signedRawTx?: `0x${string}` | null;
  signature?: `0x${string}` | null;
}

interface PendingConfirmation {
  id: string;
  resolve: (result: ConfirmResult) => void;
}

const pendingConfirmations = new Map<string, PendingConfirmation>();

export interface SerializedTxJSON {
  type: 'eip1559' | 'legacy';
  to: `0x${string}`;
  value: string;
  data?: `0x${string}`;
  gas: string;
  nonce: number;
  chainId: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

export interface LedgerConfirmContext {
  derivationPath: string;
  // For eth_sendTransaction: the prepared unsigned tx (popup signs, re-serializes, returns rawTx)
  txJson?: SerializedTxJSON;
  // For personal_sign: hex of the raw message bytes
  messageHex?: string;
  // For eth_signTypedData_v4: 32-byte hashes (popup uses the hashed-message API)
  domainSeparator?: `0x${string}`;
  hashStructMessage?: `0x${string}`;
}

export interface ConfirmRequest {
  id: string;
  method: string;
  origin: string;
  params: unknown;
  signerAddress?: string;
  chainId?: number;
  ledger?: LedgerConfirmContext;
  simulation?: TenderlySimulationPreview;
}

/** Open a confirmation popup and wait for user to approve or reject. */
export function requestUserConfirmation(request: ConfirmRequest): Promise<ConfirmResult> {
  return new Promise(async (resolve) => {
    pendingConfirmations.set(request.id, { id: request.id, resolve });

    // Store request data in session storage instead of URL query string
    // to avoid URL length limits with large calldata
    await chrome.storage.session.set({ [`confirm_${request.id}`]: request });

    const url = chrome.runtime.getURL(`confirm.html?id=${request.id}`);

    const window = await createPopupWindow(url, 360, 740);
    if (!window) {
      await chrome.storage.session.remove(`confirm_${request.id}`);
      pendingConfirmations.delete(request.id);
      resolve({ approved: false });
      return;
    }

    const onRemoved = (windowId: number) => {
      if (windowId === window.id) {
        chrome.windows.onRemoved.removeListener(onRemoved);
        chrome.storage.session.remove(`confirm_${request.id}`);
        const pending = pendingConfirmations.get(request.id);
        if (pending) {
          pendingConfirmations.delete(request.id);
          pending.resolve({ approved: false });
        }
      }
    };
    chrome.windows.onRemoved.addListener(onRemoved);
  });
}

// Listen for responses from the confirmation page
chrome.runtime.onMessage.addListener((message) => {
  if (message?.source !== MSG_SOURCE) return;
  if (message.type !== 'confirm_response') return;

  const pending = pendingConfirmations.get(message.requestId);
  if (pending) {
    pendingConfirmations.delete(message.requestId);
    chrome.storage.session.remove(`confirm_${message.requestId}`);
    pending.resolve({
      approved: message.approved === true,
      feeOverride: message.feeOverride ?? null,
      signedRawTx: message.signedRawTx ?? null,
      signature: message.signature ?? null,
    });

    // If user toggled "Trust this site", add origin to whitelist
    if (message.approved && message.addToWhitelist && message.origin) {
      let domain = message.origin;
      try { domain = new URL(message.origin).origin; } catch {}

      const rule: WhitelistRule = {
        id: genId(),
        label: `Trust: ${domain}`,
        enabled: true,
        origin: domain,
        contractAddress: null,
        methodSig: null,
        maxValueEth: null,
        maxGasLimit: null,
        chainId: null,
        createdAt: Date.now(),
      };
      addRule(rule);
    }
  }
});
