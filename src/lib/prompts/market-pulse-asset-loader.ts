import fs from "node:fs";
import path from "node:path";

const assetCache = new Map<string, string>();

export function loadMarketPulseAsset(fileName: string): string {
  const cached = assetCache.get(fileName);
  if (cached) return cached;

  const assetPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    fileName,
  );
  const content = fs.readFileSync(assetPath, "utf8").trim();
  assetCache.set(fileName, content);
  return content;
}

export function clearMarketPulseAssetCache(): void {
  assetCache.clear();
}
