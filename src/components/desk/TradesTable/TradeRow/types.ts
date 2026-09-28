import type { PaperTrade } from "@/types/desk";

export interface TradeRowProps {
  trade: PaperTrade;
  variant: "open" | "closed";
}
