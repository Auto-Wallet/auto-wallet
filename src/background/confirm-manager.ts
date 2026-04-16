// Manages the confirmation popup window for non-whitelisted requests

import { MSG_SOURCE, genId } from '../types/messages';
import { addRule } from '../lib/whitelist';
import type { WhitelistRule } from '../types/whitelist';
import { createPopupWindow } from './window-utils';

interface PendingConfirmation {
  id: string;
  resolve: (approved: boolean) => void;
}

const pendingConfirmations = new Map<string, PendingConfirmation>();

export interface ConfirmRequest {
  id: string;
  method: string;
  origin: string;
  params: unknown;
}

/** Open a confirmation popup and wait for user to approve or reject. */
export function requestUserConfirmation(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirmations.set(request.id, { id: request.id, resolve });

    const data = encodeURIComponent(JSON.stringify(request));
    const url = chrome.runtime.getURL(`confirm.html?data=${data}`);

    createPopupWindow(url, 360, 740).then((window) => {
      if (!window) {
        pendingConfirmations.delete(request.id);
        resolve(false);
        return;
      }

      const onRemoved = (windowId: number) => {
        if (windowId === window.id) {
          chrome.windows.onRemoved.removeListener(onRemoved);
          const pending = pendingConfirmations.get(request.id);
          if (pending) {
            pendingConfirmations.delete(request.id);
            pending.resolve(false);
          }
        }
      };
      chrome.windows.onRemoved.addListener(onRemoved);
    });
  });
}

// Listen for responses from the confirmation page
chrome.runtime.onMessage.addListener((message) => {
  if (message?.source !== MSG_SOURCE) return;
  if (message.type !== 'confirm_response') return;

  const pending = pendingConfirmations.get(message.requestId);
  if (pending) {
    pendingConfirmations.delete(message.requestId);
    pending.resolve(message.approved === true);

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
