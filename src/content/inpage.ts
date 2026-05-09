// Injected into MAIN world — provides window.ethereum (EIP-1193) + EIP-6963

import { MSG_SOURCE, genId } from '../types/messages';

type EventHandler = (...args: any[]) => void;

class AutoWalletProvider {
  isAutoWallet = true;
  // Flipped to `true` at injection time when no other wallet has claimed
  // window.ethereum, so legacy "Connect Wallet" buttons that only look for
  // MetaMask still work. We never claim it when another provider is present.
  isMetaMask = false;

  private _events: Map<string, Set<EventHandler>> = new Map();
  private _chainId: string = '0x1';
  private _accounts: string[] = [];

  constructor() {
    // Listen for responses and events from content script bridge
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== MSG_SOURCE) return;

      if (event.data.type === 'event') {
        this._handleEvent(event.data.eventName, event.data.payload);
      }
    });

    // Proactively fetch accounts on init so dApps see connected state after reload
    this._init();
  }

  private async _init() {
    try {
      const accounts = await this.request({ method: 'eth_accounts' }) as string[];
      if (accounts.length > 0) {
        this._accounts = accounts;
      }
      const chainId = await this.request({ method: 'eth_chainId' }) as string;
      if (chainId) {
        this._chainId = chainId;
      }
    } catch {}
  }

  // EIP-1193: request
  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    const { method, params = [] } = args;

    // No local caching — always forward to background for accurate state
    // (eth_chainId was previously cached locally, causing stale chain after SW restart or popup switch)

    return new Promise((resolve, reject) => {
      const id = genId();

      const handler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.data?.source !== MSG_SOURCE) return;
        if (event.data?.type !== 'rpc_response') return;
        if (event.data?.requestId !== id) return;
        window.removeEventListener('message', handler);

        if (event.data.error) {
          const err = new Error(event.data.error.message);
          (err as any).code = event.data.error.code;
          reject(err);
        } else {
          // Update local cache
          if (method === 'eth_requestAccounts') {
            this._accounts = event.data.result as string[];
          } else if (method === 'eth_chainId') {
            this._chainId = event.data.result as string;
          } else if (method === 'wallet_switchEthereumChain') {
            const p = params[0] as { chainId: string };
            this._chainId = p.chainId;
            this._emit('chainChanged', p.chainId);
          }
          resolve(event.data.result);
        }
      };

      window.addEventListener('message', handler);

      window.postMessage(
        {
          source: MSG_SOURCE,
          id,
          type: 'rpc_request',
          method,
          params,
          origin: window.location.origin,
        },
        '*',
      );
    });
  }

  // Legacy: enable() = eth_requestAccounts
  async enable(): Promise<string[]> {
    return this.request({ method: 'eth_requestAccounts' }) as Promise<string[]>;
  }

  // Legacy: send / sendAsync
  send(methodOrPayload: string | any, paramsOrCallback?: any[] | Function): any {
    if (typeof methodOrPayload === 'string') {
      return this.request({ method: methodOrPayload, params: paramsOrCallback as any[] });
    }
    // Legacy JSON-RPC payload
    const payload = methodOrPayload;
    if (typeof paramsOrCallback === 'function') {
      this.request({ method: payload.method, params: payload.params })
        .then((result) => paramsOrCallback(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch((err) => paramsOrCallback(err));
      return;
    }
    return this.request({ method: payload.method, params: payload.params });
  }

  sendAsync(payload: any, callback: Function): void {
    this.request({ method: payload.method, params: payload.params })
      .then((result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
      .catch((err) => callback(err));
  }

  // EIP-1193: events
  on(event: string, handler: EventHandler): this {
    if (!this._events.has(event)) this._events.set(event, new Set());
    this._events.get(event)!.add(handler);
    return this;
  }

  removeListener(event: string, handler: EventHandler): this {
    this._events.get(event)?.delete(handler);
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }
    return this;
  }

  private _emit(event: string, ...args: any[]) {
    this._events.get(event)?.forEach((handler) => {
      try { handler(...args); } catch (e) { console.error('[Auto-Wallet] event handler error:', e); }
    });
  }

  private _handleEvent(eventName: string, payload: any) {
    if (eventName === 'accountsChanged') {
      this._accounts = payload;
    } else if (eventName === 'chainChanged') {
      this._chainId = payload;
    }
    this._emit(eventName, payload);
  }
}

// --- Initialize ---

const provider = new AutoWalletProvider();

// EIP-6963: announce provider
const providerInfo = {
  uuid: '10a4b7f8-3c2d-4e5a-9f6b-1d2e3f4a5b6c',
  name: 'Auto Wallet',
  icon: 'data:image/png;base64,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',
  rdns: 'com.auto-wallet',
};

function announceProvider() {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: providerInfo, provider }),
    }),
  );
}

window.addEventListener('eip6963:requestProvider', announceProvider);
announceProvider();

// Check injectWindowEthereum setting to decide whether to inject window.ethereum
// The content script bridge (ISOLATED world) reads the setting and passes it via
// a custom event since inpage.ts (MAIN world) cannot access chrome.storage directly.
function injectAsWindowEthereum(reason: string) {
  const existing = (window as any).ethereum;
  const hadOtherProvider = !!existing && existing !== provider;
  (window as any).ethereum = provider;
  // Only impersonate MetaMask when we're the sole provider on the page.
  // If another wallet is present we leave `isMetaMask` false to avoid
  // conflicting with their detection.
  provider.isMetaMask = !hadOtherProvider;
  console.log(
    `[Auto Wallet] Injected as window.ethereum (${reason})` +
      (provider.isMetaMask ? ' [isMetaMask=true for legacy compat]' : ''),
  );
}

function handleInjectSetting(forceInject: boolean) {
  if (forceInject || !(window as any).ethereum) {
    injectAsWindowEthereum(forceInject ? 'force' : 'no existing provider');
  }
}

// Listen for the setting from the content script bridge
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== MSG_SOURCE) return;
  if (event.data?.type !== 'inject_setting') return;
  handleInjectSetting(event.data.forceInject === true);
});

// Fallback: if no setting is received within 100ms, use default behavior
const fallbackTimer = setTimeout(() => {
  if (!(window as any).ethereum) {
    injectAsWindowEthereum('fallback timer');
  }
}, 100);

window.addEventListener('message', (event) => {
  if (event.source !== window && event.data?.source === MSG_SOURCE && event.data?.type === 'inject_setting') {
    clearTimeout(fallbackTimer);
  }
});

// Always expose under our own namespace
(window as any).autoWallet = provider;
