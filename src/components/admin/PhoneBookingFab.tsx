import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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

const STORAGE_KEY = "phone-booking-fab-position";
const FAB_SIZE = 56;
const MARGIN = 8;
const DRAG_THRESHOLD = 5;

interface Position {
  x: number;
  y: number;
}

function loadPosition(): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function clampToViewport(pos: Position): Position {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - FAB_SIZE - MARGIN;
  const maxY = window.innerHeight - FAB_SIZE - MARGIN;
  return {
    x: Math.min(Math.max(pos.x, MARGIN), Math.max(maxX, MARGIN)),
    y: Math.min(Math.max(pos.y, MARGIN), Math.max(maxY, MARGIN)),
  };
}

export function PhoneBookingFab() {
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(() => loadPosition());
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  // Default position: bottom-right, accounting for safe-area
  useEffect(() => {
    if (position) {
      setPosition((p) => (p ? clampToViewport(p) : p));
      return;
    }
    const safeBottom = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--oom-safe-bottom") || "0",
    );
    setPosition({
      x: window.innerWidth - FAB_SIZE - 80,
      y: window.innerHeight - FAB_SIZE - 8 - (isNaN(safeBottom) ? 0 : safeBottom),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-clamp on resize
  useEffect(() => {
    const onResize = () => setPosition((p) => (p ? clampToViewport(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Desktop only: ignore touch/pen
      if (e.pointerType !== "mouse") return;
      if (!position) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
        moved: false,
      };
    },
    [position],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.moved = true;
    setIsDragging(true);
    setPosition(clampToViewport({ x: state.originX + dx, y: state.originY + dy }));
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      const moved = state.moved;
      dragStateRef.current = null;
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (moved) {
        setPosition((p) => {
          if (p) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
          return p;
        });
      } else {
        setOpen(true);
      }
    },
    [],
  );

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("phoneBooking.fabLabel")}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                dragStateRef.current = null;
                setIsDragging(false);
              }}
              className={cn(
                "fixed z-40",
                "h-14 w-14 rounded-full",
                "bg-primary text-primary-foreground",
                "shadow-lg shadow-primary/30",
                "flex items-center justify-center",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                "select-none touch-none",
                isDragging
                  ? "cursor-grabbing transition-none"
                  : "cursor-grab md:cursor-grab transition-transform hover:scale-105 active:scale-95",
              )}
              style={
                position
                  ? { left: position.x, top: position.y }
                  : { right: 80, bottom: "calc(0.5rem + env(safe-area-inset-bottom))" }
              }
            >
              <Phone className="h-6 w-6 pointer-events-none" />
              <kbd className="absolute -top-1 -right-1 inline-flex h-5 select-none items-center gap-0.5 rounded border bg-background px-1 font-mono text-[9px] font-medium text-muted-foreground shadow-sm pointer-events-none">
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
