// Content script: bridge between inpage provider (MAIN world) and background service worker
// Runs in ISOLATED world — can access both chrome.runtime and window messages

import { MSG_SOURCE, type RpcResponse } from '../types/messages';

// Forward messages from page (inpage.js) to background service worker
// SECURITY: Never trust page-supplied origin — overwrite with real origin from ISOLATED world
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== MSG_SOURCE) return;
  if (event.data?.type !== 'rpc_request') return;

  const sanitized = { ...event.data, origin: window.location.origin };
  chrome.runtime.sendMessage(sanitized, (response: RpcResponse) => {
    window.postMessage(response, '*');
  });
});

// Forward events from background to page (e.g. accountsChanged, chainChanged)
chrome.runtime.onMessage.addListener((message) => {
  if (message?.source !== MSG_SOURCE) return;
  if (message.type === 'event') {
    window.postMessage(message, '*');
  }
});
