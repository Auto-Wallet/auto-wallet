// USD price feed via CoinGecko free API.
//
// Design (driven by free-tier rate limits — 30 req/min):
//
// 1. Cache TTL = 60 min, shared across popup opens (chrome.storage.local).
//    On open we only refetch keys that aren't cached OR if TTL elapsed.
// 2. Concurrent getPrices() calls are serialized via an in-flight chain so a
//    React remount or two effects firing at once won't double-hit CG.
// 3. Cache keys use the CoinGecko COIN id (`coin:ethereum`) not chainId. ETH on
//    Ethereum/Arbitrum/Optimism/Base/zkSync/Linea/Scroll/Blast/Mode/Nova/zkEVM
//    all share one entry. Likewise USDC across every chain shares one entry.
// 4. Tokens are resolved by symbol first (after stripping the `wan` prefix used
//    by Wanchain cross-chain wrappers — wanUSDT is just USDT). Only symbols we
//    don't recognize fall through to the per-platform contract endpoint.
// 5. Recognized natives + tokens collapse into a single /simple/price call.
//    Worst case: one /simple/price + one /simple/token_price/{platform} per
//    chain with unknown ERC-20s. For Wanchain wrappers this means ZERO
//    per-platform calls.
//
// On fetch failure (incl. 429) we keep whatever cache we have and never throw.

import { getItem, setItem, STORAGE_KEYS } from './storage';

const CG_BASE = 'https://api.coingecko.com/api/v3';
const TTL_MS = 60 * 60 * 1000; // 60 minutes — free tier is tight
const FETCH_TIMEOUT_MS = 8000;

export type PriceQuery =
  | { kind: 'native'; chainId: number; symbol?: string }
  | { kind: 'token'; chainId: number; address: string; symbol?: string };

interface PriceCache {
  prices: Record<string, number>; // cache key → USD
  fetchedAt: number;              // last successful fetch
}

// --- CoinGecko mappings ---

/** chainId → CoinGecko platform id (for /simple/token_price/{platform}) */
const CG_PLATFORM: Record<number, string> = {
  1:      'ethereum',
  10:     'optimistic-ethereum',
  25:     'cronos',
  56:     'binance-smart-chain',
  100:    'xdai',
  137:    'polygon-pos',
  250:    'fantom',
  324:    'zksync',
  888:    'wanchain',
  1101:   'polygon-zkevm',
  1284:   'moonbeam',
  1285:   'moonriver',
  5000:   'mantle',
  8453:   'base',
  34443:  'mode',
  42161:  'arbitrum-one',
  42170:  'arbitrum-nova',
  42220:  'celo',
  43114:  'avalanche',
  59144:  'linea',
  81457:  'blast',
  534352: 'scroll',
};

/** chainId → CoinGecko coin id of the chain's native token */
const CG_NATIVE_BY_CHAIN: Record<number, string> = {
  1:      'ethereum',
  10:     'ethereum',
  324:    'ethereum',
  1101:   'ethereum',
  8453:   'ethereum',
  34443:  'ethereum',
  42161:  'ethereum',
  42170:  'ethereum',
  59144:  'ethereum',
  81457:  'ethereum',
  534352: 'ethereum',

  56:     'binancecoin',
  137:    'matic-network',
  43114:  'avalanche-2',
  250:    'fantom',
  100:    'xdai',
  888:    'wanchain',
  5000:   'mantle',
  42220:  'celo',
  1284:   'moonbeam',
  1285:   'moonriver',
  25:     'crypto-com-chain',
};

/** Symbol (uppercase, with wan-prefix already stripped) → CoinGecko coin id.
 *  Used for natives on unknown chains AND for cross-chain wrapper tokens. */
const CG_COIN_BY_SYMBOL: Record<string, string> = {
  // Natives
  ETH:   'ethereum',
  BNB:   'binancecoin',
  POL:   'matic-network',
  MATIC: 'matic-network',
  AVAX:  'avalanche-2',
  FTM:   'fantom',
  XDAI:  'xdai',
  WAN:   'wanchain',
  MNT:   'mantle',
  CELO:  'celo',
  GLMR:  'moonbeam',
  MOVR:  'moonriver',
  CRO:   'crypto-com-chain',

  // Major stables — same price on every chain
  USDT:  'tether',
  USDC:  'usd-coin',
  DAI:   'dai',
  BUSD:  'binance-usd',
  TUSD:  'true-usd',
  FRAX:  'frax',
  USDD:  'usdd',

  // BTC family
  BTC:   'bitcoin',
  WBTC:  'wrapped-bitcoin',

  // Wrapped ETH (1:1 with ETH)
  WETH:  'weth',
  STETH: 'staked-ether',
  RETH:  'rocket-pool-eth',
  CBETH: 'coinbase-wrapped-staked-eth',

  // Top DeFi tokens
  LINK:  'chainlink',
  UNI:   'uniswap',
  AAVE:  'aave',
  CRV:   'curve-dao-token',
  MKR:   'maker',
  COMP:  'compound-governance-token',
  SNX:   'havven',
  SUSHI: 'sushi',
  YFI:   'yearn-finance',
  GRT:   'the-graph',
  LDO:   'lido-dao',
  RPL:   'rocket-pool',
  ARB:   'arbitrum',
  OP:    'optimism',
  PEPE:  'pepe',
  SHIB:  'shiba-inu',
  APE:   'apecoin',
  MANA:  'decentraland',
  SAND:  'the-sandbox',
  AXS:   'axie-infinity',
  ENJ:   'enjincoin',
  BAT:   'basic-attention-token',
  WLD:   'worldcoin-wld',
  BLUR:  'blur',
  DYDX:  'dydx-chain',
};

// --- Key helpers (exported for consumers like AccountPage) ---

function canonicalSymbol(symbol: string): string {
  // Strip the `wan` cross-chain wrapper prefix used by Wanchain (wanUSDT → USDT).
  return symbol.replace(/^wan/i, '').toUpperCase();
}

/** Resolves the cache key for a native coin. */
export function nativePriceKey(chainId: number, symbol?: string): string {
  const coinId = CG_NATIVE_BY_CHAIN[chainId]
    ?? (symbol ? CG_COIN_BY_SYMBOL[canonicalSymbol(symbol)] : undefined);
  return coinId ? `coin:${coinId}` : `chain:${chainId}`;
}

/** Resolves the cache key for an ERC-20 token.
 *  Prefers symbol-based lookup so wan-prefixed wrappers share a single entry
 *  with the canonical token. Falls back to a per-platform contract lookup. */
export function tokenPriceKey(chainId: number, address: string, symbol?: string): string {
  if (symbol) {
    const coinId = CG_COIN_BY_SYMBOL[canonicalSymbol(symbol)];
    if (coinId) return `coin:${coinId}`;
  }
  return `token:${chainId}:${address.toLowerCase()}`;
}

// --- Concurrency: serialize getPrices calls ---

let chain: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(() => work());
  // Don't let a rejected branch poison the chain
  chain = next.catch(() => undefined);
  return next;
}

// --- Public API ---

/** Returns USD prices for the requested items. Missing prices map to null.
 *  Concurrent calls are serialized so two simultaneous loadData() runs share
 *  a single CG round-trip via the cache. */
export function getPrices(items: PriceQuery[]): Promise<Record<string, number | null>> {
  return serialize(() => getPricesImpl(items));
}

async function getPricesImpl(items: PriceQuery[]): Promise<Record<string, number | null>> {
  const cache = (await getItem<PriceCache>(STORAGE_KEYS.PRICES_CACHE)) ?? { prices: {}, fetchedAt: 0 };
  const ttlElapsed = Date.now() - cache.fetchedAt >= TTL_MS;

  const missingItems = items.filter((q) => !(resolveItemKey(q) in cache.prices));

  if (!ttlElapsed && missingItems.length === 0) {
    return pickFromCache(items, cache);
  }

  const itemsToFetch = ttlElapsed ? items : missingItems;

  try {
    const fetched = await fetchFromCoinGecko(itemsToFetch);
    const merged = { ...cache.prices, ...fetched };
    const next: PriceCache = { prices: merged, fetchedAt: Date.now() };
    await setItem(STORAGE_KEYS.PRICES_CACHE, next);
    return pickFromCache(items, next);
  } catch {
    return pickFromCache(items, cache);
  }
}

function resolveItemKey(q: PriceQuery): string {
  return q.kind === 'native'
    ? nativePriceKey(q.chainId, q.symbol)
    : tokenPriceKey(q.chainId, q.address, q.symbol);
}

function pickFromCache(items: PriceQuery[], cache: PriceCache): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const q of items) {
    const k = resolveItemKey(q);
    out[k] = cache.prices[k] ?? null;
  }
  return out;
}

// --- CoinGecko fetch ---

async function fetchFromCoinGecko(items: PriceQuery[]): Promise<Record<string, number>> {
  // Two buckets:
  //   coinIds → cache keys (resolved via /simple/price — one batched call)
  //   per-platform contract addresses (resolved via /simple/token_price/{platform})
  const coinIdToKey = new Map<string, string>();
  const platformToAddrs = new Map<string, Map<string, string>>();

  for (const q of items) {
    const key = resolveItemKey(q);
    if (key.startsWith('coin:')) {
      coinIdToKey.set(key.slice('coin:'.length), key);
      continue;
    }
    if (key.startsWith('token:') && q.kind === 'token') {
      const platform = CG_PLATFORM[q.chainId];
      if (!platform) continue;
      const bucket = platformToAddrs.get(platform) ?? new Map<string, string>();
      bucket.set(q.address.toLowerCase(), key);
      platformToAddrs.set(platform, bucket);
    }
    // Unmappable native (chainId not recognized, symbol unknown) → no fetch
  }

  const merged: Record<string, number> = {};

  // One batched /simple/price covers ALL coin-id entries (natives + recognized
  // wrapper tokens). With the symbol map, most wallets need only this call.
  if (coinIdToKey.size > 0) {
    const ids = [...coinIdToKey.keys()].join(',');
    const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
    const data = await fetchJson<Record<string, { usd?: number }>>(url);
    for (const [coinId, cacheKey] of coinIdToKey) {
      const usd = data?.[coinId]?.usd;
      if (typeof usd === 'number') merged[cacheKey] = usd;
    }
  }

  // One call per platform for unrecognized ERC-20s (no symbol match → contract).
  await Promise.all(
    [...platformToAddrs.entries()].map(async ([platform, bucket]) => {
      const addrs = [...bucket.keys()].join(',');
      const url = `${CG_BASE}/simple/token_price/${platform}?contract_addresses=${encodeURIComponent(addrs)}&vs_currencies=usd`;
      const data = await fetchJson<Record<string, { usd?: number }>>(url);
      for (const [addr, cacheKey] of bucket) {
        const usd = data?.[addr]?.usd ?? data?.[addr.toLowerCase()]?.usd;
        if (typeof usd === 'number') merged[cacheKey] = usd;
      }
    }),
  );

  return merged;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}
