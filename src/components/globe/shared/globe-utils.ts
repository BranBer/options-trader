import type { NewsEvent } from "@/hooks/useApiData";

// ── Shared types ───────────────────────────────────────────────────────────

export type AnalysisState = {
  status: "idle" | "loading" | "done" | "error";
  cached: boolean;
  error?: string;
};

export type AnalyzedEventsResponse = {
  analyzedEventIds: number[];
  recentAnalyses: Array<{
    eventId: number;
    headline: string;
    tickers: string[];
    createdAt: string | null;
  }>;
};

export type ClusterPoint = {
  lat: number;
  lng: number;
  size: number;
  color: string;
  isCluster: true;
  clusterKey: string;
  count: number;
  topEvents: NewsEvent[];
};

export type EventPoint = {
  lat: number;
  lng: number;
  size: number;
  color: string;
  isCluster: false;
  clusterKey: string;
  clustered: boolean;
  event: NewsEvent;
};

export type GlobePoint = ClusterPoint | EventPoint;

// ── Color utilities ─────────────────────────────────────────────────────────

export function impactColor(score: number): string {
  if (score >= 8) return "#22d3ee";
  if (score >= 6) return "#3b82f6";
  if (score >= 4) return "#6366f1";
  return "#8b5cf6";
}

export function techImpactColor(score: number): string {
  if (score >= 8) return "#10b981";
  if (score >= 6) return "#06b6d4";
  if (score >= 4) return "#6366f1";
  return "#8b5cf6";
}

// ── Geography ───────────────────────────────────────────────────────────────

export const COUNTRY_COORDS: Record<string, [number, number]> = {
  // Americas
  US: [39.8283, -98.5795],
  CA: [56.1304, -106.3468],
  MX: [23.6345, -102.5528],
  BR: [-14.235, -51.9253],
  AR: [-38.4161, -63.6167],
  CL: [-35.6751, -71.543],
  CO: [4.5709, -74.2973],
  PE: [-9.19, -75.0152],
  // Europe
  GB: [55.3781, -3.436],
  DE: [51.1657, 10.4515],
  FR: [46.2276, 2.2137],
  IT: [41.8719, 12.5674],
  ES: [40.4637, -3.7492],
  NL: [52.1326, 5.2913],
  SE: [60.1282, 18.6435],
  NO: [60.472, 8.4689],
  FI: [61.9241, 25.7482],
  DK: [56.2639, 9.5018],
  CH: [46.8182, 8.2275],
  AT: [47.5162, 14.5501],
  BE: [50.5039, 4.4699],
  PL: [51.9194, 19.1451],
  UA: [48.3794, 31.1656],
  RU: [61.524, 105.3188],
  IE: [53.1424, -7.6921],
  PT: [39.3999, -8.2245],
  CZ: [49.8175, 15.473],
  RO: [45.9432, 24.9668],
  HU: [47.1625, 19.5033],
  GR: [39.0742, 21.8243],
  TR: [38.9637, 35.2433],
  // Middle East & Africa
  IL: [31.0461, 34.8516],
  SA: [23.8859, 45.0792],
  AE: [23.4241, 53.8478],
  IR: [32.4279, 53.688],
  EG: [26.8206, 30.8025],
  NG: [9.082, 8.6753],
  ZA: [-30.5595, 22.9375],
  KE: [-0.0236, 37.9062],
  // Asia-Pacific
  CN: [35.8617, 104.1954],
  JP: [36.2048, 138.2529],
  IN: [20.5937, 78.9629],
  KR: [35.9078, 127.7669],
  TW: [23.6978, 120.9605],
  SG: [1.3521, 103.8198],
  AU: [-25.2744, 133.7751],
  NZ: [-40.9006, 174.886],
  HK: [22.3193, 114.1694],
  MY: [4.2105, 101.9758],
  ID: [-0.7893, 113.9213],
  TH: [15.87, 100.9925],
  VN: [14.0583, 108.2772],
  PH: [12.8797, 121.774],
  PK: [30.3753, 69.3451],
  BD: [23.685, 90.3563],
};

/**
 * Resolve globe coordinates for a news event.
 *
 * Priority:
 *   1. COUNTRY_COORDS[countryCode] — Gemini-classified event country, semantically
 *      accurate regardless of where the news SOURCE is hosted.
 *   2. event.lat / event.lng — raw fetcher coordinates (source-country centroid
 *      or company HQ hint). Used only when the country code is not in our map.
 *   3. null — event is not rendered on the globe.
 */
export function getEventCoordinates(
  event: NewsEvent,
): { lat: number; lng: number } | null {
  // Prefer the Gemini-classified country code — this reflects WHERE the event
  // happened, not where the media source is hosted.
  if (event.countryCode) {
    const key = event.countryCode.toUpperCase().slice(0, 2);
    const coords = COUNTRY_COORDS[key];
    if (coords) return { lat: coords[0], lng: coords[1] };
  }
  // Fall back to raw fetcher lat/lng (better than nothing for countries
  // not in our centroid map, e.g. precise tech company HQ coordinates).
  if (event.lat != null && event.lng != null) {
    return { lat: event.lat, lng: event.lng };
  }
  return null;
}

// ── String/ticker helpers ───────────────────────────────────────────────────

export function parseStringArray(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function getAnalyzableTickers(event: NewsEvent): string[] {
  return [
    ...new Set(
      parseStringArray(event.tickers)
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    ),
  ].slice(0, 5);
}

// ── Clustering ──────────────────────────────────────────────────────────────

export function clusterKey(
  event: NewsEvent,
  coords: { lat: number; lng: number },
): string {
  const cc = event.countryCode?.toUpperCase().slice(0, 2);
  return cc ?? `${coords.lat.toFixed(0)},${coords.lng.toFixed(0)}`;
}

/**
 * Packs N circles of given radii tightly together using sequential
 * tangent-placement. Returns (x, y) offsets in degree units, centered
 * around (0, 0) so placement sits symmetrically over the geographic centroid.
 */
export function packCircles(radii: number[]): Array<{ x: number; y: number }> {
  const N = radii.length;
  if (N === 0) return [];
  type Placed = { x: number; y: number; r: number };
  const GAP = 0.08;
  const placed: Placed[] = [{ x: 0, y: 0, r: radii[0] }];
  if (N === 1) return [{ x: 0, y: 0 }];
  placed.push({ x: radii[0] + radii[1] + GAP, y: 0, r: radii[1] });
  for (let i = 2; i < N; i++) {
    const r = radii[i];
    let bestPos: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    const curBound = placed.reduce(
      (m, p) => Math.max(m, Math.sqrt(p.x * p.x + p.y * p.y) + p.r),
      0,
    );
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        const pa = placed[a];
        const pb = placed[b];
        const dA = pa.r + r + GAP;
        const dB = pb.r + r + GAP;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > dA + dB + 0.001 || d < Math.abs(dA - dB) - 0.001) continue;
        const aCoef = (dA * dA - dB * dB + d * d) / (2 * d);
        const hSq = dA * dA - aCoef * aCoef;
        if (hSq < 0) continue;
        const h = Math.sqrt(hSq);
        const mx = pa.x + (aCoef * dx) / d;
        const my = pa.y + (aCoef * dy) / d;
        for (const sign of [1, -1] as const) {
          const cx = mx + (sign * h * dy) / d;
          const cy = my - (sign * h * dx) / d;
          const overlaps = placed.some(
            (p) =>
              Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2) <
              p.r + r + GAP - 0.001,
          );
          if (overlaps) continue;
          const score = Math.max(curBound, Math.sqrt(cx * cx + cy * cy) + r);
          if (score < bestScore) {
            bestScore = score;
            bestPos = { x: cx, y: cy };
          }
        }
      }
    }
    if (!bestPos) {
      // Fallback: golden-angle spiral
      const angle = i * 2.39996;
      const rad = (placed[0].r + r + GAP) * (1 + Math.sqrt(i));
      bestPos = { x: rad * Math.cos(angle), y: rad * Math.sin(angle) };
    }
    placed.push({ x: bestPos.x, y: bestPos.y, r });
  }
  const meanX = placed.reduce((s, p) => s + p.x, 0) / placed.length;
  const meanY = placed.reduce((s, p) => s + p.y, 0) / placed.length;
  return placed.map(({ x, y }) => ({ x: x - meanX, y: y - meanY }));
}
