import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Building2, Loader2 } from "lucide-react";
import { BillingProfileForm } from "@/components/admin/billing/BillingProfileForm";

interface VenueBillingProfileSectionProps {
  hotelId: string;
}

/**
 * Who the therapist auto-invoices are addressed to for this venue, plus the
 * billing identity used on them. Read by generate-therapist-invoices via
 * hotels.invoice_client and billing_profiles (owner_type = 'hotel').
 */
export function VenueBillingProfileSection({ hotelId }: VenueBillingProfileSectionProps) {
  const { t } = useTranslation("admin");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billedByVenue, setBilledByVenue] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("hotels")
        .select("invoice_client")
        .eq("id", hotelId)
        .maybeSingle();

      if (cancelled) return;
      if (error) console.error("Error loading venue invoice_client:", error);
      setBilledByVenue(data?.invoice_client === "venue");
      setLoading(false);
    };
    if (hotelId) load();
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  const handleToggle = async (checked: boolean) => {
    const previous = billedByVenue;
    setBilledByVenue(checked);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hotels")
        .update({ invoice_client: checked ? "venue" : "organization" })
        .eq("id", hotelId);
      if (error) throw error;
      toast.success(t("venue.billingProfile.recipientSaved", "Destinataire mis à jour"));
    } catch (err) {
      console.error("Error saving venue invoice_client:", err);
      setBilledByVenue(previous);
      toast.error(t("venue.billingProfile.recipientError", "Erreur lors de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-normal flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-600" />
            {t("venue.billingProfile.recipientTitle", "Destinataire des factures thérapeutes")}
          </CardTitle>
          <CardDescription>
            {t(
              "venue.billingProfile.recipientDescription",
              "Le thérapeute reste l'émetteur de sa facture. Ce réglage définit à qui elle est adressée.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm">
                {t("venue.billingProfile.billedByVenue", "Le lieu facture en direct")}
              </p>
              <p className="text-xs text-muted-foreground">
                {billedByVenue
                  ? t(
                      "venue.billingProfile.billedByVenueOn",
                      "Les factures sont adressées à ce lieu, avec les informations ci-dessous.",
                    )
                  : t(
                      "venue.billingProfile.billedByVenueOff",
                      "Les factures sont adressées à l'organisation propriétaire du lieu.",
                    )}
              </p>
            </div>
            <Switch checked={billedByVenue} onCheckedChange={handleToggle} disabled={saving} />
          </div>
        </CardContent>
      </Card>

      {billedByVenue && <BillingProfileForm ownerType="hotel" ownerId={hotelId} />}
    </div>
  );
}
