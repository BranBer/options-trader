// ============================================================
// Epic 43 — Nexus Company Seed List
// ============================================================

export interface NexusDependency {
  ticker: string;
  relationship: string; // short description of why it's a dependent
  edgeWeight: number; // 0-1 cascade strength (0.9=sole source, 0.3=minor)
  directionality: "customer" | "supplier" | "platform" | "competitive";
}

export interface NexusCompany {
  ticker: string;
  name: string;
  sector: string;
  nexusRole: string;
  cascadeSignal: string;
  dependents: NexusDependency[];
}

export const NEXUS_COMPANIES: NexusCompany[] = [
  // --- Semiconductors & Equipment ---
  {
    ticker: "TSM",
    name: "TSMC",
    sector: "Semiconductors",
    nexusRole: "Sole leading-edge foundry (~90% share)",
    cascadeSignal: "Revenue guidance → chip supply outlook for entire industry",
    dependents: [
      {
        ticker: "NVDA",
        relationship: "Largest GPU client, N5/N4 process",
        edgeWeight: 0.8,
        directionality: "customer",
      },
      {
        ticker: "AMD",
        relationship: "CPU/GPU fabrication on N5/N4",
        edgeWeight: 0.7,
        directionality: "customer",
      },
      {
        ticker: "AAPL",
        relationship: "Largest N3 customer (iPhone/Mac)",
        edgeWeight: 0.9,
        directionality: "customer",
      },
      {
        ticker: "QCOM",
        relationship: "Snapdragon SoC fabrication",
        edgeWeight: 0.6,
        directionality: "customer",
      },
      {
        ticker: "AVGO",
        relationship: "Networking ASICs fabrication",
        edgeWeight: 0.5,
        directionality: "customer",
      },
      {
        ticker: "MRVL",
        relationship: "Custom silicon fabrication",
        edgeWeight: 0.5,
        directionality: "customer",
      },
    ],
  },
  {
    ticker: "ASML",
    name: "ASML Holding",
    sector: "Semiconductors",
    nexusRole: "Only EUV lithography vendor",
    cascadeSignal: "Order book → fab capex trajectory for 2-3 years out",
    dependents: [
      {
        ticker: "TSM",
        relationship: "Largest EUV customer",
        edgeWeight: 0.7,
        directionality: "customer",
      },
      {
        ticker: "INTC",
        relationship: "EUV for advanced nodes",
        edgeWeight: 0.4,
        directionality: "customer",
      },
    ],
  },
  {
    ticker: "NVDA",
    name: "NVIDIA",
    sector: "Semiconductors",
    nexusRole: "Dominant AI/ML GPU supplier (~80%+ data center AI)",
    cascadeSignal: "Data center revenue → AI capex cycle health",
    dependents: [
      {
        ticker: "MSFT",
        relationship: "Azure AI infrastructure",
        edgeWeight: 0.6,
        directionality: "customer",
      },
      {
        ticker: "GOOGL",
        relationship: "GCP AI/ML training",
        edgeWeight: 0.5,
        directionality: "customer",
      },
      {
        ticker: "AMZN",
        relationship: "AWS AI instances",
        edgeWeight: 0.5,
        directionality: "customer",
      },
      {
        ticker: "META",
        relationship: "AI training infrastructure",
        edgeWeight: 0.5,
        directionality: "customer",
      },
      {
        ticker: "ORCL",
        relationship: "OCI GPU cloud buildout",
        edgeWeight: 0.4,
        directionality: "customer",
      },
      {
        ticker: "SMCI",
        relationship: "GPU server assembly",
        edgeWeight: 0.8,
        directionality: "customer",
      },
    ],
  },
  {
    ticker: "AVGO",
    name: "Broadcom",
    sector: "Semiconductors",
    nexusRole: "Dominant networking/custom silicon + VMware",
    cascadeSignal: "Enterprise networking + VMware revenue → IT spending",
    dependents: [
      {
        ticker: "AMZN",
        relationship: "Custom AI chip design (Trainium)",
        edgeWeight: 0.4,
        directionality: "customer",
      },
      {
        ticker: "GOOGL",
        relationship: "Custom TPU design partner",
        edgeWeight: 0.5,
        directionality: "customer",
      },
      {
        ticker: "VMW",
        relationship: "VMware ecosystem (acquired)",
        edgeWeight: 0.3,
        directionality: "platform",
      },
    ],
  },

  // --- Cloud & Platform ---
  {
    ticker: "AMZN",
    name: "Amazon (AWS)",
    sector: "Cloud",
    nexusRole: "Largest cloud IaaS provider (~31% share)",
    cascadeSignal: "AWS growth rate → cloud demand proxy",
    dependents: [
      {
        ticker: "SNOW",
        relationship: "Runs primarily on AWS",
        edgeWeight: 0.7,
        directionality: "platform",
      },
      {
        ticker: "MDB",
        relationship: "Atlas hosted on AWS",
        edgeWeight: 0.5,
        directionality: "platform",
      },
      {
        ticker: "DDOG",
        relationship: "Cloud monitoring, AWS-native",
        edgeWeight: 0.6,
        directionality: "platform",
      },
      {
        ticker: "NET",
        relationship: "CDN/edge complementary to AWS",
        edgeWeight: 0.3,
        directionality: "platform",
      },
    ],
  },
  {
    ticker: "MSFT",
    name: "Microsoft (Azure)",
    sector: "Cloud",
    nexusRole: "#2 cloud + enterprise software monopoly",
    cascadeSignal: "Azure growth + Office/365 → enterprise spending health",
    dependents: [
      {
        ticker: "CRM",
        relationship: "Competes but also Azure customer",
        edgeWeight: 0.3,
        directionality: "competitive",
      },
      {
        ticker: "TEAM",
        relationship: "Enterprise productivity overlap",
        edgeWeight: 0.3,
        directionality: "competitive",
      },
      {
        ticker: "NVDA",
        relationship: "Largest AI GPU buyer for Azure",
        edgeWeight: 0.5,
        directionality: "supplier",
      },
    ],
  },
  {
    ticker: "GOOGL",
    name: "Alphabet (GCP + Ads)",
    sector: "Cloud",
    nexusRole: "Ad revenue bellwether + #3 cloud",
    cascadeSignal:
      "Ad revenue → digital advertising cycle; GCP → cloud sentiment",
    dependents: [
      {
        ticker: "SNAP",
        relationship: "Competes for same ad budgets",
        edgeWeight: 0.4,
        directionality: "competitive",
      },
      {
        ticker: "PINS",
        relationship: "Competes for same ad budgets",
        edgeWeight: 0.3,
        directionality: "competitive",
      },
      {
        ticker: "TTD",
        relationship: "Programmatic ad demand proxy",
        edgeWeight: 0.4,
        directionality: "platform",
      },
    ],
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    sector: "Cloud",
    nexusRole: "Largest social ad platform + AI capex driver",
    cascadeSignal:
      "Ad revenue → social media health; capex → AI hardware demand",
    dependents: [
      {
        ticker: "SNAP",
        relationship: "Social ad spend overlap",
        edgeWeight: 0.5,
        directionality: "competitive",
      },
      {
        ticker: "PINS",
        relationship: "Social ad spend overlap",
        edgeWeight: 0.4,
        directionality: "competitive",
      },
      {
        ticker: "NVDA",
        relationship: "AI training GPU buyer",
        edgeWeight: 0.4,
        directionality: "supplier",
      },
    ],
  },

  // --- Consumer & Retail ---
  {
    ticker: "AAPL",
    name: "Apple",
    sector: "Consumer",
    nexusRole: "Largest consumer electronics company",
    cascadeSignal: "iPhone unit guidance → component supplier revenue",
    dependents: [
      {
        ticker: "TSM",
        relationship: "Sole A-series/M-series fab",
        edgeWeight: 0.3,
        directionality: "supplier",
      },
      {
        ticker: "QCOM",
        relationship: "Modem chips (partial)",
        edgeWeight: 0.4,
        directionality: "supplier",
      },
      {
        ticker: "SWKS",
        relationship: "RF front-end components",
        edgeWeight: 0.7,
        directionality: "supplier",
      },
      {
        ticker: "CRUS",
        relationship: "Audio codec chips",
        edgeWeight: 0.8,
        directionality: "supplier",
      },
    ],
  },
  {
    ticker: "WMT",
    name: "Walmart",
    sector: "Consumer",
    nexusRole: "Largest retailer, consumer spending proxy",
    cascadeSignal:
      "Same-store sales → consumer health; inventory → supplier orders",
    dependents: [
      {
        ticker: "PG",
        relationship: "Major CPG supplier",
        edgeWeight: 0.5,
        directionality: "supplier",
      },
      {
        ticker: "KO",
        relationship: "Major beverage supplier",
        edgeWeight: 0.4,
        directionality: "supplier",
      },
      {
        ticker: "PEP",
        relationship: "Major beverage/snack supplier",
        edgeWeight: 0.4,
        directionality: "supplier",
      },
      {
        ticker: "UPS",
        relationship: "Shipping volume proxy",
        edgeWeight: 0.3,
        directionality: "supplier",
      },
    ],
  },

  // --- Financials & Payments ---
  {
    ticker: "V",
    name: "Visa",
    sector: "Financials",
    nexusRole: "Dominant global payment network (~50% share with MA)",
    cascadeSignal: "Cross-border volume → global economic activity",
    dependents: [
      {
        ticker: "MA",
        relationship: "Competitive read-through",
        edgeWeight: 0.8,
        directionality: "competitive",
      },
      {
        ticker: "SQ",
        relationship: "Payment processing dependent",
        edgeWeight: 0.4,
        directionality: "platform",
      },
      {
        ticker: "PYPL",
        relationship: "Payment processing dependent",
        edgeWeight: 0.4,
        directionality: "platform",
      },
    ],
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase",
    sector: "Financials",
    nexusRole: "Largest US bank, credit cycle bellwether",
    cascadeSignal: "Loan growth, credit losses → banking sector health",
    dependents: [
      {
        ticker: "BAC",
        relationship: "Peer bank read-through",
        edgeWeight: 0.7,
        directionality: "competitive",
      },
      {
        ticker: "WFC",
        relationship: "Peer bank read-through",
        edgeWeight: 0.6,
        directionality: "competitive",
      },
      {
        ticker: "GS",
        relationship: "IB/trading read-through",
        edgeWeight: 0.5,
        directionality: "competitive",
      },
    ],
  },

  // --- Energy & Infrastructure ---
  {
    ticker: "XOM",
    name: "ExxonMobil",
    sector: "Energy",
    nexusRole: "Largest Western oil major, energy price proxy",
    cascadeSignal:
      "Production guidance + capex → OFS spending; downstream margins",
    dependents: [
      {
        ticker: "SLB",
        relationship: "Oilfield services demand",
        edgeWeight: 0.6,
        directionality: "supplier",
      },
      {
        ticker: "HAL",
        relationship: "Oilfield services demand",
        edgeWeight: 0.5,
        directionality: "supplier",
      },
      {
        ticker: "VLO",
        relationship: "Refining margin read-through",
        edgeWeight: 0.4,
        directionality: "competitive",
      },
    ],
  },
  {
    ticker: "LIN",
    name: "Linde",
    sector: "Industrials",
    nexusRole: "Largest industrial gas supplier",
    cascadeSignal:
      "Volume trends → industrial production across multiple sectors",
    dependents: [
      {
        ticker: "APD",
        relationship: "Peer industrial gas read-through",
        edgeWeight: 0.7,
        directionality: "competitive",
      },
      {
        ticker: "DD",
        relationship: "Specialty chemicals overlap",
        edgeWeight: 0.3,
        directionality: "competitive",
      },
    ],
  },

  // --- Healthcare ---
  {
    ticker: "UNH",
    name: "UnitedHealth Group",
    sector: "Healthcare",
    nexusRole: "Largest US health insurer + PBM",
    cascadeSignal: "Medical cost ratio → healthcare sector profitability",
    dependents: [
      {
        ticker: "HCA",
        relationship: "Hospital reimbursement rates",
        edgeWeight: 0.5,
        directionality: "supplier",
      },
      {
        ticker: "CI",
        relationship: "Peer insurer read-through",
        edgeWeight: 0.7,
        directionality: "competitive",
      },
      {
        ticker: "ELV",
        relationship: "Peer insurer read-through",
        edgeWeight: 0.7,
        directionality: "competitive",
      },
    ],
  },

  // --- Logistics ---
  {
    ticker: "FDX",
    name: "FedEx",
    sector: "Logistics",
    nexusRole: "Global logistics bellwether",
    cascadeSignal: "Volume trends + pricing → global trade health",
    dependents: [
      {
        ticker: "UPS",
        relationship: "Peer logistics read-through",
        edgeWeight: 0.8,
        directionality: "competitive",
      },
      {
        ticker: "AMZN",
        relationship: "E-commerce volume proxy",
        edgeWeight: 0.3,
        directionality: "customer",
      },
    ],
  },
  {
    ticker: "UPS",
    name: "UPS",
    sector: "Logistics",
    nexusRole: "#2 global parcel delivery",
    cascadeSignal: "Package volume → e-commerce and small business activity",
    dependents: [
      {
        ticker: "FDX",
        relationship: "Peer logistics read-through",
        edgeWeight: 0.8,
        directionality: "competitive",
      },
    ],
  },
];

/** Look up a nexus company by ticker */
export function getNexusCompany(ticker: string): NexusCompany | undefined {
  return NEXUS_COMPANIES.find(
    (n) => n.ticker.toUpperCase() === ticker.toUpperCase(),
  );
}

/** Get all tickers in the seed list */
export function getNexusTickers(): string[] {
  return NEXUS_COMPANIES.map((n) => n.ticker);
}

/** Check if a ticker is a known nexus company */
export function isNexusTicker(ticker: string): boolean {
  return NEXUS_COMPANIES.some(
    (n) => n.ticker.toUpperCase() === ticker.toUpperCase(),
  );
}

/** Find which nexus companies list `ticker` as a dependent */
export function findUpstreamNexus(ticker: string): NexusCompany[] {
  const upper = ticker.toUpperCase();
  return NEXUS_COMPANIES.filter((n) =>
    n.dependents.some((d) => d.ticker.toUpperCase() === upper),
  );
}
