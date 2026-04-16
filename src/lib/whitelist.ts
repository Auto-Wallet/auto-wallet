import type { WhitelistRule, AutoSignResult } from '../types/whitelist';
import { getItem, setItem, STORAGE_KEYS } from './storage';

// --- Storage ---

export async function getRules(): Promise<WhitelistRule[]> {
  return (await getItem<WhitelistRule[]>(STORAGE_KEYS.WHITELIST_RULES)) ?? [];
}

export async function saveRules(rules: WhitelistRule[]): Promise<void> {
  await setItem(STORAGE_KEYS.WHITELIST_RULES, rules);
}

export async function addRule(rule: WhitelistRule): Promise<void> {
  const rules = await getRules();
  rules.push(rule);
  await saveRules(rules);
}

export async function updateRule(id: string, patch: Partial<WhitelistRule>): Promise<void> {
  const rules = await getRules();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Rule not found: ${id}`);
  rules[idx] = { ...rules[idx], ...patch };
  await saveRules(rules);
}

export async function removeRule(id: string): Promise<void> {
  const rules = await getRules();
  await saveRules(rules.filter((r) => r.id !== id));
}

// --- Matching ---

interface TxContext {
  origin: string;           // dApp origin, e.g. "https://app.uniswap.org"
  to: string | null;        // contract address
  data: string | null;      // calldata hex
  value: string;            // wei, decimal string
  gasLimit: string | null;  // decimal string
  chainId: number;
}

export async function checkAutoSign(ctx: TxContext): Promise<AutoSignResult> {
  const rules = await getRules();
  const enabledRules = rules.filter((r) => r.enabled);

  for (const rule of enabledRules) {
    if (!matchesRule(rule, ctx)) continue;

    // Safety caps — always enforced
    if (rule.maxValueEth !== null) {
      const maxWei = BigInt(Math.floor(parseFloat(rule.maxValueEth) * 1e18));
      if (BigInt(ctx.value) > maxWei) {
        return { allowed: false, rule, reason: `Value exceeds cap (${rule.maxValueEth} ETH)` };
      }
    }
    if (rule.maxGasLimit !== null && ctx.gasLimit !== null) {
      if (BigInt(ctx.gasLimit) > BigInt(rule.maxGasLimit)) {
        return { allowed: false, rule, reason: `Gas exceeds cap (${rule.maxGasLimit})` };
      }
    }

    return { allowed: true, rule };
  }

  return { allowed: false, reason: 'No matching whitelist rule' };
}

function matchesRule(rule: WhitelistRule, ctx: TxContext): boolean {
  // Chain filter
  if (rule.chainId !== null && rule.chainId !== ctx.chainId) return false;

  // Origin dimension — STRICT equality on parsed origin to prevent prefix attacks
  // e.g. rule "https://app.uniswap.org" must NOT match "https://app.uniswap.org.evil.com"
  if (rule.origin !== null) {
    let ctxOrigin = ctx.origin;
    let ruleOrigin = rule.origin;
    try { ctxOrigin = new URL(ctx.origin).origin; } catch {}
    try { ruleOrigin = new URL(rule.origin).origin; } catch {}
    if (ctxOrigin !== ruleOrigin) return false;
  }

  // Contract address dimension
  if (rule.contractAddress !== null) {
    if (!ctx.to) return false;
    if (ctx.to.toLowerCase() !== rule.contractAddress.toLowerCase()) return false;
  }

  // Method signature dimension (first 4 bytes of calldata)
  if (rule.methodSig !== null) {
    if (!ctx.data || ctx.data.length < 10) return false;
    const selector = ctx.data.slice(0, 10).toLowerCase();
    if (selector !== rule.methodSig.toLowerCase()) return false;
  }

  // At least one dimension must be set (don't auto-sign with an empty rule)
  if (rule.origin === null && rule.contractAddress === null && rule.methodSig === null) {
    return false;
  }

  return true;
}
