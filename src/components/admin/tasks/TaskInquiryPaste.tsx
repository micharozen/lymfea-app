import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { confidenceClass, formatConfidence } from "@/components/admin/inbox/inquiryStatus";

/** Sous-ensemble de ParsedEmail réellement exploité pour remplir une tâche. */
export interface ParsedInquiryText {
  client_first_name: string | null;
  client_last_name: string | null;
  email: string | null;
  phone: string | null;
  requested_date: string | null;
  treatment_match: { id: string | null } | null;
  /** Titre court proposé pour la tâche. */
  summary: string | null;
  notes: string | null;
  intent_confidence: number;
  /** Toutes les dates proposées, dans l'ordre de préférence du client. */
  requested_dates?: string[];
}

/** Arbitrage entre plusieurs dates proposées, renvoyé par l'edge function. */
export interface DateResolution {
  date: string | null;
  rejected: Array<{ date: string; reason: "not_deployed" | "no_slot" }>;
  hadAlternatives: boolean;
}

interface Props {
  hotelId: string;
  /** Texte à analyser — le contenu du champ description. */
  text: string;
  onExtracted: (parsed: ParsedInquiryText) => void;
  /** Passe le formulaire en attente pendant l'appel. */
  onLoadingChange?: (loading: boolean) => void;
  disabled?: boolean;
}

/**
 * Analyse le texte d'une demande et en pré-remplit la tâche.
 *
 * Il n'y a qu'un seul champ de saisie : on colle la demande dans la
 * description, et ce bouton l'analyse. Réutilise l'extracteur d'intention de
 * l'Inbox via `llm-agent` (action `parse-inquiry-text`) — même modèle, même
 * prompt, même catalogue de soins. Rien n'est écrit en base ici : seuls les
 * champs validés par l'opérateur seront enregistrés, et la description reste
 * modifiable après coup.
 */
export function TaskInquiryPaste({
  hotelId,
  text,
  onExtracted,
  onLoadingChange,
  disabled,
}: Props) {
  const { t, i18n } = useTranslation("admin");
  const [loading, setLoading] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);

  const setBusy = (busy: boolean) => {
    setLoading(busy);
    onLoadingChange?.(busy);
  };

  const analyze = async () => {
    if (!hotelId) {
      toast.error(t("tasks.fields.selectVenueFirst"));
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await invokeEdgeFunction<
        { action: string; hotelId: string; text: string },
        {
          parsed: ParsedInquiryText | null;
          error: string | null;
          dateResolution?: DateResolution;
        }
      >("llm-agent", {
        body: { action: "parse-inquiry-text", hotelId, text },
      });

      const parsed = data?.parsed ?? null;
      if (error || !parsed) {
        toast.error(error?.message ?? data?.error ?? t("tasks.messages.analyzeFailed"));
        return;
      }
      setConfidence(parsed.intent_confidence ?? null);
      onExtracted(parsed);

      // Le client proposait plusieurs dates : on dit laquelle a été retenue et
      // pourquoi, sinon la date pré-remplie paraîtrait sortie de nulle part.
      const resolution = data?.dateResolution;
      if (resolution?.hadAlternatives && resolution.rejected.length > 0) {
        const format = (iso: string) =>
          new Date(`${iso}T00:00:00`).toLocaleDateString(
            i18n.language.startsWith("en") ? "en-GB" : "fr-FR",
          );
        toast.success(
          resolution.date
            ? t("tasks.messages.dateFallback", {
                kept: format(resolution.date),
                rejected: resolution.rejected.map((r) => format(r.date)).join(", "),
              })
            : t("tasks.messages.dateNoneAvailable", {
                rejected: resolution.rejected.map((r) => format(r.date)).join(", "),
              }),
        );
      } else {
        toast.success(t("tasks.messages.analyzeSuccess"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tasks.messages.analyzeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={analyze}
        disabled={disabled || loading || text.trim().length < 10}
      >
        {loading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        )}
        {t("tasks.fields.analyze")}
      </Button>
      {confidence !== null && (
        <span className={cn("text-xs", confidenceClass(confidence))}>
          {t("tasks.messages.confidence", { value: formatConfidence(confidence) })}
        </span>
      )}
      <span className="text-muted-foreground text-[11px]">{t("tasks.messages.analyzeHint")}</span>
    </div>
  );
}
