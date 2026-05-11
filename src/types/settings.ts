export interface WalletSettings {
  autoLockMinutes: number;       // 0 = never lock
  injectWindowEthereum: boolean; // whether to always inject window.ethereum
  showWalletNonce: boolean;      // whether to show latest/pending nonce on Wallet page
}

export const DEFAULT_SETTINGS: WalletSettings = {
  autoLockMinutes: 1440, // 24 hours
  injectWindowEthereum: false,
  showWalletNonce: false,
};
