"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Globe,
  BarChart3,
  Home,
  RefreshCw,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const navLinks = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/whale-alerts", label: "Whale Alerts", icon: Activity },
  { href: "/globe", label: "Globe", icon: Globe },
  { href: "/analysis", label: "Analysis", icon: BarChart3 },
];

export default function Navbar() {
  const pathname = usePathname();
  const [refreshStatus, setRefreshStatus] = useState<{
    lastRefresh: string | null;
    countdown: number;
  }>({ lastRefresh: null, countdown: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshStatus((prev) => ({
        ...prev,
        countdown: Math.max(0, prev.countdown - 1),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/cron");
      const data = await res.json();
      setRefreshStatus({
        lastRefresh: data.timestamp,
        countdown: 30 * 60, // Reset countdown
      });
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {navLinks.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => mobile && setMobileOpen(false)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            aria-label={
              mobileOpen ? "Close navigation menu" : "Open navigation menu"
            }
            className="md:hidden inline-flex items-center justify-center rounded-md text-sm font-medium h-9 w-9 hover:bg-muted transition-colors"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <div className="flex flex-col gap-1 mt-6">
              <NavItems mobile />
            </div>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Activity className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">Options Intel</span>
        </Link>

        <Separator orientation="vertical" className="h-6 hidden md:block" />

        {/* Desktop nav */}
        <nav
          className="hidden md:flex items-center gap-1"
          aria-label="Primary navigation"
        >
          <NavItems />
        </nav>

        {/* Right side: refresh controls */}
        <div className="ml-auto flex items-center gap-3">
          {refreshStatus.countdown > 0 && (
            <Badge variant="outline" className="text-xs font-mono">
              {formatCountdown(refreshStatus.countdown)}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={triggerRefresh}
            disabled={isRefreshing}
            aria-label={
              isRefreshing ? "Refreshing market data" : "Trigger manual refresh"
            }
            title="Trigger manual refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
          <span className="sr-only" aria-live="polite">
            {isRefreshing
              ? "Refreshing data"
              : refreshStatus.lastRefresh
                ? `Last refresh ${new Date(refreshStatus.lastRefresh).toLocaleTimeString()}`
                : "No refresh run yet"}
          </span>
        </div>
      </div>
    </header>
  );
}
