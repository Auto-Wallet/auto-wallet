export interface Token {
  chainId: number;
  address: string;     // ERC-20 contract address (checksummed)
  symbol: string;
  decimals: number;
  name?: string;
  logoUrl?: string;
  isCustom?: boolean;
}
