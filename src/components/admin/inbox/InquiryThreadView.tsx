import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Mail, MailCheck } from "lucide-react";

import { useInquiryThread } from "@/hooks/inbox/useInquiryThread";
import type { EmailInquiry } from "@/hooks/inbox/useEmailInquiries";
import { cn } from "@/lib/utils";

interface Props {
  rootInquiryId: string;
  rootFallback?: EmailInquiry | null;
}

function plainBody(msg: EmailInquiry): string {
  if (msg.raw_body_text?.trim()) return msg.raw_body_text.trim();
  if (msg.raw_body_html) return msg.raw_body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return "";
}

export function InquiryThreadView({ rootInquiryId, rootFallback }: Props) {
  const { t } = useTranslation("admin");
  const { data: thread, isLoading } = useInquiryThread(rootInquiryId);

  const messages: EmailInquiry[] = (thread && thread.length > 0)
    ? thread
    : rootFallback
      ? [rootFallback]
      : [];

  if (isLoading && messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("inbox.detail.loading", { defaultValue: "Chargement..." })}
      </p>
    );
  }

  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("inbox.detail.noBody")}
      </p>
    );
  }

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      {messages.map((msg) => {
        const isOutbound = msg.direction === "outbound";
        const body = plainBody(msg);
        const when = format(new Date(msg.created_at), "d MMM HH:mm", { locale: fr });
        const Icon = isOutbound ? MailCheck : Mail;

        return (
          <div
            key={msg.id}
            className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm",
                isOutbound
                  ? "rounded-br-md bg-[#0A84FF] text-white"
                  : "rounded-bl-md bg-[#0A84FF] text-white",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-1.5 text-[11px] mb-1 opacity-80",
                  isOutbound ? "justify-end" : "justify-start",
                )}
              >
                <Icon className="h-3 w-3" />
                <span>
                  {isOutbound
                    ? t("inbox.detail.replyFromVenue", { defaultValue: "Réponse envoyée" })
                    : msg.from_address}
                </span>
                <span>· {when}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {body}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
