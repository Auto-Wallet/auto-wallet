import { formatEther, formatUnits, isAddressEqual } from 'viem';

declare const __TENDERLY_ACCESS_TOKEN__: string;
declare const __TENDERLY_API_URL__: string;

export type SimulatedTokenChange = {
  key: string;
  symbol: string;
  name?: string;
  address?: string;
  decimals?: number;
  rawDelta: string;
  formattedDelta: string;
  direction: 'in' | 'out';
};

export type TenderlySimulationPreview = {
  status: 'success' | 'failed' | 'unavailable';
  error?: string;
  gasUsed?: string;
  changes: SimulatedTokenChange[];
};

type SimulateArgs = {
  chainId: number;
  from: string;
  to: string | null;
  input: string | null;
  value: bigint;
  gas: bigint;
  gasPrice: bigint | null;
  nativeSymbol?: string;
};

function sameAddress(a: unknown, b: string): boolean {
  try {
    return typeof a === 'string' && isAddressEqual(a as `0x${string}`, b as `0x${string}`);
  } catch {
    return false;
  }
}

function firstArray(...values: unknown[]): any[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function pickString(obj: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function normalizeSymbol(value: string): string {
  return value.toUpperCase();
}

function pickNumber(obj: any, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  }
  return undefined;
}

function parseRawAmount(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    if (value.startsWith('0x')) return BigInt(value);
    if (/^-?\d+$/.test(value)) return BigInt(value);
  } catch {}
  return null;
}

function formatDelta(raw: bigint, decimals: number): string {
  const sign = raw < 0n ? '-' : '+';
  const abs = raw < 0n ? -raw : raw;
  const value = formatUnits(abs, decimals);
  return `${sign}${trimDecimal(value)}`;
}

function trimDecimal(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function addDelta(
  totals: Map<string, {
    symbol: string;
    name?: string;
    address?: string;
    decimals: number;
    raw: bigint;
  }>,
  key: string,
  meta: { symbol: string; name?: string; address?: string; decimals: number },
  delta: bigint,
): void {
  if (delta === 0n) return;
  const current = totals.get(key);
  if (current) {
    current.raw += delta;
  } else {
    totals.set(key, { ...meta, raw: delta });
  }
}

function extractAssetChanges(data: any, signer: string): SimulatedTokenChange[] {
  const info = data?.transaction?.transaction_info ?? data?.transaction_info ?? data?.result ?? data;
  const assetChanges = firstArray(
    info?.asset_changes,
    info?.assetChanges,
    data?.asset_changes,
    data?.assetChanges,
    data?.result?.asset_changes,
    data?.result?.assetChanges,
  );
  const balanceChanges = firstArray(
    info?.balance_changes,
    info?.balanceChanges,
    data?.balance_changes,
    data?.balanceChanges,
    data?.result?.balance_changes,
    data?.result?.balanceChanges,
  );

  const totals = new Map<string, {
    symbol: string;
    name?: string;
    address?: string;
    decimals: number;
    raw: bigint;
  }>();

  for (const change of assetChanges) {
    const token = change?.token_info ?? change?.tokenInfo ?? change?.asset_info ?? change?.assetInfo ?? change?.asset ?? {};
    const address = pickString(change, ['token_address', 'tokenAddress', 'contract_address', 'contractAddress', 'address'])
      ?? pickString(token, ['address', 'contract_address', 'contractAddress']);
    const symbol = normalizeSymbol(pickString(change, ['symbol', 'token_symbol', 'tokenSymbol'])
      ?? pickString(token, ['symbol'])
      ?? 'TOKEN');
    const name = pickString(change, ['name', 'token_name', 'tokenName']) ?? pickString(token, ['name']);
    const decimals = pickNumber(change, ['decimals', 'token_decimals', 'tokenDecimals'])
      ?? pickNumber(token, ['decimals'])
      ?? 18;
    const raw = parseRawAmount(
      change?.raw_amount ?? change?.rawAmount ?? change?.amount_raw ?? change?.amountRaw ?? change?.amount,
    );
    if (raw === null) continue;

    const from = change?.from ?? change?.sender ?? change?.src;
    const to = change?.to ?? change?.receiver ?? change?.dst;
    let delta = 0n;
    if (sameAddress(from, signer)) delta -= raw;
    if (sameAddress(to, signer)) delta += raw;
    if (delta === 0n) continue;

    const key = address ? address.toLowerCase() : `${symbol}:${decimals}`;
    addDelta(totals, key, { symbol, name, address, decimals }, delta);
  }

  for (const change of balanceChanges) {
    const owner = change?.address ?? change?.account ?? change?.wallet;
    if (!sameAddress(owner, signer)) continue;
    const token = change?.token_info ?? change?.tokenInfo ?? change?.asset_info ?? change?.assetInfo ?? {};
    const raw = parseRawAmount(
      change?.amount ?? change?.raw_amount ?? change?.rawAmount ?? change?.delta ?? change?.diff,
    );
    if (raw === null) continue;
    const address = pickString(change, ['token_address', 'tokenAddress', 'contract_address', 'contractAddress'])
      ?? pickString(token, ['address', 'contract_address', 'contractAddress']);
    const symbol = normalizeSymbol(pickString(change, ['symbol', 'token_symbol', 'tokenSymbol'])
      ?? pickString(token, ['symbol'])
      ?? 'ETH');
    const decimals = pickNumber(change, ['decimals', 'token_decimals', 'tokenDecimals'])
      ?? pickNumber(token, ['decimals'])
      ?? 18;
    const key = address ? address.toLowerCase() : `native:${symbol}`;
    addDelta(totals, key, { symbol, address, decimals }, raw);
  }

  return Array.from(totals.entries())
    .filter(([, item]) => item.raw !== 0n)
    .map(([key, item]): SimulatedTokenChange => {
      const direction: SimulatedTokenChange['direction'] = item.raw > 0n ? 'in' : 'out';
      return {
        key,
        symbol: item.symbol,
        name: item.name,
        address: item.address,
        decimals: item.decimals,
        rawDelta: item.raw.toString(),
        formattedDelta: formatDelta(item.raw, item.decimals),
        direction,
      };
    })
    .sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'out' ? -1 : 1;
      return a.symbol.localeCompare(b.symbol);
    });
}

function extractStatus(data: any): 'success' | 'failed' {
  const status = data?.simulation?.status ?? data?.transaction?.status ?? data?.result?.status ?? data?.status;
  if (status === false || status === 'failed' || status === 'reverted') return 'failed';
  return 'success';
}

function extractGasUsed(data: any): string | undefined {
  const value = data?.simulation?.gas_used
    ?? data?.simulation?.gasUsed
    ?? data?.transaction?.gas_used
    ?? data?.transaction?.gasUsed
    ?? data?.result?.gas_used
    ?? data?.result?.gasUsed;
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return undefined;
}

function extractError(data: any): string | undefined {
  return pickString(data?.error, ['message', 'slug'])
    ?? pickString(data?.simulation, ['error_message', 'errorMessage', 'revert_reason', 'revertReason'])
    ?? pickString(data?.transaction, ['error_message', 'errorMessage', 'revert_reason', 'revertReason']);
}

function friendlyUnavailableError(status: number, message?: string): string {
  const normalized = message?.toLowerCase() ?? '';
  if (
    status >= 500 ||
    normalized.includes('internal server error') ||
    normalized.includes('network not supported') ||
    normalized.includes('unsupported network') ||
    normalized.includes('unsupported chain')
  ) {
    return 'Simulation is not available for this network yet.';
  }
  return message ?? `Tenderly simulation failed (${status})`;
}

function normalizeSimulationUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/simulate')) {
    url.pathname = `${pathname}/simulate`;
  }
  return url.toString();
}

export async function simulateTenderlyTx(args: SimulateArgs): Promise<TenderlySimulationPreview> {
  const apiUrl = __TENDERLY_API_URL__ ? normalizeSimulationUrl(__TENDERLY_API_URL__) : '';
  const accessToken = __TENDERLY_ACCESS_TOKEN__;
  if (!apiUrl || !accessToken) {
    return { status: 'unavailable', error: 'Tenderly credentials are not configured.', changes: [] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Key': accessToken,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        network_id: String(args.chainId),
        from: args.from,
        to: args.to ?? undefined,
        input: args.input ?? '0x',
        value: args.value.toString(),
        gas: Number(args.gas > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : args.gas),
        gas_price: (args.gasPrice ?? 0n).toString(),
        save: false,
        save_if_fails: false,
        simulation_type: 'full',
      }),
    });
    clearTimeout(timeout);

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = extractError(data);
      return {
        status: 'unavailable',
        error: friendlyUnavailableError(response.status, error),
        changes: [],
      };
    }

    const changes = extractAssetChanges(data, args.from);
    const status = extractStatus(data);

    const nativeSymbol = normalizeSymbol(args.nativeSymbol ?? 'ETH');
    const hasNativeChange = changes.some(
      (change) => !change.address && change.symbol.toLowerCase() === nativeSymbol.toLowerCase(),
    );
    if (args.value > 0n && !hasNativeChange) {
      changes.push({
        key: `native-transfer:${nativeSymbol}`,
        symbol: nativeSymbol,
        rawDelta: (-args.value).toString(),
        formattedDelta: `-${trimDecimal(formatEther(args.value))}`,
        direction: 'out',
        decimals: 18,
      });
    }

    return {
      status,
      error: status === 'failed' ? extractError(data) : undefined,
      gasUsed: extractGasUsed(data),
      changes,
    };
  } catch (error: any) {
    return {
      status: 'unavailable',
      error: error?.message ?? String(error),
      changes: [],
    };
  }
}
