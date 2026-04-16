// Pure decision functions for whitelist rule matching.
// Zero IO, zero chrome dependency — fully testable with plain data.

import { parseEther } from 'viem';
import type { WhitelistRule, AutoSignResult } from '../types/whitelist';

export interface TxContext {
  origin: string;           // dApp origin, e.g. "https://app.uniswap.org"
  to: string | null;        // contract address
  data: string | null;      // calldata hex
  value: string;            // wei, decimal string
  gasLimit: string | null;  // decimal string
  chainId: number;
}

/** Normalize a URL string to its origin (protocol + host + port). */
export function normalizeOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

/**
 * Check whether a single rule matches a transaction context.
 * All enabled dimensions must match (AND logic).
 * A rule with all dimensions null never matches (safety guard).
 */
export function matchesRule(rule: WhitelistRule, ctx: TxContext): boolean {
  // Chain filter
  if (rule.chainId !== null && rule.chainId !== ctx.chainId) return false;

  // Origin dimension — STRICT equality on parsed origin to prevent prefix attacks
  // e.g. rule "https://app.uniswap.org" must NOT match "https://app.uniswap.org.evil.com"
  if (rule.origin !== null) {
    if (normalizeOrigin(ctx.origin) !== normalizeOrigin(rule.origin)) return false;
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

/** Check safety caps (value and gas) against a matched rule. */
export function checkSafetyCaps(
  rule: WhitelistRule,
  ctx: TxContext,
): { ok: boolean; reason?: string } {
  if (rule.maxValueEth !== null) {
    const maxWei = parseEther(rule.maxValueEth);
    if (BigInt(ctx.value) > maxWei) {
      return { ok: false, reason: `Value exceeds cap (${rule.maxValueEth} ETH)` };
    }
  }
  if (rule.maxGasLimit !== null && ctx.gasLimit !== null) {
    if (BigInt(ctx.gasLimit) > BigInt(rule.maxGasLimit)) {
      return { ok: false, reason: `Gas exceeds cap (${rule.maxGasLimit})` };
    }
  }
  return { ok: true };
}

/**
 * Evaluate all rules against a transaction context.
 * Pure function: rules in, decision out.
 */
export function evaluateRules(rules: WhitelistRule[], ctx: TxContext): AutoSignResult {
  const enabledRules = rules.filter((r) => r.enabled);

  for (const rule of enabledRules) {
    if (!matchesRule(rule, ctx)) continue;

    const caps = checkSafetyCaps(rule, ctx);
    if (!caps.ok) {
      return { allowed: false, rule, reason: caps.reason };
    }

    return { allowed: true, rule };
  }

  return { allowed: false, reason: 'No matching whitelist rule' };
}
