import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useUser } from "@/contexts/UserContext";

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
}

const TALLY_URL = (import.meta.env.VITE_TALLY_URL as string | undefined) || "";
const CALENDLY_URL = (import.meta.env.VITE_CALENDLY_URL as string | undefined) || "";

export function WelcomeDialog({ open, onClose }: WelcomeDialogProps) {
  const { t } = useTranslation("admin");
  const [step, setStep] = useState(0);
  const { canSwitch, switchToVenue } = useViewMode();
  const { isAdmin } = useUser();
  const navigate = useNavigate();
  const [pickingVenue, setPickingVenue] = useState(false);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  const totalSteps = 3;
  const isFirst = step === 0;
  const isLast = step === totalSteps - 1;

  const next = () => setStep((s) => Math.min(s + 1, totalSteps - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleClose = () => {
    onClose();
  };

  const handleTryVenueMode = async () => {
    if (!canSwitch) return;
    setPickingVenue(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("hotels")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(20);
      const list = (data ?? []) as { id: string; name: string }[];
      setVenues(list);
      if (list.length === 1) {
        switchToVenue(list[0].id);
        await onClose();
        navigate("/admin");
      }
    } finally {
      setPickingVenue(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="relative">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 pt-5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="px-7 pt-6 pb-4"
            >
              {step === 0 && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Sparkles className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-semibold">
                      {t("welcome.step1.title", "Bienvenue sur Eïa")}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {t(
                        "welcome.step1.body",
                        "Eïa centralise vos réservations, votre planning thérapeutes et votre billing en un seul endroit. Ce guide rapide vous présente les zones clés de l'app.",
                      )}
                    </p>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-serif font-semibold text-center">
                    {t("welcome.step2.title", "Trois zones essentielles")}
                  </h2>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {t("welcome.step2.agenda.title", "Planning")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "welcome.step2.agenda.body",
                            "Vue calendrier par lieu, salle et thérapeute. Créez et déplacez vos réservations.",
                          )}
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {t("welcome.step2.therapists.title", "Thérapeutes & soins")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "welcome.step2.therapists.body",
                            "Ajoutez votre équipe, leurs spécialisations et leur planning.",
                          )}
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <Wallet className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {t("welcome.step2.finance.title", "Finance")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "welcome.step2.finance.body",
                            "Suivez votre chiffre d'affaires, commissions thérapeutes et payouts.",
                          )}
                        </p>
                      </div>
                    </li>
                  </ul>
                  {isAdmin && canSwitch && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mt-2">
                      <div className="flex items-start gap-2">
                        <ArrowRightLeft className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.75} />
                        <div>
                          <p className="text-sm font-medium">
                            {t("welcome.step2.switcher.title", "Astuce : mode Gestion du lieu")}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t(
                              "welcome.step2.switcher.body",
                              "Depuis la barre latérale, basculez vers la perspective d'un directeur de lieu en un clic.",
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-serif font-semibold text-center">
                    {t("welcome.step3.title", "Votre avis compte")}
                  </h2>
                  <p className="text-sm text-muted-foreground text-center">
                    {t(
                      "welcome.step3.body",
                      "Vous testez Eïa : dites-nous tout. Vos retours guident la roadmap.",
                    )}
                  </p>
                  <div className="grid gap-2">
                    {TALLY_URL && (
                      <a
                        href={TALLY_URL}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-primary" strokeWidth={1.75} />
                          <span className="text-sm font-medium">
                            {t("welcome.step3.feedback", "Donner mon avis (5 min)")}
                          </span>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                    {CALENDLY_URL && (
                      <a
                        href={CALENDLY_URL}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-primary" strokeWidth={1.75} />
                          <span className="text-sm font-medium">
                            {t("welcome.step3.calendly", "Réserver un point visio (20 min)")}
                          </span>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                    {isAdmin && canSwitch && (
                      <button
                        type="button"
                        onClick={handleTryVenueMode}
                        disabled={pickingVenue}
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="h-4 w-4 text-primary" strokeWidth={1.75} />
                          <span className="text-sm font-medium">
                            {t("welcome.step3.trySwitcher", "Essayer le mode Gestion du lieu")}
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                  {venues.length > 1 && (
                    <div className="rounded-lg border border-border p-2 max-h-40 overflow-auto">
                      <p className="text-xs text-muted-foreground px-2 py-1">
                        {t("welcome.step3.pickVenue", "Choisissez un lieu :")}
                      </p>
                      {venues.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={async () => {
                            switchToVenue(v.id);
                            await onClose();
                            navigate("/admin");
                          }}
                          className="block w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent"
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border bg-muted/30">
            <button
              type="button"
              onClick={handleClose}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("welcome.skip", "Passer")}
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button variant="ghost" size="sm" onClick={prev}>
                  {t("welcome.back", "Retour")}
                </Button>
              )}
              {isLast ? (
                <Button size="sm" onClick={handleClose}>
                  {t("welcome.finish", "Terminer")}
                </Button>
              ) : (
                <Button size="sm" onClick={next}>
                  {t("welcome.next", "Suivant")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
