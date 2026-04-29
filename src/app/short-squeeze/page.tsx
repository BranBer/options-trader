import type { Metadata } from "next";
import ShortSqueezePage from "@/components/short-squeeze/ShortSqueezePage";

export const metadata: Metadata = {
  title: "Squeeze Scan | Options Dashboard",
  description:
    "Ranked short squeeze candidates with composite risk scores powered by SI%, days-to-cover, whale flow, and FINRA short volume data.",
};

export default function ShortSqueezePageRoute() {
  return <ShortSqueezePage />;
}
