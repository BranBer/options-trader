"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
};

type ToastInput = {
  tone: ToastTone;
  message: string;
  durationMs?: number;
};

type ToastContextValue = {
  pushToast: (toast: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => undefined,
  dismissToast: () => undefined,
});

function toneClasses(tone: ToastTone) {
  if (tone === "success") {
    return "border-emerald-500/30 bg-emerald-500/12 text-emerald-50";
  }

  if (tone === "error") {
    return "border-rose-500/30 bg-rose-500/12 text-rose-50";
  }

  return "border-sky-500/30 bg-sky-500/12 text-sky-50";
}

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ tone, message, durationMs = 4000 }: ToastInput) => {
      const id =
        typeof crypto?.randomUUID === "function"
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      setToasts((current) => [...current, { id, tone, message }]);

      window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({ pushToast, dismissToast }),
    [dismissToast, pushToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-2xl border px-4 py-3 shadow-[0_18px_48px_rgba(2,6,23,0.45)] backdrop-blur-md",
              toneClasses(toast.tone),
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm leading-6">
                {toast.message}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-current hover:bg-white/10"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
