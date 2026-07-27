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
    return <p className="card-empty">{t("inbox.detail.loading", { defaultValue: "Chargement…" })}</p>;
  }

  if (messages.length === 0) {
    return <p className="card-empty">{t("inbox.detail.noBody")}</p>;
  }

  return (
    <div className="thread">
      {messages.map((msg) => {
        const isOutbound = msg.direction === "outbound";
        const body = plainBody(msg);
        const when = format(new Date(msg.created_at), "d MMM HH:mm", { locale: fr });
        const Icon = isOutbound ? MailCheck : Mail;

        return (
          <div key={msg.id} className={cn("msg", isOutbound ? "out" : "in")}>
            <div className="bubble">
              <div className="hdr">
                <Icon className="h-3 w-3" />
                <span>
                  {isOutbound
                    ? t("inbox.detail.replyFromVenue", { defaultValue: "Réponse envoyée" })
                    : msg.from_address}
                </span>
                <span>· {when}</span>
              </div>
              <p>{body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
