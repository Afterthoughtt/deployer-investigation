import { getSignaturesForAddress } from "../helius/rpc.js";

export interface FreshnessResult {
  priorSigCount: number;
  isFresh: boolean;
}

export type FreshnessChecker = (address: string) => Promise<FreshnessResult>;

/**
 * A recipient is fresh if it has ≤ 1 signature in its history. The funding tx
 * itself counts as 1 — so priorSigCount = 1 means "this tx is the first
 * signature ever associated with the address", priorSigCount = 0 means the
 * address has no on-chain footprint yet, and priorSigCount ≥ 2 means it had
 * prior activity before the funding tx landed.
 */
export function makeFreshnessChecker(
  apiKey: string,
  signal?: AbortSignal,
): FreshnessChecker {
  return async (address) => {
    const sigs = await getSignaturesForAddress(apiKey, address, {
      limit: 2,
      signal,
    });
    const priorSigCount = sigs.length;
    return { priorSigCount, isFresh: priorSigCount <= 1 };
  };
}
