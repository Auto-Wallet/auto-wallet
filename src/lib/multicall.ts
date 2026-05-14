// Multicall3 deployments per chain. The vast majority of EVM chains have it
// at the canonical 0xcA11bde05977b3631167028862bE2a173976CA11 address (CREATE2
// determinism). Wanchain is the notable exception with a custom deployment.
//
// When a chainId is missing from this map, callers should fall back to
// per-call RPC reads — there's no safe way to assume an address.

const DEFAULT_MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

const MULTICALL3_OVERRIDES: Record<number, `0x${string}`> = {
  // Wanchain — non-canonical address (per user)
  888: '0xc47DE8Bea91eBd2EDacfae8eb80CbC341cfa6EA6',
};

// Chains where multicall3 is deployed at the canonical address. Only listing
// the ones the wallet's preset network list ships with.
const MULTICALL3_CANONICAL = new Set<number>([
  1, 11155111, 17000,            // Ethereum + testnets
  137, 80002, 1101,              // Polygon family
  56, 97,                        // BSC
  42161, 42170, 421614,          // Arbitrum
  10, 11155420,                  // Optimism
  8453, 84532,                   // Base
  43114, 43113,                  // Avalanche
  250, 100, 59144, 324, 534352,  // Fantom, Gnosis, Linea, zkSync, Scroll
  5000, 42220, 1284, 1285, 25,   // Mantle, Celo, Moonbeam, Moonriver, Cronos
  81457, 34443,                  // Blast, Mode
]);

export function getMulticall3Address(chainId: number): `0x${string}` | undefined {
  const override = MULTICALL3_OVERRIDES[chainId];
  if (override) return override;
  if (MULTICALL3_CANONICAL.has(chainId)) return DEFAULT_MULTICALL3;
  return undefined;
}
