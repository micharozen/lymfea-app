import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  hotelId: string;
}

interface InboundEmail {
  alias: string | null;
  domain: string | null;
}

export function VenueInboundEmailRow({ hotelId }: Props) {
  const { t } = useTranslation("admin");
  const [data, setData] = useState<InboundEmail | null>(null);

  useEffect(() => {
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

  if (!data?.alias || !data?.domain) return null;
  const fullAddress = `${data.alias}@${data.domain}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullAddress);
      toast.success(t("inbox.venueRow.copied"));
    } catch {
      toast.error(t("inbox.venueRow.copyFailed"));
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-3">
      <Mail className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground">
          {t("inbox.venueRow.label")}
        </div>
        <div className="font-mono text-sm break-all">{fullAddress}</div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
          {t("inbox.venueRow.description")}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={copy} className="flex-shrink-0">
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
