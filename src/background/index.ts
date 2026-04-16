import { MSG_SOURCE, genId, type RpcRequest, type RpcResponse } from '../types/messages';
import * as keyManager from '../lib/key-manager';
import * as networkManager from '../lib/network-manager';
import * as whitelist from '../lib/whitelist';
import * as tokenManager from '../lib/token-manager';
import * as txLogger from '../lib/tx-logger';
import { handleRpcMethod } from './rpc-handler';
import { handlePopupAction } from './popup-handler';

// --- Message listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== MSG_SOURCE) return false;

  const handleAsync = async () => {
    try {
      if (message.type === 'rpc_request') {
        const req = message as RpcRequest;
        const result = await handleRpcMethod(req.method, req.params ?? [], req.origin, sender);
        const response: RpcResponse = {
          source: MSG_SOURCE,
          id: genId(),
          type: 'rpc_response',
          requestId: req.id,
          result,
        };
        sendResponse(response);
      } else if (message.type === 'popup_request') {
        const result = await handlePopupAction(message.action, message.payload);
        sendResponse({
          source: MSG_SOURCE,
          id: genId(),
          type: 'popup_response',
          requestId: message.id,
          result,
        });
      }
    } catch (err: any) {
      sendResponse({
        source: MSG_SOURCE,
        id: genId(),
        type: message.type === 'rpc_request' ? 'rpc_response' : 'popup_response',
        requestId: message.id,
        error: message.type === 'rpc_request'
          ? { code: err.code ?? 4001, message: err.message }
          : err.message,
      });
    }
  };

  handleAsync();
  return true; // keep channel open for async response
});

// Service worker install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Auto-Wallet] Extension installed');
});
