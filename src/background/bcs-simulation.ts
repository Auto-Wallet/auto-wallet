import { formatUnits } from 'viem';

declare const __BCS_API_URL__: string;

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

export type SimulationPreview = {
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
  nativeSymbol?: string;
};

const BCS_TIMEOUT_MS = 8_000;
const MAX_SAFE_GAS = BigInt(Number.MAX_SAFE_INTEGER);

function trimDecimal(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function formatDelta(raw: bigint, decimals: number): string {
  const sign = raw < 0n ? '-' : '+';
  const abs = raw < 0n ? -raw : raw;
  return `${sign}${trimDecimal(formatUnits(abs, decimals))}`;
}

function parseRaw(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    if (value.startsWith('0x')) return BigInt(value);
    if (/^-?\d+$/.test(value)) return BigInt(value);
  } catch {}
  return null;
}

function friendlyUnavailable(status: number, message: string): string {
  const lower = message.toLowerCase();
  if (
    status >= 500 ||
    lower.includes('unsupported') ||
    lower.includes('not supported')
  ) {
    return 'Simulation is not available for this network yet.';
  }
  return message;
}

function pickErrorMessage(parsed: any, fallback: string): string {
  return (
    (typeof parsed?.error === 'string' && parsed.error) ||
    parsed?.error?.message ||
    parsed?.message ||
    parsed?.revert_reason ||
    fallback
  );
}

function normalizeUrl(base: string): string {
  return base.replace(/\/+$/, '') + '/simulate';
}

export async function simulateTx(args: SimulateArgs): Promise<SimulationPreview> {
  const apiBase = __BCS_API_URL__;
  if (!apiBase) {
    return { status: 'unavailable', error: 'Simulation API URL is not configured.', changes: [] };
  }
  // Contract creations have no `to` — the API requires `to: Address`. We skip
  // sim rather than send a bogus zero-address call that would mislead the user.
  if (!args.to) {
    return { status: 'unavailable', error: 'Simulation does not support contract deployments.', changes: [] };
  }

  const url = normalizeUrl(apiBase);
  const cappedGas = args.gas > MAX_SAFE_GAS ? MAX_SAFE_GAS : args.gas;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BCS_TIMEOUT_MS);
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain_id: args.chainId,
        from: args.from,
        to: args.to,
        data: args.input ?? '0x',
        value: args.value.toString(),
        gas: Number(cappedGas),
      }),
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    const data = text ? safeJson(text) : {};

    if (!response.ok) {
      const msg = pickErrorMessage(data, `Simulation API error (${response.status})`);
      return { status: 'unavailable', error: friendlyUnavailable(response.status, msg), changes: [] };
    }

    const status: 'success' | 'failed' = data?.success ? 'success' : 'failed';
    const gasUsed = typeof data?.gas_used === 'string' ? data.gas_used : undefined;
    const failureMsg =
      status === 'failed'
        ? (typeof data?.revert_reason === 'string' && data.revert_reason) || 'Transaction would revert'
        : undefined;

    const changes = extractSignerChanges(data, args.from, args.nativeSymbol ?? 'ETH');

    return { status, error: failureMsg, gasUsed, changes };
  } catch (error: any) {
    return { status: 'unavailable', error: error?.message ?? String(error), changes: [] };
  }
}

function safeJson(text: string): any {
  try { return JSON.parse(text); } catch { return {}; }
}

function extractSignerChanges(data: any, signer: string, nativeSymbolRaw: string): SimulatedTokenChange[] {
  const balances: any[] = Array.isArray(data?.balance_changes) ? data.balance_changes : [];
  const target = signer.toLowerCase();
  const entry = balances.find((b: any) => typeof b?.address === 'string' && b.address.toLowerCase() === target);
  if (!entry) return [];

  const out: SimulatedTokenChange[] = [];
  const nativeSymbol = nativeSymbolRaw.toUpperCase();

  const nativeRaw = parseRaw(entry.native_delta);
  if (nativeRaw !== null && nativeRaw !== 0n) {
    out.push({
      key: `native:${nativeSymbol}`,
      symbol: nativeSymbol,
      decimals: 18,
      rawDelta: nativeRaw.toString(),
      formattedDelta: formatDelta(nativeRaw, 18),
      direction: nativeRaw > 0n ? 'in' : 'out',
    });
  }

  const tokenDeltas: any[] = Array.isArray(entry.token_deltas) ? entry.token_deltas : [];
  for (const td of tokenDeltas) {
    const raw = parseRaw(td?.delta);
    if (raw === null || raw === 0n) continue;
    const address = typeof td?.token === 'string' ? td.token : undefined;
    const symbol = (typeof td?.symbol === 'string' && td.symbol.length > 0)
      ? td.symbol.toUpperCase()
      : 'TOKEN';
    const name = typeof td?.name === 'string' ? td.name : undefined;
    const decimals = typeof td?.decimals === 'number' ? td.decimals : 18;
    out.push({
      key: address ? address.toLowerCase() : `${symbol}:${decimals}`,
      symbol,
      name,
      address,
      decimals,
      rawDelta: raw.toString(),
      formattedDelta: formatDelta(raw, decimals),
      direction: raw > 0n ? 'in' : 'out',
    });
  }

  out.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'out' ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });
  return out;
}
