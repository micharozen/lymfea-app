import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import * as z from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { promoCodeKeys, type PromoCodeWithStats } from "@shared/db";
import { normalizeVoucherCode } from "@/lib/voucherCode";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SelectField } from "@/components/ui/select-field";
import { MultiSelectField } from "@/components/ui/multi-select-field";

/** Valeur sentinelle : un code sans lieu vaut pour toute l'organisation. */
const ALL_VENUES = "__all__";

const createFormSchema = (t: TFunction) =>
  z.object({
    code: z.string().trim().min(3, t('promoCodesPage.errorCodeTooShort')),
    discountType: z.enum(["percentage", "fixed_amount"]),
    discountValue: z.coerce.number().positive(t('promoCodesPage.errorValuePositive')),
    hotelId: z.string(),
    treatmentIds: z.array(z.string()),
    validFrom: z.string(),
    validUntil: z.string(),
    maxRedemptions: z.string(),
    maxPerCustomer: z.string(),
    isActive: z.boolean(),
    description: z.string(),
  }).refine(
    (v) => v.discountType !== "percentage" || v.discountValue <= 100,
    { path: ["discountValue"], message: t('promoCodesPage.errorPercentMax') },
  ).refine(
    (v) => !v.validFrom || !v.validUntil || v.validUntil >= v.validFrom,
    { path: ["validUntil"], message: t('promoCodesPage.errorDateOrder') },
  );

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface VenueOption { id: string; name: string; organization_id?: string | null }
interface TreatmentOption { id: string; name: string; hotel_id: string | null }

interface PromoCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Non nul = édition. */
  promoCode: PromoCodeWithStats | null;
  venues: VenueOption[];
  treatments: TreatmentOption[];
}

export function PromoCodeDialog({
  open,
  onOpenChange,
  promoCode,
  venues,
  treatments,
}: PromoCodeDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
  const scope = useOrgScope();
  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const isEdit = !!promoCode;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      discountType: "percentage",
      discountValue: 10,
      hotelId: ALL_VENUES,
      treatmentIds: [],
      validFrom: "",
      validUntil: "",
      maxRedemptions: "",
      maxPerCustomer: "",
      isActive: true,
      description: "",
    },
  });

  // Réinitialise à chaque ouverture : le même dialog sert à créer et à éditer.
  useEffect(() => {
    if (!open) return;
    form.reset(promoCode ? {
      code: promoCode.code,
      discountType: promoCode.discount_type as "percentage" | "fixed_amount",
      discountValue: Number(promoCode.discount_value),
      hotelId: promoCode.hotel_id ?? ALL_VENUES,
      treatmentIds: promoCode.treatment_ids,
      validFrom: promoCode.valid_from ? promoCode.valid_from.slice(0, 10) : "",
      validUntil: promoCode.valid_until ? promoCode.valid_until.slice(0, 10) : "",
      maxRedemptions: promoCode.max_redemptions ? String(promoCode.max_redemptions) : "",
      maxPerCustomer: promoCode.max_per_customer ? String(promoCode.max_per_customer) : "",
      isActive: promoCode.is_active,
      description: promoCode.description ?? "",
    } : {
      code: "",
      discountType: "percentage",
      discountValue: 10,
      hotelId: ALL_VENUES,
      treatmentIds: [],
      validFrom: "",
      validUntil: "",
      maxRedemptions: "",
      maxPerCustomer: "",
      isActive: true,
      description: "",
    });
  }, [open, promoCode, form]);

  const selectedVenue = form.watch("hotelId");
  const discountType = form.watch("discountType");
  const isAllOrgsView = !scope || "allOrganizations" in scope;

  // Un code restreint à un lieu ne peut cibler que les soins de ce lieu.
  const treatmentOptions = useMemo(
    () => treatments
      .filter((tr) => selectedVenue === ALL_VENUES || tr.hotel_id === null || tr.hotel_id === selectedVenue)
      .map((tr) => ({ value: tr.id, label: tr.name })),
    [treatments, selectedVenue],
  );

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // En vue « toutes organisations », le super-admin n'a pas d'organisation
      // courante : elle est déduite du lieu, que le formulaire rend alors
      // obligatoire.
      const organizationId = scope && !("allOrganizations" in scope)
        ? scope.organizationId
        : venues.find((v) => v.id === values.hotelId)?.organization_id;

      if (!organizationId) throw new Error(t('promoCodesPage.errorNoOrganization'));

      const payload = {
        organization_id: organizationId,
        hotel_id: values.hotelId === ALL_VENUES ? null : values.hotelId,
        code: values.code.trim(),
        code_normalized: normalizeVoucherCode(values.code),
        discount_type: values.discountType,
        discount_value: values.discountValue,
        valid_from: values.validFrom ? new Date(values.validFrom).toISOString() : null,
        valid_until: values.validUntil
          // Fin de journée incluse : un code valable « jusqu'au 31 » doit marcher le 31 au soir.
          ? new Date(`${values.validUntil}T23:59:59`).toISOString()
          : null,
        max_redemptions: values.maxRedemptions ? Number(values.maxRedemptions) : null,
        max_per_customer: values.maxPerCustomer ? Number(values.maxPerCustomer) : null,
        is_active: values.isActive,
        description: values.description || null,
      };

      let promoId: string;
      if (promoCode) {
        const { error } = await supabase
          .from("promo_codes")
          .update(payload)
          .eq("id", promoCode.id);
        if (error) throw error;
        promoId = promoCode.id;

        // L'assiette est réécrite en entier : plus simple et plus sûr qu'un
        // diff ajout/retrait sur une liste que l'admin vient de recomposer.
        const { error: delError } = await supabase
          .from("promo_code_treatments")
          .delete()
          .eq("promo_code_id", promoCode.id);
        if (delError) throw delError;
      } else {
        const { data, error } = await supabase
          .from("promo_codes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        promoId = data.id;
      }

      if (values.treatmentIds.length > 0) {
        const { error } = await supabase
          .from("promo_code_treatments")
          .insert(values.treatmentIds.map((treatment_id) => ({
            promo_code_id: promoId,
            treatment_id,
          })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promoCodeKeys.all });
      toast.success(isEdit ? t('promoCodesPage.updated') : t('promoCodesPage.created'));
      onOpenChange(false);
    },
    onError: (error: Error & { code?: string }) => {
      toast.error(
        error.code === "23505"
          ? t('promoCodesPage.errorDuplicateCode')
          : error.message || t('common:errors.generic'),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-normal">
            {isEdit ? t('promoCodesPage.editTitle') : t('promoCodesPage.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('promoCodesPage.dialogSubtitle')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('promoCodesPage.fieldCode')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="ETE20" autoCapitalize="characters" className="font-mono" />
                  </FormControl>
                  <FormDescription>{t('promoCodesPage.fieldCodeHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="discountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('promoCodesPage.fieldType')}</FormLabel>
                    <FormControl>
                      <SelectField
                        options={[
                          { value: "percentage", label: t('promoCodesPage.typePercentage') },
                          { value: "fixed_amount", label: t('promoCodesPage.typeFixed') },
                        ]}
                        value={field.value}
                        onChange={field.onChange}
                        searchable={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discountValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {discountType === "percentage"
                        ? t('promoCodesPage.fieldValuePercent')
                        : t('promoCodesPage.fieldValueAmount')}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} step="1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="hotelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('promoCodesPage.fieldVenue')}</FormLabel>
                  <FormControl>
                    <SelectField
                      options={[
                        ...(isAllOrgsView
                          ? [{ value: ALL_VENUES, label: t('promoCodesPage.pickVenue'), disabled: true }]
                          : [{ value: ALL_VENUES, label: t('promoCodesPage.allOrgVenues') }]),
                        ...venues.map((v) => ({ value: v.id, label: v.name })),
                      ]}
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        // Les soins déjà cochés peuvent appartenir à un autre lieu.
                        form.setValue("treatmentIds", []);
                      }}
                    />
                  </FormControl>
                  {isAllOrgsView && (
                    <FormDescription>{t('promoCodesPage.pickVenueHint')}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="treatmentIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('promoCodesPage.fieldTreatments')}</FormLabel>
                  <FormControl>
                    <MultiSelectField
                      options={treatmentOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('promoCodesPage.allTreatments')}
                    />
                  </FormControl>
                  <FormDescription>{t('promoCodesPage.fieldTreatmentsHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('promoCodesPage.fieldValidFrom')}</FormLabel>
                    <FormControl><Input {...field} type="date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="validUntil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('promoCodesPage.fieldValidUntil')}</FormLabel>
                    <FormControl><Input {...field} type="date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="maxRedemptions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('promoCodesPage.fieldMaxRedemptions')}</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} placeholder={t('promoCodesPage.unlimited')} />
                  </FormControl>
                  <FormDescription>{t('promoCodesPage.fieldMaxRedemptionsHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxPerCustomer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('promoCodesPage.fieldMaxPerCustomer')}</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} placeholder={t('promoCodesPage.unlimited')} />
                  </FormControl>
                  <FormDescription>{t('promoCodesPage.fieldMaxPerCustomerHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t('promoCodesPage.fieldActive')}</FormLabel>
                    <FormDescription>{t('promoCodesPage.fieldActiveHint')}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:buttons.cancel')}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {isEdit ? t('common:buttons.save') : t('promoCodesPage.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
