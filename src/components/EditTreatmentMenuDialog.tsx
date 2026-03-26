import { useEffect, useMemo, useCallback } from "react";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { getCurrencySymbol } from "@/lib/formatPrice";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useTreatmentCategories } from "@/hooks/useTreatmentCategories";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Upload, Loader2, Plus, Trash2 } from "lucide-react";
import { SPECIALTY_OPTIONS } from "@/lib/specialtyTypes";

const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  description: z.string().optional(),
  lead_time: z.string().default("0"),
  service_for: z.string().min(1, t('errors.validation.serviceForRequired')),
  category: z.string().min(1, t('errors.validation.categoryRequired')),
  hotel_id: z.string().min(1, t('errors.validation.hotelRequired')),
  status: z.string().default("active"),
  sort_order: z.string().default("0"),
  is_bestseller: z.boolean().default(false),
  specialty: z.string().optional(),
  variants: z.array(z.object({
    label: z.string().optional(),
    duration: z.string().min(1, "Durée requise"),
    price: z.string().default("0"),
    price_on_request: z.boolean().default(false),
    is_default: z.boolean().default(false),
  })).min(1, "Au moins une variante requise"),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface TreatmentMenu {
  id: string;
  name: string;
  description: string | null;
  duration: number | null;
  price: number | null;
  currency: string | null;
  lead_time: number | null;
  service_for: string;
  category: string;
  hotel_id: string | null;
  image: string | null;
  status: string;
  sort_order: number | null;
  price_on_request: boolean | null;
  is_bestseller: boolean | null;
  treatment_type: string | null;
}

interface EditTreatmentMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: TreatmentMenu | null;
  onSuccess: () => void;
}

export function EditTreatmentMenuDialog({
  open,
  onOpenChange,
  menu,
  onSuccess,
}: EditTreatmentMenuDialogProps) {
  const { t, i18n } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const {
    url: menuImage,
    setUrl: setMenuImage,
    uploading: isUploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload({ path: "treatment-menus/" });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      lead_time: "0",
      service_for: "",
      category: "",
      hotel_id: "",
      status: "active",
      sort_order: "0",
      is_bestseller: false,
      specialty: "",
      variants: [{ label: "", duration: "", price: "0", price_on_request: false, is_default: true }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
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

  const selectedHotel = hotels?.find(h => h.id === selectedHotelId);
  const currency = selectedHotel?.currency || 'EUR';
  const currencySymbol = getCurrencySymbol(currency);

  const { categories, isLoading: categoriesLoading } = useTreatmentCategories(selectedHotelId);

  const loadVariants = useCallback(async (treatmentId: string, treatmentMenu: TreatmentMenu) => {
    const { data: existingVariants } = await supabase
      .from('treatment_variants')
      .select('*')
      .eq('treatment_id', treatmentId)
      .order('sort_order');

    if (existingVariants && existingVariants.length > 0) {
      const mappedVariants = existingVariants.map(v => ({
        label: v.label || "",
        duration: v.duration?.toString() || "0",
        price: v.price?.toString() || "0",
        price_on_request: v.price_on_request || false,
        is_default: v.is_default || false,
      }));
      replace(mappedVariants);
    } else {
      // Fallback: create a single variant from the treatment's own duration/price
      replace([{
        label: "",
        duration: treatmentMenu.duration?.toString() || "0",
        price: treatmentMenu.price?.toString() || "0",
        price_on_request: treatmentMenu.price_on_request || false,
        is_default: true,
      }]);
    }
  }, [replace]);

  useEffect(() => {
    if (menu && open) {
      form.reset({
        name: menu.name || "",
        description: menu.description || "",
        lead_time: menu.lead_time?.toString() || "0",
        service_for: menu.service_for || "",
        category: menu.category || "",
        hotel_id: menu.hotel_id || "",
        status: menu.status || "active",
        sort_order: menu.sort_order?.toString() || "0",
        is_bestseller: menu.is_bestseller || false,
        specialty: menu.treatment_type || "",
        // Temporary default — will be replaced by loadVariants
        variants: [{ label: "", duration: "", price: "0", price_on_request: false, is_default: true }],
      });
      setMenuImage(menu.image || "");
      loadVariants(menu.id, menu);
    }
  }, [menu, open, form, setMenuImage, loadVariants]);

  const handleSetDefault = (index: number) => {
    variants.forEach((_, i) => {
      form.setValue(`variants.${i}.is_default`, i === index);
    });
  };

  const handleAddVariant = () => {
    append({ label: "", duration: "", price: "0", price_on_request: false, is_default: false });
  };

  const handleRemoveVariant = (index: number) => {
    const wasDefault = variants[index]?.is_default;
    remove(index);
    if (wasDefault && fields.length > 1) {
      form.setValue("variants.0.is_default", true);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!menu?.id) return;

    const selectedHotelForSubmit = hotels?.find(h => h.id === values.hotel_id);
    const currencyForSubmit = selectedHotelForSubmit?.currency || 'EUR';

    const defaultVariant = values.variants.find(v => v.is_default) || values.variants[0];

    const { error } = await supabase
      .from("treatment_menus")
      .update({
        name: values.name,
        description: values.description || null,
        duration: parseInt(defaultVariant.duration),
        price: parseFloat(defaultVariant.price),
        currency: currencyForSubmit,
        lead_time: parseInt(values.lead_time),
        service_for: values.service_for,
        category: values.category,
        hotel_id: values.hotel_id,
        image: menuImage || null,
        status: values.status,
        sort_order: parseInt(values.sort_order),
        price_on_request: defaultVariant.price_on_request,
        is_bestseller: values.is_bestseller,
        treatment_type: values.specialty || null,
      })
      .eq("id", menu.id);

    if (error) {
      toast.error("Erreur lors de la modification du menu");
      return;
    }

    // Delete old variants and re-insert
    const { error: deleteError } = await supabase
      .from('treatment_variants')
      .delete()
      .eq('treatment_id', menu.id);

    if (deleteError) {
      toast.error("Erreur lors de la mise à jour des variantes");
      return;
    }

    const variantsToInsert = values.variants.map((v, index) => ({
      treatment_id: menu.id,
      label: v.label || `${v.duration} min`,
      duration: parseInt(v.duration),
      price: parseFloat(v.price),
      price_on_request: v.price_on_request,
      is_default: v.is_default,
      sort_order: index,
    }));

    const { error: variantsError } = await supabase
      .from("treatment_variants")
      .insert(variantsToInsert);

    if (variantsError) {
      toast.error("Erreur lors de la mise à jour des variantes");
      return;
    }

    toast.success("Menu modifié avec succès");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le menu de soins</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-32 h-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted">
                {menuImage ? (
                  <img
                    src={menuImage}
                    alt="Menu preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={triggerFileSelect}
                >
                  {isUploading ? "Téléchargement..." : "Télécharger"}
                  {isUploading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              </div>
            </div>

            <FormField
              control={form.control}
              name="hotel_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hôtel *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un hôtel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {hotels?.map((hotel) => (
                        <SelectItem key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom du menu *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nom du menu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une catégorie" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoriesLoading ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : categories.length === 0 ? (
                          <div className="px-2 py-2 text-sm text-muted-foreground">
                            {selectedHotelId
                              ? "Aucune catégorie. Ajoutez-en dans les paramètres du lieu."
                              : "Sélectionnez d'abord un lieu"}
                          </div>
                        ) : (
                          categories.map((category) => (
                            <SelectItem key={category.id} value={category.name}>
                              {category.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="specialty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin:treatments.specialty')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('admin:treatments.noSpecialty')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SPECIALTY_OPTIONS.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {i18n.language === "fr" ? s.labelFr : s.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Description du menu"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Variants section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base font-semibold">Variantes</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddVariant}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Ajouter une variante
                </Button>
              </div>

              {fields.map((field, index) => {
                const variantPriceOnRequest = variants?.[index]?.price_on_request;
                return (
                  <div
                    key={field.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="grid grid-cols-4 gap-3 flex-1">
                      <FormField
                        control={form.control}
                        name={`variants.${index}.label`}
                        render={({ field }) => (
                          <FormItem>
                            {index === 0 && <FormLabel className="text-xs">Label</FormLabel>}
                            <FormControl>
                              <Input placeholder="ex: 60 minutes" {...field} />
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
                            {index === 0 && <FormLabel className="text-xs">Durée (min) *</FormLabel>}
                            <FormControl>
                              <Input type="number" placeholder="60" {...field} />
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
                            {index === 0 && <FormLabel className="text-xs">Prix ({currencySymbol})</FormLabel>}
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                disabled={variantPriceOnRequest}
                                className={variantPriceOnRequest ? "bg-muted text-muted-foreground" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-2">
                        {index === 0 && <FormLabel className="text-xs block">Options</FormLabel>}
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
                            />
                            <label className="text-xs cursor-pointer whitespace-nowrap">
                              Défaut
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:text-destructive mt-0"
                        style={index === 0 ? { marginTop: '1.25rem' } : undefined}
                        onClick={() => handleRemoveVariant(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}

              {form.formState.errors.variants?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.variants.message}</p>
              )}
            </div>

            {/* Lead time stays at treatment level */}
            <FormField
              control={form.control}
              name="lead_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm whitespace-nowrap">Délai minimum de réservation (min)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" className="max-w-[200px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_bestseller"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="h-4 w-4"
                      />
                    </FormControl>
                    <FormLabel className="text-sm cursor-pointer font-normal m-0">
                      Bestseller (mis en avant sur la page de réservation)
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="service_for"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service pour *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="All">All</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statut</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            {t('status.active')}
                          </div>
                        </SelectItem>
                        <SelectItem value="inactive">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-red-500" />
                            {t('status.inactive')}
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm whitespace-nowrap">Ordre d'affichage</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
