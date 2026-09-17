import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Le socle des menus de la barre de navigation : le bouton, le panneau animé
 * et les trois façons de refermer (souris, Échap, clic extérieur). Chaque menu
 * ne fournit que son contenu, `panelClassName` réglant sa largeur.
 */
export const NavDropdown = ({
  label,
  panelClassName,
  align = "left",
  children,
}: {
  label: string;
  panelClassName: string;
  /** Bord du bouton auquel le panneau s'aligne. */
  align?: "left" | "center";
  /** Reçoit une fonction de fermeture, à appeler sur les liens du panneau. */
  children: (close: () => void) => ReactNode;
}) => {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>();

  // Un survol qui traverse le vide entre le bouton et le panneau ne doit pas
  // refermer le menu : on laisse un court délai avant la fermeture.
  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
      window.clearTimeout(closeTimer.current);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1 text-[15px] font-medium text-foreground/80 transition-colors hover:text-foreground"
      >
        {label}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
            className={`absolute top-full z-50 pt-4 ${
              align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
            } ${panelClassName}`}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
