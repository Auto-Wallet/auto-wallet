export type ThemePreference = 'auto' | 'light' | 'dark';

export interface WalletSettings {
  autoLockMinutes: number;       // 0 = never lock
  injectWindowEthereum: boolean; // whether to always inject window.ethereum
  showWalletNonce: boolean;      // whether to show latest/pending nonce on Wallet page
  theme: ThemePreference;        // 'auto' follows system, otherwise force
  enablePrices: boolean;         // whether to fetch USD prices from CoinGecko
}

export const DEFAULT_SETTINGS: WalletSettings = {
  autoLockMinutes: 1440, // 24 hours
  injectWindowEthereum: false,
  showWalletNonce: false,
  theme: 'auto',
  enablePrices: true,
};
