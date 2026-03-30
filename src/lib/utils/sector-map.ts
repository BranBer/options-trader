/**
 * Story 20.3 — Simple ticker→sector mapping for concentration checks.
 * Uses the 11 GICS sectors. Tickers not in the map default to "Unknown".
 */

export const TICKER_SECTOR_MAP: Record<string, string> = {
  // Technology
  AAPL: "Technology",
  MSFT: "Technology",
  NVDA: "Technology",
  AMD: "Technology",
  GOOGL: "Technology",
  GOOG: "Technology",
  META: "Technology",
  AMZN: "Technology",
  CRM: "Technology",
  ORCL: "Technology",
  ADBE: "Technology",
  INTC: "Technology",
  AVGO: "Technology",
  CSCO: "Technology",
  QCOM: "Technology",
  TXN: "Technology",
  MU: "Technology",
  AMAT: "Technology",
  LRCX: "Technology",
  KLAC: "Technology",
  SNPS: "Technology",
  CDNS: "Technology",
  MRVL: "Technology",
  NFLX: "Technology",
  SHOP: "Technology",
  NOW: "Technology",
  PANW: "Technology",
  CRWD: "Technology",
  SNOW: "Technology",
  DDOG: "Technology",
  ZS: "Technology",
  NET: "Technology",
  PLTR: "Technology",
  SMCI: "Technology",
  ARM: "Technology",
  DELL: "Technology",
  HPE: "Technology",
  IBM: "Technology",

  // Financials
  JPM: "Financials",
  BAC: "Financials",
  WFC: "Financials",
  GS: "Financials",
  MS: "Financials",
  C: "Financials",
  BLK: "Financials",
  SCHW: "Financials",
  AXP: "Financials",
  V: "Financials",
  MA: "Financials",
  PYPL: "Financials",
  SQ: "Financials",
  COF: "Financials",
  USB: "Financials",
  PNC: "Financials",

  // Healthcare
  UNH: "Healthcare",
  JNJ: "Healthcare",
  LLY: "Healthcare",
  PFE: "Healthcare",
  ABBV: "Healthcare",
  MRK: "Healthcare",
  TMO: "Healthcare",
  ABT: "Healthcare",
  BMY: "Healthcare",
  AMGN: "Healthcare",
  GILD: "Healthcare",
  ISRG: "Healthcare",
  MDT: "Healthcare",
  CI: "Healthcare",
  ELV: "Healthcare",
  HUM: "Healthcare",
  MRNA: "Healthcare",
  REGN: "Healthcare",
  VRTX: "Healthcare",

  // Energy
  XOM: "Energy",
  CVX: "Energy",
  COP: "Energy",
  SLB: "Energy",
  EOG: "Energy",
  MPC: "Energy",
  PSX: "Energy",
  VLO: "Energy",
  OXY: "Energy",
  HAL: "Energy",
  DVN: "Energy",
  FANG: "Energy",

  // Consumer Discretionary
  TSLA: "Consumer Discretionary",
  HD: "Consumer Discretionary",
  MCD: "Consumer Discretionary",
  NKE: "Consumer Discretionary",
  LOW: "Consumer Discretionary",
  SBUX: "Consumer Discretionary",
  TJX: "Consumer Discretionary",
  BKNG: "Consumer Discretionary",
  CMG: "Consumer Discretionary",
  ABNB: "Consumer Discretionary",
  GM: "Consumer Discretionary",
  F: "Consumer Discretionary",
  ROST: "Consumer Discretionary",
  DHI: "Consumer Discretionary",
  LEN: "Consumer Discretionary",
  LULU: "Consumer Discretionary",

  // Consumer Staples
  PG: "Consumer Staples",
  KO: "Consumer Staples",
  PEP: "Consumer Staples",
  COST: "Consumer Staples",
  WMT: "Consumer Staples",
  PM: "Consumer Staples",
  MO: "Consumer Staples",
  CL: "Consumer Staples",
  MDLZ: "Consumer Staples",
  GIS: "Consumer Staples",
  KHC: "Consumer Staples",
  STZ: "Consumer Staples",

  // Industrials
  CAT: "Industrials",
  DE: "Industrials",
  HON: "Industrials",
  UNP: "Industrials",
  BA: "Industrials",
  RTX: "Industrials",
  LMT: "Industrials",
  GE: "Industrials",
  MMM: "Industrials",
  UPS: "Industrials",
  FDX: "Industrials",
  GD: "Industrials",
  NOC: "Industrials",
  WM: "Industrials",

  // Materials
  LIN: "Materials",
  APD: "Materials",
  SHW: "Materials",
  ECL: "Materials",
  FCX: "Materials",
  NEM: "Materials",
  NUE: "Materials",
  DOW: "Materials",
  DD: "Materials",

  // Real Estate
  PLD: "Real Estate",
  AMT: "Real Estate",
  CCI: "Real Estate",
  EQIX: "Real Estate",
  SPG: "Real Estate",
  PSA: "Real Estate",
  O: "Real Estate",
  WELL: "Real Estate",

  // Utilities
  NEE: "Utilities",
  DUK: "Utilities",
  SO: "Utilities",
  D: "Utilities",
  AEP: "Utilities",
  SRE: "Utilities",
  EXC: "Utilities",
  XEL: "Utilities",
  ED: "Utilities",
  WEC: "Utilities",

  // Communication Services
  DIS: "Communication Services",
  CMCSA: "Communication Services",
  T: "Communication Services",
  VZ: "Communication Services",
  TMUS: "Communication Services",
  CHTR: "Communication Services",
  EA: "Communication Services",
  TTWO: "Communication Services",
  SNAP: "Communication Services",
  PINS: "Communication Services",
  ROKU: "Communication Services",
  SPOT: "Communication Services",

  // ETFs / Index
  SPY: "Index",
  QQQ: "Index",
  IWM: "Index",
  DIA: "Index",
  VTI: "Index",
  VOO: "Index",
};

/** Get the GICS sector for a ticker. Returns "Unknown" if not mapped. */
export function getSector(ticker: string): string {
  return TICKER_SECTOR_MAP[ticker.toUpperCase()] ?? "Unknown";
}

/** Known highly-correlated ticker pairs (same sector, similar business). */
export const CORRELATED_PAIRS: Array<[string, string]> = [
  ["AAPL", "MSFT"],
  ["AMD", "NVDA"],
  ["GOOGL", "GOOG"],
  ["GOOGL", "META"],
  ["V", "MA"],
  ["JPM", "BAC"],
  ["GS", "MS"],
  ["XOM", "CVX"],
  ["HD", "LOW"],
  ["KO", "PEP"],
  ["UNP", "CSX"],
  ["BA", "LMT"],
  ["PG", "CL"],
  ["UNH", "CI"],
  ["CRM", "NOW"],
  ["CRWD", "PANW"],
];

/** Check if two tickers are in a known correlated pair. */
export function areCorrelated(a: string, b: string): boolean {
  const au = a.toUpperCase();
  const bu = b.toUpperCase();
  return CORRELATED_PAIRS.some(
    ([x, y]) => (x === au && y === bu) || (x === bu && y === au),
  );
}
