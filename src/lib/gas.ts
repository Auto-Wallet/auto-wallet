// Multiply gas limit by 1.2 to absorb estimation variance. Contract calls'
// actual usage can exceed estimates, so we buffer every send to avoid OOG.
export function bufferGas(gas: bigint): bigint {
  return (gas * 12n) / 10n;
}
