import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Send, Sparkles, X } from "lucide-react";

import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

interface Props {
  inquiryId: string;
  /** Address extracted by the parser; falls back to the SMTP sender. */
  defaultRecipient: string;
  /** Actual SMTP sender, surfaced when it differs from the prefilled address. */
  smtpSender: string;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ReplyDraftComposer({ inquiryId, defaultRecipient, smtpSender, onClose, onSent }: Props) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>("loading");
  const [loadingStep, setLoadingStep] = useState<"availability" | "drafting">("availability");
  const [recipient, setRecipient] = useState(defaultRecipient);
  // Champs À / Sujet repliés par défaut — dépliés d'emblée si l'adresse extraite
  // ne correspond pas à l'expéditeur SMTP, cas qui mérite une vérification.
  const [fieldsOpen, setFieldsOpen] = useState(defaultRecipient !== smtpSender);
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
    if (!EMAIL_RE.test(recipient.trim())) {
      toast.error(t("inbox.detail.reply.invalidRecipient", {
        defaultValue: "Adresse du destinataire invalide",
      }));
      return;
    }
    setStage("sending");
    const { data: result, error: sendError } = await invokeEdgeFunction<
      { inquiryId: string; to: string; subject: string; body: string },
      { ok: boolean; warning?: string }
    >("send-inquiry-reply", {
      body: { inquiryId, to: recipient.trim(), subject: subject.trim(), body: body.trim() },
    });

    if (sendError || !result?.ok) {
      toast.error(sendError?.message ?? t("inbox.detail.reply.sendFailed"));
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

  // L'adresse mérite un coup d'œil quand elle a été modifiée, ou quand le parser
  // l'a tirée du corps du mail alors que l'expéditeur SMTP est différent.
  const recipientEdited = recipient.trim() !== defaultRecipient;
  const recipientFromBody = !recipientEdited && defaultRecipient !== smtpSender;

  return (
    <div className="compose-bar">
      <div className="top">
        <span className="who">
          <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.5} />
          {t("inbox.detail.reply.composerTitle", { defaultValue: "Brouillon de réponse" })}
        </span>
        <button
          type="button"
          className={`to${recipientEdited || recipientFromBody ? " alt" : ""}`}
          onClick={() => setFieldsOpen(v => !v)}
          aria-expanded={fieldsOpen}
        >
          {t("inbox.detail.reply.collapsedTo", { defaultValue: "à : {{email}}", email: recipient })}
          {fieldsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <button
          type="button"
          className="x"
          onClick={onClose}
          disabled={stage === "sending"}
          aria-label={t("inbox.detail.reply.cancel", { defaultValue: "Annuler" })}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {stage === "loading" ? (
        <div className="compose-loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingMessage}
        </div>
      ) : (
        <>
          {error && <p className="err">{error}</p>}

          {fieldsOpen && (
            <>
              <div className="fld">
                <label htmlFor="reply-to">
                  {t("inbox.detail.reply.recipientLabel", { defaultValue: "À" })}
                </label>
                <input
                  id="reply-to"
                  type="email"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  disabled={stage === "sending"}
                />
                {recipientEdited ? (
                  <p className="hint">
                    {t("inbox.detail.reply.recipientEdited", {
                      defaultValue: "Destinataire modifié (proposé : {{original}})",
                      original: defaultRecipient,
                    })}
                  </p>
                ) : recipientFromBody && (
                  <p className="hint">
                    {t("inbox.detail.reply.recipientFromBody", {
                      defaultValue: "Adresse extraite du message — l'expéditeur du mail est {{sender}}",
                      sender: smtpSender,
                    })}
                  </p>
                )}
              </div>

              <div className="fld">
                <label htmlFor="reply-subject">
                  {t("inbox.detail.reply.subjectLabel", { defaultValue: "Sujet" })}
                </label>
                <input
                  id="reply-subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  disabled={stage === "sending"}
                />
              </div>
            </>
          )}

          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            disabled={stage === "sending"}
            aria-label={t("inbox.detail.reply.bodyLabel", { defaultValue: "Message" })}
          />

          <div className="foot">
            {meta.availabilityChecked && meta.slots.length > 0 && (
              <span className="seg-note">
                {t("inbox.detail.reply.referencedSlots", {
                  defaultValue: "Disponibilités prises en compte : {{slots}}",
                  slots: meta.slots.slice(0, 6).join(", "),
                })}
              </span>
            )}
            <button
              type="button"
              className="bo-btn sm primary"
              onClick={handleSend}
              disabled={stage === "sending" || !body.trim()}
              style={{ marginLeft: "auto" }}
            >
              {stage === "sending" ? (
                <Loader2 className="h-[15px] w-[15px] animate-spin" />
              ) : (
                <Send className="h-[15px] w-[15px]" strokeWidth={1.5} />
              )}
              {t("inbox.detail.reply.send", { defaultValue: "Envoyer" })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
