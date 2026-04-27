<p align="center">
  <img src="public/icons/cat-transparent.png" width="100" />
</p>

<h1 align="center">Auto Wallet</h1>

<p align="center">
  Minimal auto-signing Chrome extension wallet for EVM chains
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#getting-started">Get Started</a> &middot;
  <a href="#eip-standards">EIP Standards</a> &middot;
  <a href="#project-structure">Project Structure</a> &middot;
  <a href="#security">Security</a> &middot;
  <a href="LICENSE">License</a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/auto-wallet/bckpgmilngeoccpkmoeebmbjndegfojb">
    <img src="https://img.shields.io/chrome-web-store/v/bckpgmilngeoccpkmoeebmbjndegfojb?logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store&color=4f46e5" alt="Install on Chrome Web Store" />
  </a>
  <a href="https://chromewebstore.google.com/detail/auto-wallet/bckpgmilngeoccpkmoeebmbjndegfojb">
    <img src="https://img.shields.io/chrome-web-store/users/bckpgmilngeoccpkmoeebmbjndegfojb?logo=googlechrome&logoColor=white&label=Users&color=4f46e5" alt="Chrome Web Store users" />
  </a>
  <a href="https://chromewebstore.google.com/detail/auto-wallet/bckpgmilngeoccpkmoeebmbjndegfojb">
    <img src="https://img.shields.io/chrome-web-store/rating/bckpgmilngeoccpkmoeebmbjndegfojb?logo=googlechrome&logoColor=white&label=Rating&color=4f46e5" alt="Chrome Web Store rating" />
  </a>
</p>

---

## Features

### Whitelist Auto-Signing

The core feature. Configure rules with three independently toggleable dimensions:

- **Domain** — e.g. `app.uniswap.org` (all transactions from this site auto-sign)
- **Contract address** — restrict to a specific contract
- **Method selector** — restrict to a specific function (4-byte selector)

Dimensions combine with AND logic. Gas limit and value caps are always enforced as a safety net.

### Multi-Account Management

- Create or import multiple accounts (private key or mnemonic)
- Shared master password — enter once, switch accounts without re-entering
- Header dropdown for quick switching, renaming, and deleting accounts
- Export private keys with password verification

### Token Support

- Add custom ERC-20 tokens by contract address (auto-fetches symbol & decimals)
- Token icons from Trust Wallet CDN with fallback (handles `wan`-prefixed tokens)
- Send native tokens and ERC-20 tokens directly from the wallet
- Per-chain token lists with balance display

### Network Management

- 6 pre-configured chains: Ethereum, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche
- Add unlimited custom EVM networks
- Search & filter by name, symbol, or chain ID
- dApp-triggered chain addition with user confirmation + HTTPS validation

### Security

- **AES-256-GCM** encryption with PBKDF2 key derivation (600,000 iterations)
- Configurable auto-lock timeout (5 min to 24 hours, or never)
- Non-whitelisted transactions require manual approval via popup
- Origin spoofing protection: uses `sender.origin` from Chrome, not page-supplied values
- Strict origin matching: prevents prefix-based domain attacks
- Signer address validation in multi-account scenarios
- `wallet_addEthereumChain` requires explicit user approval + HTTPS-only RPC

### Smart Provider Injection

- **EIP-6963** provider discovery: coexists with MetaMask and other wallets
- Auto-detects `window.ethereum`: injects only when no other wallet is present
- Optional force-inject mode for legacy dApp compatibility
- dApp-triggered unlock popup when connecting to a locked wallet

## Getting Started

The easiest way is to install from the [Chrome Web Store](https://chromewebstore.google.com/detail/auto-wallet/bckpgmilngeoccpkmoeebmbjndegfojb). To build from source, follow the steps below.

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- Chrome or Chromium-based browser

### Install & Build

```bash
git clone https://github.com/Auto-Wallet/auto-wallet.git
cd auto-wallet
bun install
bun run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` directory

### Development

```bash
bun run build    # one-time build
```

After making changes, run `bun run build` again and click the refresh icon on `chrome://extensions`.

## EIP Standards

| EIP | Name | Status |
|-----|------|--------|
| [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) | JavaScript Ethereum Provider API | Implemented |
| [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) | Multi Injected Provider Discovery | Implemented |
| [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) | Fee Market Transactions (Type 2) | Implemented |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Typed Structured Data Signing | Implemented |
| [EIP-191](https://eips.ethereum.org/EIPS/eip-191) | Personal Sign | Implemented |
| [EIP-3085](https://eips.ethereum.org/EIPS/eip-3085) | `wallet_addEthereumChain` | Implemented |
| [EIP-3326](https://eips.ethereum.org/EIPS/eip-3326) | `wallet_switchEthereumChain` | Implemented |
| [EIP-747](https://eips.ethereum.org/EIPS/eip-747) | `wallet_watchAsset` | Implemented |

## Project Structure

```
src/
├── background/              # Service Worker
│   ├── index.ts             # Message router
│   ├── rpc-handler.ts       # EIP-1193 RPC method handling
│   ├── popup-handler.ts     # Popup UI action handling
│   ├── confirm-manager.ts   # Transaction confirmation popup
│   ├── unlock-manager.ts    # dApp-triggered unlock popup
│   └── window-utils.ts      # Popup window positioning
├── content/
│   ├── index.ts             # ISOLATED world message bridge
│   └── inpage.ts            # MAIN world EIP-1193/6963 provider
├── confirm/
│   └── index.tsx            # Transaction confirmation page
├── unlock/
│   └── index.tsx            # Unlock prompt page
├── lib/
│   ├── crypto.ts            # AES-256-GCM encrypt/decrypt
│   ├── key-manager.ts       # Multi-account key lifecycle
│   ├── network-manager.ts   # Chain management + RPC client
│   ├── token-manager.ts     # ERC-20 token CRUD + balance
│   ├── tx-logger.ts         # Transaction history
│   ├── whitelist.ts         # Auto-sign rule engine
│   └── storage.ts           # chrome.storage wrapper
├── popup/
│   ├── App.tsx              # Main app shell + routing
│   ├── api.ts               # Popup → Background messaging
│   ├── styles.css           # Design system
│   └── pages/
│       ├── AccountMenu.tsx   # Header account dropdown
│       ├── AccountPage.tsx   # Wallet home (balance + tokens)
│       ├── NetworkPage.tsx   # Chain management + search
│       ├── SettingsPage.tsx  # Config + export + danger zone
│       ├── SetupPage.tsx     # First-time wallet creation
│       ├── TxLogPage.tsx     # Transaction history
│       ├── UnlockPage.tsx    # Password unlock
│       └── WhitelistPage.tsx # Auto-sign rule management
└── types/
    ├── messages.ts           # Message protocol types
    ├── network.ts            # Network type + defaults
    ├── settings.ts           # Wallet settings type
    ├── token.ts              # ERC-20 token type
    └── whitelist.ts          # Whitelist rule type
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Chrome Extension Manifest V3 |
| Build | Bun |
| Language | TypeScript |
| UI | React |
| Signing | viem |
| Encryption | Web Crypto API |
| Fonts | Plus Jakarta Sans + JetBrains Mono |

## Security

If you discover a security vulnerability, please report it via [GitHub Issues](https://github.com/Auto-Wallet/auto-wallet/issues). Do not disclose security issues publicly until a fix is available.

## License

[MIT](LICENSE)
