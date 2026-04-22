import { UseFormReturn, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Timer, Clock } from "lucide-react";
import type { VenueWizardFormValues } from "../VenueWizardDialog";

interface VenueBookingRulesTabProps {
  form: UseFormReturn<VenueWizardFormValues>;
  disabled?: boolean;
}

export function VenueBookingRulesTab({ form, disabled }: VenueBookingRulesTabProps) {
  const { t } = useTranslation('common');
  const holdEnabled = useWatch({ control: form.control, name: "booking_hold_enabled" });

  return (
    <div className="space-y-6 max-w-3xl">
      <Card id="booking-rules" className="scroll-mt-32">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Timer className="h-4 w-4 text-indigo-500" />
            {t('venue.bookingRules.holdSectionTitle', 'Pré-réservation (hold)')}
          </CardTitle>
          <CardDescription>
            {t(
              'venue.bookingRules.holdSectionDescription',
              "Un hold verrouille temporairement un créneau dès que le client clique sur \"Continuer\" depuis la sélection du créneau, pour qu'il ait le temps de remplir ses informations et de payer sans qu'un autre client ne réserve le même créneau."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <FormField
            control={form.control}
            name="booking_hold_enabled"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between py-4 first:pt-0">
                <div className="space-y-0.5 pr-4">
                  <FormLabel className="text-sm font-medium">
                    {t('venue.bookingRules.holdEnabled.label', 'Activer le hold du créneau')}
                  </FormLabel>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'venue.bookingRules.holdEnabled.description',
                      "Si désactivé, aucun hold n'est posé et le créneau n'est verrouillé qu'au moment du paiement. Un autre client peut réserver le même créneau entre la sélection et le paiement."
                    )}
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {holdEnabled && (
            <FormField
              control={form.control}
              name="booking_hold_duration_minutes"
              render={({ field }) => (
                <FormItem className="py-4">
                  <FormLabel className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('venue.bookingRules.holdDuration.label', 'Durée du hold')}
                  </FormLabel>
                  <FormControl>
                    <div className="relative w-40">
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="15"
                        {...field}
                        disabled={disabled}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {t('venue.bookingRules.holdDuration.suffix', 'min')}
                      </span>
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'venue.bookingRules.holdDuration.description',
                      "Entre 1 et 15 minutes. Le compte à rebours s'affiche côté client et le hold est libéré automatiquement à l'expiration."
                    )}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
