import type { Metadata } from "next";
import { DeskPage } from "@/components/desk/DeskPage";

export const metadata: Metadata = {
  title: "Desk | Options Dashboard",
  description:
    "The owner's review surface for the paper-trading desk: strategy scoreboard, open and closed positions, signal calibration and system status. Nothing here trades for real.",
};

export default function DeskPageRoute() {
  return <DeskPage />;
}
