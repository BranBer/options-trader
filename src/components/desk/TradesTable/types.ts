import type { PaperTrade } from "@/types/desk";

export type TradesTableVariant = "open" | "closed";

export interface TradesTableProps {
  variant: TradesTableVariant;
  trades: PaperTrade[];
}
