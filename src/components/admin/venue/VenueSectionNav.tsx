import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Building2,
  MapPin,
  Wallet,
  Settings,
  Timer,
  Clock,
  Users,
  Plug,
} from "lucide-react";

export interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
  activeClass?: string;
}

export const VENUE_CONFIG_SECTIONS: SectionDef[] = [
  { id: "identity", label: "Identité", icon: Building2 },
  { id: "location", label: "Localisation", icon: MapPin },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "booking-settings", label: "Réservation", icon: Settings },
  { id: "booking-rules", label: "Pré-réservation", icon: Timer },
  { id: "schedule", label: "Horaires", icon: Clock },
  { id: "team", label: "Équipe", icon: Users },
  { id: "pms", label: "PMS", icon: Plug },
];

function useActiveSection(sectionIds: string[]) {
  const [active, setActive] = useState(sectionIds[0]);
  const clickLockRef = useRef(false);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback((id: string) => {
    setActive(id);
    clickLockRef.current = true;
    const el = document.getElementById(id);
    if (el) {
      const SCROLL_OFFSET = 160;
      const scroller = (el.closest("main, [data-scroll-container]") as HTMLElement) || null;
      if (scroller) {
        const elTop = el.getBoundingClientRect().top;
        const scrollerTop = scroller.getBoundingClientRect().top;
        const target = scroller.scrollTop + (elTop - scrollerTop) - SCROLL_OFFSET;
        scroller.scrollTo({ top: target, behavior: "smooth" });
      } else {
        const target = window.scrollY + el.getBoundingClientRect().top - SCROLL_OFFSET;
        window.scrollTo({ top: target, behavior: "smooth" });
      }
    }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickLockRef.current = false;
    }, 800);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (clickLockRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -50% 0px", threshold: 0 }
    );

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds.join("|")]);

  return { active, handleClick };
}

/** Option 1: Floating sidebar TOC on the right */
export function VenueSectionNavSidebar({ sections }: { sections: SectionDef[] }) {
  const visibleIds = sections.map((s) => s.id);
  const { active, handleClick } = useActiveSection(visibleIds);

  // Only show sections whose element exists in DOM
  const [mounted, setMounted] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(visibleIds.filter((id) => document.getElementById(id)));
    }, 100);
    return () => clearTimeout(timer);
  }, [sections]);

  const filtered = sections.filter((s) => mounted.includes(s.id));

  if (filtered.length < 2) return null;

  return (
    <nav className="hidden xl:block sticky top-[120px] self-start w-48 shrink-0">
      <ul className="space-y-0.5">
        {filtered.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <li key={s.id}>
              <button
                onClick={() => handleClick(s.id)}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {s.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Pill-style sub-tabs (for controlled tab switching, not scroll-based) */
export interface SubTabDef {
  id: string;
  label: string;
  icon?: React.ElementType;
}

interface PillSubTabsProps {
  tabs: SubTabDef[];
  value: string;
  onValueChange: (id: string) => void;
  sticky?: boolean;
}

export function PillSubTabs({ tabs, value, onValueChange, sticky = true }: PillSubTabsProps) {
  return (
    <nav
      className={cn(
        "z-[8] bg-background/95 backdrop-blur-sm border-b -mx-4 md:-mx-6 px-4 md:px-6 mb-4",
        sticky && "sticky top-[105px]"
      )}
    >
      <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onValueChange(t.id)}
              className={cn(
                "relative inline-flex items-center gap-1 h-7 px-2 text-[11px] leading-none whitespace-nowrap transition-colors shrink-0 border-b-2",
                isActive
                  ? "border-orange-500 text-orange-600 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Option 2: Horizontal sticky sub-nav bar */
export function VenueSectionNavBar({ sections }: { sections: SectionDef[] }) {
  const visibleIds = sections.map((s) => s.id);
  const { active, handleClick } = useActiveSection(visibleIds);

  const [mounted, setMounted] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(visibleIds.filter((id) => document.getElementById(id)));
    }, 100);
    return () => clearTimeout(timer);
  }, [sections]);

  const filtered = sections.filter((s) => mounted.includes(s.id));

  if (filtered.length < 2) return null;

  return (
    <nav className="sticky top-[105px] z-[8] bg-background/95 backdrop-blur-sm border-b -mx-4 md:-mx-6 px-4 md:px-6">
      <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
        {filtered.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => handleClick(s.id)}
              className={cn(
                "relative inline-flex items-center gap-1 h-7 px-2 text-[11px] leading-none whitespace-nowrap transition-colors shrink-0 border-b-2",
                isActive
                  ? (s.activeClass || "border-orange-500 text-orange-600 font-medium")
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3 shrink-0" />
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
