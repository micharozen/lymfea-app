import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageSquareQuote, BookOpen } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

const schema = z.object({
  reply_greeting_fr: z.string(),
  reply_greeting_en: z.string(),
  reply_signoff_fr: z.string(),
  reply_signoff_en: z.string(),
  reply_signature: z.string(),
  reply_tone_notes: z.string(),
  knowledge_base_fr: z.string(),
  knowledge_base_en: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  reply_greeting_fr: "",
  reply_greeting_en: "",
  reply_signoff_fr: "",
  reply_signoff_en: "",
  reply_signature: "",
  reply_tone_notes: "",
  knowledge_base_fr: "",
  knowledge_base_en: "",
};

/** Empty string in the form ⇢ NULL in DB, so the agent falls back to its defaults. */
function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface Props {
  hotelId: string;
}

export function VenueInboxToneSection({ hotelId }: Props) {
  const { t } = useTranslation("admin");
  const { isAdmin } = useUser();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["venue-inbox-settings", hotelId],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("venue_inbox_settings")
        .select(
          "reply_greeting_fr, reply_greeting_en, reply_signoff_fr, reply_signoff_en, reply_signature, reply_tone_notes, knowledge_base_fr, knowledge_base_en",
        )
        .eq("hotel_id", hotelId)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { reset } = form;

  useEffect(() => {
    if (!data) return;
    reset({
      reply_greeting_fr: data.reply_greeting_fr ?? "",
      reply_greeting_en: data.reply_greeting_en ?? "",
      reply_signoff_fr: data.reply_signoff_fr ?? "",
      reply_signoff_en: data.reply_signoff_en ?? "",
      reply_signature: data.reply_signature ?? "",
      reply_tone_notes: data.reply_tone_notes ?? "",
      knowledge_base_fr: data.knowledge_base_fr ?? "",
      knowledge_base_en: data.knowledge_base_en ?? "",
    });
  }, [data, reset]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.from("venue_inbox_settings").upsert({
        hotel_id: hotelId,
        reply_greeting_fr: toNullable(values.reply_greeting_fr),
        reply_greeting_en: toNullable(values.reply_greeting_en),
        reply_signoff_fr: toNullable(values.reply_signoff_fr),
        reply_signoff_en: toNullable(values.reply_signoff_en),
        reply_signature: toNullable(values.reply_signature),
        reply_tone_notes: toNullable(values.reply_tone_notes),
        knowledge_base_fr: toNullable(values.knowledge_base_fr),
        knowledge_base_en: toNullable(values.knowledge_base_en),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inbox.tab.tone.saved", { defaultValue: "Ton des réponses enregistré" }));
      queryClient.invalidateQueries({ queryKey: ["venue-inbox-settings", hotelId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(values => save(values))} className="space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <MessageSquareQuote className="h-4 w-4 text-indigo-500" />
              {t("inbox.tab.tone.title", { defaultValue: "Ton des réponses IA" })}
            </CardTitle>
            <CardDescription>
              {t("inbox.tab.tone.description", {
                defaultValue:
                  "Les formules saisies ici sont reprises telles quelles par l'agent. Laissez vide pour utiliser les formules par défaut.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="reply_greeting_fr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.tab.tone.greetingFr", { defaultValue: "Salutation (FR)" })}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={!isAdmin}
                        placeholder="Salutations ensoleillées du Cap d'Antibes Beach Hôtel,"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reply_greeting_en"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.tab.tone.greetingEn", { defaultValue: "Salutation (EN)" })}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={!isAdmin}
                        placeholder="Sunny greetings from Cap d'Antibes Beach Hotel,"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reply_signoff_fr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.tab.tone.signoffFr", { defaultValue: "Formule de fin (FR)" })}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!isAdmin} placeholder="Chaleureusement," />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reply_signoff_en"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.tab.tone.signoffEn", { defaultValue: "Formule de fin (EN)" })}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!isAdmin} placeholder="Warmly," />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reply_signature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inbox.tab.tone.signature", { defaultValue: "Signature" })}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      disabled={!isAdmin}
                      placeholder={"Ambre\nESPACE BIEN-ÊTRE BY EÏA\nCAP D'ANTIBES BEACH HOTEL"}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("inbox.tab.tone.signatureHelp", {
                      defaultValue: "Bloc placé après la formule de fin. C'est la seule signature ajoutée à l'email.",
                    })}
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reply_tone_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inbox.tab.tone.notes", { defaultValue: "Consignes de rédaction" })}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      disabled={!isAdmin}
                      placeholder={t("inbox.tab.tone.notesPlaceholder", {
                        defaultValue: "Vouvoiement systématique, ne jamais proposer de remise, mentionner le vestiaire…",
                      })}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-600" />
              {t("inbox.tab.knowledge.title", { defaultValue: "Base de connaissance" })}
            </CardTitle>
            <CardDescription>
              {t("inbox.tab.knowledge.description", {
                defaultValue:
                  "Tout ce que le catalogue de soins ne contient pas : offres packagées, accès plage, horaires, coffrets cadeaux. L'agent n'a pas le droit d'affirmer quoi que ce soit au-delà.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="knowledge_base_fr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inbox.tab.knowledge.fr", { defaultValue: "Informations (FR)" })}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={8}
                      disabled={!isAdmin}
                      placeholder={t("inbox.tab.knowledge.placeholder", {
                        defaultValue:
                          "Offre Beach & Self Care : 180 €/personne, comprend l'accès plage, le déjeuner et un massage 60 min.\nAccès spa : réservé aux clients de l'hôtel.\nCoffret Relais & Châteaux Rose : donne droit à un soin de 75 min.",
                      })}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="knowledge_base_en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inbox.tab.knowledge.en", { defaultValue: "Informations (EN)" })}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={8} disabled={!isAdmin} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {isAdmin && (
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {t("inbox.tab.tone.save", { defaultValue: "Enregistrer" })}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
