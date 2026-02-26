import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Heart, HeartPulse } from "lucide-react";

interface CustomerNotesTabProps {
  disabled: boolean;
  preferredTherapistId: string | null;
  onPreferredTherapistChange: (value: string | null) => void;
  preferredTreatmentType: string;
  onPreferredTreatmentTypeChange: (value: string) => void;
  healthNotes: string;
  onHealthNotesChange: (value: string) => void;
}

export function CustomerNotesTab({
  disabled,
  preferredTherapistId,
  onPreferredTherapistChange,
  preferredTreatmentType,
  onPreferredTreatmentTypeChange,
  healthNotes,
  onHealthNotesChange,
}: CustomerNotesTabProps) {
  const { t } = useTranslation("admin");

  const { data: therapists = [] } = useQuery({
    queryKey: ["therapists-for-select"],
    queryFn: async () => {
      const { data } = await supabase
        .from("therapists")
        .select("id, first_name, last_name")
        .eq("status", "Actif")
        .order("first_name");
      return data || [];
    },
  });

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-l-gold-400">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Heart className="h-4 w-4 text-gold-500" />
            {t("customers.preferences")}
          </CardTitle>
          <CardDescription>
            {t("customers.preferencesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("customers.preferredTherapist")}</Label>
              <Select
                value={preferredTherapistId || "none"}
                onValueChange={(v) => onPreferredTherapistChange(v === "none" ? null : v)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("customers.noPreference")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("customers.noPreference")}</SelectItem>
                  {therapists.map((th) => (
                    <SelectItem key={th.id} value={th.id}>
                      {th.first_name} {th.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("customers.preferredTreatmentType")}</Label>
              <Input
                value={preferredTreatmentType}
                onChange={(e) => onPreferredTreatmentTypeChange(e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-gold-400">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-gold-500" />
            {t("customers.healthNotes")}
          </CardTitle>
          <CardDescription>
            {t("customers.healthNotesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={healthNotes}
            onChange={(e) => onHealthNotesChange(e.target.value)}
            disabled={disabled}
            placeholder={t("customers.healthNotesPlaceholder")}
            rows={5}
          />
        </CardContent>
      </Card>
    </div>
  );
}
