import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUser } from "./UserContext";

export type ViewMode = "admin" | "venue_manager";

export interface ViewModeState {
  mode: ViewMode;
  venueId: string | null;
}

interface ViewModeContextValue extends ViewModeState {
  switchToVenue: (venueId: string) => void;
  switchToAdmin: () => void;
  canSwitch: boolean;
}

const STORAGE_KEY = "eia.viewMode";
const DEFAULT_STATE: ViewModeState = { mode: "admin", venueId: null };

const ViewModeContext = createContext<ViewModeContextValue | undefined>(undefined);

function readPersisted(): ViewModeState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ViewModeState>;
    if (parsed?.mode === "venue_manager" && typeof parsed.venueId === "string") {
      return { mode: "venue_manager", venueId: parsed.venueId };
    }
    return DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function writePersisted(state: ViewModeState) {
  if (typeof window === "undefined") return;
  try {
    if (state.mode === "admin") {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useUser();
  const [state, setState] = useState<ViewModeState>(() => readPersisted());

  // Force back to admin mode if user loses admin privileges (defensive).
  useEffect(() => {
    if (loading) return;
    if (!isAdmin && state.mode === "venue_manager") {
      setState(DEFAULT_STATE);
      writePersisted(DEFAULT_STATE);
    }
  }, [isAdmin, loading, state.mode]);

  const switchToVenue = useCallback((venueId: string) => {
    const next: ViewModeState = { mode: "venue_manager", venueId };
    setState(next);
    writePersisted(next);
  }, []);

  const switchToAdmin = useCallback(() => {
    setState(DEFAULT_STATE);
    writePersisted(DEFAULT_STATE);
  }, []);

  const value = useMemo<ViewModeContextValue>(
    () => ({
      mode: state.mode,
      venueId: state.venueId,
      switchToVenue,
      switchToAdmin,
      canSwitch: isAdmin,
    }),
    [state.mode, state.venueId, switchToVenue, switchToAdmin, isAdmin],
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeContextValue {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error("useViewMode must be used within a ViewModeProvider");
  return ctx;
}
