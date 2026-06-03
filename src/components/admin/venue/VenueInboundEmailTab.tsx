import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Mail,
  Sparkles,
  Zap,
  Forward,
  Globe2,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";

interface Props {
  hotelId?: string;
}

interface InboundEmail {
  alias: string | null;
  domain: string | null;
}

const SAOMA_CONTACT_EMAIL = brand.legal?.contactEmail ?? "hello@lymfea.fr";

export function VenueInboundEmailTab({ hotelId }: Props) {
  const { t } = useTranslation("admin");
  const [data, setData] = useState<InboundEmail | null>(null);

  // For now the feature is locked behind a Saoma-side toggle; we still surface
  // the auto-generated address (read-only) so admins can preview what their
  // inbox would look like once activated.
  const isActivated = false;

  useEffect(() => {
    if (!hotelId) return;
    let alive = true;
    (async () => {
      const { data: row } = await supabase
        .from("hotels")
        .select("inbound_email_alias, inbound_email_domain")
        .eq("id", hotelId)
        .maybeSingle();
      if (!alive) return;
      const r = row as { inbound_email_alias?: string | null; inbound_email_domain?: string | null } | null;
      setData({
        alias: r?.inbound_email_alias ?? null,
        domain: r?.inbound_email_domain ?? null,
      });
    })();
    return () => { alive = false; };
  }, [hotelId]);

  const fullAddress = data?.alias && data?.domain ? `${data.alias}@${data.domain}` : null;

  const copy = async () => {
    if (!fullAddress) return;
    try {
      await navigator.clipboard.writeText(fullAddress);
      toast.success(t("inbox.tab.address.copied"));
    } catch {
      toast.error(t("inbox.tab.address.copyFailed"));
    }
  };

  const benefits: Array<{ icon: React.ElementType; title: string; body: string }> = [
    {
      icon: Forward,
      title: t("inbox.tab.benefits.newChannel.title"),
      body: t("inbox.tab.benefits.newChannel.body"),
    },
    {
      icon: Sparkles,
      title: t("inbox.tab.benefits.aiParsing.title"),
      body: t("inbox.tab.benefits.aiParsing.body"),
    },
    {
      icon: Zap,
      title: t("inbox.tab.benefits.fewerClicks.title"),
      body: t("inbox.tab.benefits.fewerClicks.body"),
    },
    {
      icon: Globe2,
      title: t("inbox.tab.benefits.multilingual.title"),
      body: t("inbox.tab.benefits.multilingual.body"),
    },
    {
      icon: ShieldCheck,
      title: t("inbox.tab.benefits.audit.title"),
      body: t("inbox.tab.benefits.audit.body"),
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Hero */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-orange-50 via-amber-50 to-background p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 rounded-lg bg-orange-500/10 p-2.5">
            <Mail className="h-5 w-5 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold">{t("inbox.tab.hero.title")}</h2>
              <Badge variant="outline" className="bg-white">
                <Sparkles className="h-3 w-3 mr-1" />
                {t("inbox.tab.hero.aiBadge")}
              </Badge>
              <Badge variant="outline" className="bg-white text-amber-700 border-amber-200">
                {t("inbox.tab.hero.paidBadge")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("inbox.tab.hero.description")}
            </p>
          </div>
        </div>
      </div>

      {/* Activation card */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("inbox.tab.activation.title")}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {isActivated
                  ? t("inbox.tab.activation.bodyActive")
                  : t("inbox.tab.activation.bodyLocked")}
              </p>
            </div>
            <Switch checked={isActivated} disabled aria-label="Activer l'inbox email" />
          </div>

          {!isActivated && (
            <div className="mt-4 rounded-md border border-dashed border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-amber-800 leading-snug">
                {t("inbox.tab.activation.contactCopy")}
              </p>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-amber-300 bg-white hover:bg-amber-100 flex-shrink-0"
              >
                <a href={`mailto:${SAOMA_CONTACT_EMAIL}?subject=${encodeURIComponent(t("inbox.tab.activation.mailtoSubject"))}`}>
                  {t("inbox.tab.activation.contactCta")}
                </a>
              </Button>
            </div>
          )}

          {/* Address preview */}
          {fullAddress && (
            <div className={`mt-4 rounded-md border border-border bg-muted/30 p-3 ${!isActivated ? "opacity-70" : ""}`}>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t("inbox.tab.address.label")}
              </div>
              <div className="flex items-center justify-between gap-3">
                <code className="font-mono text-sm break-all">{fullAddress}</code>
                <Button type="button" variant="ghost" size="sm" onClick={copy} disabled={!isActivated} className="flex-shrink-0">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
                {t("inbox.tab.address.description")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Benefits grid */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t("inbox.tab.benefits.title")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {benefits.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 rounded-md bg-foreground/5 p-2">
                  <Icon className="h-4 w-4 text-foreground/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{title}</div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t("inbox.tab.how.title")}</h3>
        <ol className="space-y-2 text-sm text-muted-foreground">
          {[1, 2, 3, 4].map(n => (
            <li key={n} className="flex gap-3">
              <span className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-foreground/10 text-foreground text-xs font-semibold">
                {n}
              </span>
              <span>{t(`inbox.tab.how.step${n}`)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
