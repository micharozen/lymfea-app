import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

import type { EmailInquiry } from "@/hooks/inbox/useEmailInquiries";

interface Props {
  inquiry: EmailInquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted?: (bookingId: string) => void;
}

function buildSchema(t: (k: string) => string) {
  return z.object({
    clientFirstName: z.string().min(1, t("inbox.convert.errors.firstName")),
    clientLastName: z.string().min(1, t("inbox.convert.errors.lastName")),
    clientEmail: z
      .string()
      .email(t("inbox.convert.errors.email"))
      .optional()
      .or(z.literal("")),
    phone: z.string().min(1, t("inbox.convert.errors.phone")),
    countryCode: z.string().default("+33"),
    bookingDate: z.date({ required_error: t("inbox.convert.errors.date") }),
    bookingTime: z.string().regex(/^\d{2}:\d{2}$/, t("inbox.convert.errors.time")),
    duration: z.coerce.number().int().positive().default(60),
    clientNote: z.string().default(""),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

function defaultValuesFromInquiry(inquiry: EmailInquiry | null): Partial<FormValues> {
  if (!inquiry) return { countryCode: "+33", duration: 60, clientNote: "" };
  const p = inquiry.parsed_data ?? {};
  let date: Date | undefined;
  if (p.requested_date) {
    const parsed = new Date(p.requested_date);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  return {
    clientFirstName: p.client_first_name ?? "",
    clientLastName: p.client_last_name ?? "",
    clientEmail: p.email ?? inquiry.from_address ?? "",
    phone: p.phone ?? "",
    countryCode: "+33",
    bookingDate: date,
    bookingTime: p.requested_time ?? "",
    duration: 60,
    clientNote: p.notes ?? "",
  };
}

export function ConvertToBookingDialog({ inquiry, open, onOpenChange, onConverted }: Props) {
  const { t } = useTranslation("admin");
  const [submitting, setSubmitting] = useState(false);
  const schema = useMemo(() => buildSchema(t), [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValuesFromInquiry(inquiry) as FormValues,
  });

  // Re-prime defaults when the dialog opens with a new inquiry.
  useEffect(() => {
    if (!open || !inquiry) return;
    form.reset(defaultValuesFromInquiry(inquiry) as FormValues);

    const variantId = inquiry.parsed_data?.variant_match?.id ?? null;
    const treatmentId = inquiry.parsed_data?.treatment_match?.id ?? null;
    if (!variantId && !treatmentId) return;

    let cancelled = false;
    (async () => {
      if (variantId) {
        const { data } = await supabase
          .from("treatment_variants" as never)
          .select("duration")
          .eq("id", variantId)
          .maybeSingle();
        const duration = (data as { duration?: number | null } | null)?.duration ?? null;
        if (!cancelled && duration) form.setValue("duration", duration);
        return;
      }
      if (treatmentId) {
        const { data } = await supabase
          .from("treatment_menus" as never)
          .select("duration")
          .eq("id", treatmentId)
          .maybeSingle();
        const duration = (data as { duration?: number | null } | null)?.duration ?? null;
        if (!cancelled && duration) form.setValue("duration", duration);
      }
    })();

    return () => { cancelled = true; };
  }, [open, inquiry, form]);

  if (!inquiry) return null;

  const onSubmit = async (values: FormValues) => {
    if (!inquiry.hotel_id) {
      toast.error(t("inbox.convert.errors.noVenue"));
      return;
    }
    setSubmitting(true);
    try {
      const fullPhone = values.phone.startsWith("+") ? values.phone : `${values.countryCode} ${values.phone}`;
      const dateStr = format(values.bookingDate, "yyyy-MM-dd");

      const { data: created, error: insertErr } = await supabase
        .from("bookings")
        .insert({
          hotel_id: inquiry.hotel_id,
          client_first_name: values.clientFirstName,
          client_last_name: values.clientLastName,
          client_email: values.clientEmail || null,
          phone: fullPhone,
          booking_date: dateStr,
          booking_time: values.bookingTime,
          duration: values.duration,
          status: "pending",
          source: "email",
          email_inquiry_id: inquiry.id,
          client_note: values.clientNote || null,
          total_price: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();
      if (insertErr || !created) throw insertErr ?? new Error("Insert failed");

      const bookingId = (created as { id: string }).id;

      const { error: updateErr } = await supabase
        .from("email_inquiries" as never)
        .update({ status: "converted", booking_id: bookingId })
        .eq("id", inquiry.id);
      if (updateErr) throw updateErr;

      toast.success(t("inbox.convert.success"));
      onConverted?.(bookingId);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("inbox.convert.title")}</DialogTitle>
          <DialogDescription>
            {t("inbox.convert.subtitle", { venue: inquiry.hotel?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="clientFirstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.convert.fields.firstName")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientLastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.convert.fields.lastName")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="clientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.convert.fields.email")}</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.convert.fields.phone")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="bookingDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("inbox.convert.fields.date")}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn("h-10 justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value
                              ? format(field.value, "PPP", { locale: frLocale })
                              : t("inbox.convert.fields.pickDate")}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bookingTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.convert.fields.time")}</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inbox.convert.fields.duration")}</FormLabel>
                    <FormControl>
                      <Input type="number" min={5} step={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="clientNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inbox.convert.fields.notes")}</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                {t("inbox.convert.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("inbox.convert.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
