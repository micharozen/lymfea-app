import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PhoneBookingDialog = lazy(
  () => import("@/components/booking/PhoneBookingDialog"),
);

export function PhoneBookingFab() {
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("phoneBooking.fabLabel")}
              onClick={() => setOpen(true)}
              className={cn(
                "fixed right-20 z-40",
                "h-14 w-14 rounded-full",
                "bg-primary text-primary-foreground",
                "shadow-lg shadow-primary/30",
                "flex items-center justify-center",
                "transition-transform hover:scale-105 active:scale-95",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              )}
              style={{
                bottom: "calc(0.5rem + env(safe-area-inset-bottom))",
              }}
            >
              <Phone className="h-6 w-6" />
              <kbd className="absolute -top-1 -right-1 inline-flex h-5 select-none items-center gap-0.5 rounded border bg-background px-1 font-mono text-[9px] font-medium text-muted-foreground shadow-sm">
                <span className="text-[9px]">⌘</span>⇧P
              </kbd>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="flex items-center gap-2">
            {t("phoneBooking.fabLabel")}
            <kbd className="inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>⇧P
            </kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {open && (
        <Suspense fallback={null}>
          <PhoneBookingDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
