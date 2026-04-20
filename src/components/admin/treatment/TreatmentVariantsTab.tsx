import { UseFormReturn, useFieldArray, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrencySymbol } from "@/lib/formatPrice";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import type { TreatmentFormValues } from "@/pages/admin/TreatmentDetail";

interface TreatmentVariantsTabProps {
  form: UseFormReturn<TreatmentFormValues>;
  disabled: boolean;
}

export function TreatmentVariantsTab({
  form,
  disabled,
}: TreatmentVariantsTabProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variants",
  });

  const selectedHotelId = useWatch({ control: form.control, name: "hotel_id" });
  const variants = useWatch({ control: form.control, name: "variants" });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, currency")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedHotel = hotels?.find((h) => h.id === selectedHotelId);
  const currency = selectedHotel?.currency || "EUR";
  const currencySymbol = getCurrencySymbol(currency);

  const handleSetDefault = (index: number) => {
    variants.forEach((_, i) => {
      form.setValue(`variants.${i}.is_default`, i === index);
    });
  };

  const handleAddVariant = () => {
    append({
      label: "",
      duration: "",
      guest_count: "1",
      price: "0",
      price_on_request: false,
      is_default: false,
    });
  };

  const handleRemoveVariant = (index: number) => {
    const wasDefault = variants[index]?.is_default;
    remove(index);
    if (wasDefault && fields.length > 1) {
      form.setValue("variants.0.is_default", true);
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <FormLabel className="text-base font-semibold">Variantes</FormLabel>
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddVariant}
          >
            <Plus className="h-4 w-4 mr-1" />
            Ajouter une variante
          </Button>
        )}
      </div>

      {fields.map((field, index) => {
        const variantPriceOnRequest = variants?.[index]?.price_on_request;
        return (
          <div
            key={field.id}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <div className="grid grid-cols-5 gap-3 flex-1">
              <FormField
                control={form.control}
                name={`variants.${index}.label`}
                render={({ field }) => (
                  <FormItem>
                    {index === 0 && (
                      <FormLabel className="text-xs">Label</FormLabel>
                    )}
                    <FormControl>
                      <Input
                        placeholder="ex: 60 minutes"
                        {...field}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`variants.${index}.duration`}
                render={({ field }) => (
                  <FormItem>
                    {index === 0 && (
                      <FormLabel className="text-xs">Durée (min) *</FormLabel>
                    )}
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="60"
                        {...field}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`variants.${index}.guest_count`}
                render={({ field }) => (
                  <FormItem>
                    {index === 0 && (
                      <FormLabel className="text-xs">Pers.</FormLabel>
                    )}
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        {...field}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`variants.${index}.price`}
                render={({ field }) => (
                  <FormItem>
                    {index === 0 && (
                      <FormLabel className="text-xs">
                        Prix ({currencySymbol})
                      </FormLabel>
                    )}
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        disabled={disabled || variantPriceOnRequest}
                        className={
                          variantPriceOnRequest
                            ? "bg-muted text-muted-foreground"
                            : ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                {index === 0 && (
                  <FormLabel className="text-xs block">Options</FormLabel>
                )}
                <div className="flex items-center gap-3 h-10">
                  <FormField
                    control={form.control}
                    name={`variants.${index}.price_on_request`}
                    render={({ field }) => (
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="h-3.5 w-3.5"
                          disabled={disabled}
                        />
                        <label className="text-xs cursor-pointer whitespace-nowrap">
                          Sur demande
                        </label>
                      </div>
                    )}
                  />

                  <div className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="default_variant"
                      checked={variants?.[index]?.is_default || false}
                      onChange={() => handleSetDefault(index)}
                      className="h-3.5 w-3.5 accent-primary cursor-pointer"
                      disabled={disabled}
                    />
                    <label className="text-xs cursor-pointer whitespace-nowrap">
                      Défaut
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {!disabled && fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive mt-0"
                style={index === 0 ? { marginTop: "1.25rem" } : undefined}
                onClick={() => handleRemoveVariant(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}

      {form.formState.errors.variants?.message && (
        <p className="text-sm text-destructive">
          {form.formState.errors.variants.message}
        </p>
      )}
    </div>
  );
}
