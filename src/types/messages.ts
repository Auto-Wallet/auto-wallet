// Message types between content script <-> background service worker

export const MSG_SOURCE = 'auto-wallet' as const;

export interface BaseMessage {
  source: typeof MSG_SOURCE;
  id: string;
  type: string;
}

// Content Script -> Background
export interface RpcRequest extends BaseMessage {
  type: 'rpc_request';
  method: string;
  params?: unknown[];
  origin: string;
}

// Background -> Content Script
export interface RpcResponse extends BaseMessage {
  type: 'rpc_response';
  requestId: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Popup -> Background
export interface PopupRequest extends BaseMessage {
  type: 'popup_request';
  action: string;
  payload?: unknown;
}

// Background -> Popup
export interface PopupResponse extends BaseMessage {
  type: 'popup_response';
  requestId: string;
  result?: unknown;
  error?: string;
}

export type Message = RpcRequest | RpcResponse | PopupRequest | PopupResponse;

export function genId(): string {
  return crypto.randomUUID();
}
