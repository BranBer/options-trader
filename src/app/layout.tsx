import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/shared/QueryProvider";
import Navbar from "@/components/shared/Navbar";
import { IndicatorModalProvider } from "@/components/charts/IndicatorExplainers";
import { ToastProvider } from "@/components/shared/ToastProvider";

const analyticsSans = IBM_Plex_Sans({
  variable: "--font-analytics-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const analyticsMono = IBM_Plex_Mono({
  variable: "--font-analytics-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Options Intelligence Dashboard",
  description: "Real-time options flow analysis powered by AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${analyticsSans.variable} ${analyticsMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <QueryProvider>
          <ToastProvider>
            <TooltipProvider>
              <IndicatorModalProvider>
                <Navbar />
                <main
                  id="main-content"
                  className="flex-1 container mx-auto px-4 py-6"
                >
                  {children}
                </main>
              </IndicatorModalProvider>
            </TooltipProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
