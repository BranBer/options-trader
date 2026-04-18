import type { OptionsChainSummary } from "@/types/market";

export function buildRichOptionsChainSummary(
  chain: OptionsChainSummary,
  currentPrice: number,
): string {
  const allCalls = chain.nearestExpiry.calls;
  const allPuts = chain.nearestExpiry.puts;
  const totalCallVol = allCalls.reduce(
    (sum, contract) => sum + contract.volume,
    0,
  );
  const totalPutVol = allPuts.reduce(
    (sum, contract) => sum + contract.volume,
    0,
  );
  const totalCallOI = allCalls.reduce(
    (sum, contract) => sum + contract.openInterest,
    0,
  );
  const totalPutOI = allPuts.reduce(
    (sum, contract) => sum + contract.openInterest,
    0,
  );
  const pcRatio =
    totalCallVol > 0 ? (totalPutVol / totalCallVol).toFixed(2) : "N/A";

  const atmCalls = allCalls.filter(
    (contract) =>
      Math.abs(contract.strike - currentPrice) / currentPrice < 0.05,
  );
  const atmPuts = allPuts.filter(
    (contract) =>
      Math.abs(contract.strike - currentPrice) / currentPrice < 0.05,
  );
  const avgIV = [...atmCalls, ...atmPuts]
    .filter((contract) => contract.iv > 0)
    .reduce(
      (sum, contract, _, contracts) => sum + contract.iv / contracts.length,
      0,
    );

  return `Nearest expiry: ${chain.nearestExpiry.date}
Expirations available: ${chain.expirations.length}
Total call volume: ${totalCallVol} | Total put volume: ${totalPutVol}
Put/Call ratio: ${pcRatio}
Total call OI: ${totalCallOI} | Total put OI: ${totalPutOI}
ATM avg IV: ${(avgIV * 100).toFixed(1)}%
ATM calls: ${atmCalls.map((contract) => `$${contract.strike} (bid:${contract.bid} ask:${contract.ask} vol:${contract.volume} OI:${contract.openInterest} IV:${(contract.iv * 100).toFixed(1)}%)`).join(", ") || "none"}
ATM puts: ${atmPuts.map((contract) => `$${contract.strike} (bid:${contract.bid} ask:${contract.ask} vol:${contract.volume} OI:${contract.openInterest} IV:${(contract.iv * 100).toFixed(1)}%)`).join(", ") || "none"}`;
}
