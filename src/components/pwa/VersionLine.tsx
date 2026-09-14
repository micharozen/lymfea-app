import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatVersionLine } from "@/lib/appVersion";
import DebugPanelDialog from "./DebugPanelDialog";

interface VersionLineProps {
  therapistId?: string | null;
  userId?: string | null;
}

const TAPS_TO_UNLOCK = 5;
const TAP_WINDOW_MS = 1000;

/**
 * Ligne de version discrète, avec accès au panneau de debug par 5 taps.
 *
 * Le compteur est local à l'élément — contrairement à DebugViewportOverlay qui
 * écoute au niveau `document` et s'ouvrirait donc sur 5 clics n'importe où.
 */
const VersionLine = ({ therapistId, userId }: VersionLineProps) => {
  const { t } = useTranslation("pwa");
  const [open, setOpen] = useState(false);
  const taps = useRef(0);
  const resetTimer = useRef<number>();

  // Convention déjà établie par DebugViewportOverlay : ?debug=true ou le flag
  // persisté ouvrent le panneau sans avoir à retaper.
  useEffect(() => {
    try {
      const enabled =
        localStorage.getItem("app-debug") === "true" ||
        new URLSearchParams(window.location.search).get("debug") === "true";
      if (enabled) setOpen(true);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const handleTap = () => {
    taps.current += 1;
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      taps.current = 0;
    }, TAP_WINDOW_MS);

    if (taps.current >= TAPS_TO_UNLOCK) {
      taps.current = 0;
      try {
        localStorage.setItem("app-debug", "true");
      } catch {
        // Ignore storage errors
      }
      setOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleTap}
        className="mt-3 w-full select-none text-center text-[11px] text-muted-foreground"
      >
        {t("profile.version")} {formatVersionLine()}
      </button>

      <DebugPanelDialog
        open={open}
        onOpenChange={setOpen}
        therapistId={therapistId}
        userId={userId}
      />
    </>
  );
};

export default VersionLine;
