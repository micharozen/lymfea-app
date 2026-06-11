import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

interface Props {
  inquiryId: string;
  onClose: () => void;
  onSent: () => void;
}

interface DraftResponse {
  subject: string;
  body: string;
  language: string;
  availabilityChecked: boolean;
  availableSlotsPreview: string[];
}

type Stage = "loading" | "ready" | "sending";

export function ReplyDraftComposer({ inquiryId, onClose, onSent }: Props) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>("loading");
  const [loadingStep, setLoadingStep] = useState<"availability" | "drafting">("availability");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ availabilityChecked: boolean; slots: string[] }>({
    availabilityChecked: false,
    slots: [],
  });

  useEffect(() => {
    let cancelled = false;
    setStage("loading");
    setError(null);
    setLoadingStep("availability");

    // Visual hint: switch sub-step shortly after starting so the user sees both stages.
    const stepTimer = window.setTimeout(() => {
      if (!cancelled) setLoadingStep("drafting");
    }, 700);

    (async () => {
      const { data, error: invokeError } = await invokeEdgeFunction<
        { action: string; inquiryId: string },
        DraftResponse
      >("llm-agent", {
        body: { action: "generate-inquiry-reply", inquiryId },
      });
      if (cancelled) return;
      if (invokeError || !data || !data.body) {
        setError(invokeError?.message ?? t("inbox.detail.reply.draftFailed", {
          defaultValue: "Impossible de générer un brouillon",
        }));
        setStage("ready");
        return;
      }
      setSubject(data.subject ?? "");
      setBody(data.body ?? "");
      setMeta({
        availabilityChecked: data.availabilityChecked,
        slots: data.availableSlotsPreview ?? [],
      });
      setStage("ready");
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(stepTimer);
    };
  }, [inquiryId, t]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error(t("inbox.detail.reply.missingFields", { defaultValue: "Sujet et corps requis" }));
      return;
    }
    setStage("sending");
    const { data: result, error: sendError } = await invokeEdgeFunction<
      { inquiryId: string; subject: string; body: string },
      { ok: boolean; warning?: string }
    >("send-inquiry-reply", {
      body: { inquiryId, subject: subject.trim(), body: body.trim() },
    });

    if (sendError || !result?.ok) {
      toast.error(sendError?.message ?? "Send failed");
      setStage("ready");
      return;
    }
    if (result.warning) {
      toast.warning(t("inbox.detail.reply.sentWithWarning", {
        defaultValue: "Envoyé mais une étape a échoué : {{warning}}",
        warning: result.warning,
      }));
    } else {
      toast.success(t("inbox.detail.reply.sent", { defaultValue: "Réponse envoyée" }));
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["email-inquiries"] }),
      queryClient.invalidateQueries({ queryKey: ["email-inquiry-thread", inquiryId] }),
    ]);
    onSent();
  };

  const loadingMessage = loadingStep === "availability"
    ? t("inbox.detail.reply.checkingAvailability", { defaultValue: "Vérification des disponibilités…" })
    : t("inbox.detail.reply.draftingReply", { defaultValue: "Rédaction du brouillon…" });

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5 text-indigo-900">
          <Sparkles className="h-3.5 w-3.5" />
          {t("inbox.detail.reply.composerTitle", { defaultValue: "Brouillon de réponse" })}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={stage === "sending"}
          className="h-7 w-7 p-0 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {stage === "loading" ? (
        <div className="flex items-center gap-2 text-sm text-indigo-700 py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingMessage}
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {meta.availabilityChecked && meta.slots.length > 0 && (
            <p className="text-[11px] text-indigo-700/80">
              {t("inbox.detail.reply.referencedSlots", {
                defaultValue: "Disponibilités prises en compte : {{slots}}",
                slots: meta.slots.slice(0, 6).join(", "),
              })}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("inbox.detail.reply.subjectLabel", { defaultValue: "Sujet" })}
            </label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              disabled={stage === "sending"}
              className="bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("inbox.detail.reply.bodyLabel", { defaultValue: "Message" })}
            </label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              disabled={stage === "sending"}
              className="bg-white font-sans text-sm leading-relaxed"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={stage === "sending"}
            >
              {t("inbox.detail.reply.cancel", { defaultValue: "Annuler" })}
            </Button>
            <Button
              onClick={handleSend}
              disabled={stage === "sending" || !body.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {stage === "sending" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              {t("inbox.detail.reply.send", { defaultValue: "Envoyer" })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
