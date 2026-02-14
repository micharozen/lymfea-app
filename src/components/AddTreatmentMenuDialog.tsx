import { useMemo, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Upload, Loader2 } from "lucide-react";

const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  description: z.string().optional(),
  duration: z.string().default("0"),
  price: z.string().default("0"),
  lead_time: z.string().default("0"),
  service_for: z.string().min(1, t('errors.validation.serviceForRequired')),
  category: z.string().min(1, t('errors.validation.categoryRequired')),
  hotel_id: z.string().min(1, t('errors.validation.hotelRequired')),
  status: z.string().default("active"),
  sort_order: z.string().default("0"),
  price_on_request: z.boolean().default(false),
  is_bestseller: z.boolean().default(false),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface AddTreatmentMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddTreatmentMenuDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddTreatmentMenuDialogProps) {
  const { t } = useTranslation('common');
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
      duration: "0",
      price: "0",
      lead_time: "0",
      service_for: "",
      category: "",
      hotel_id: "",
      status: "active",
      sort_order: "0",
      price_on_request: false,
      is_bestseller: false,
    },
  });

  const priceOnRequest = useWatch({ control: form.control, name: "price_on_request" });
  const selectedHotelId = useWatch({ control: form.control, name: "hotel_id" });

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

  const onSubmit = async (values: FormValues) => {
    const selectedHotelForSubmit = hotels?.find(h => h.id === values.hotel_id);
    const currencyForSubmit = selectedHotelForSubmit?.currency || 'EUR';

    const { error } = await supabase.from("treatment_menus").insert({
      name: values.name,
      description: values.description || null,
      duration: parseInt(values.duration),
      price: parseFloat(values.price),
      lead_time: parseInt(values.lead_time),
      service_for: values.service_for,
      category: values.category,
      hotel_id: values.hotel_id,
      currency: currencyForSubmit,
      image: menuImage || null,
      status: values.status,
      sort_order: parseInt(values.sort_order),
      price_on_request: values.price_on_request,
      is_bestseller: values.is_bestseller,
    });

    if (error) {
      toast.error("Erreur lors de l'ajout du menu");
      return;
    }

    toast.success("Menu ajouté avec succès");
    form.reset();
    setMenuImage("");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un menu de soins</DialogTitle>
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
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Clear category when hotel changes
                      form.setValue("category", "");
                    }}
                    value={field.value}
                  >
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

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-4 gap-4 items-start">
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm whitespace-nowrap">Durée (min)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="60" 
                        {...field} 
                        disabled={priceOnRequest}
                        className={priceOnRequest ? "bg-muted text-muted-foreground" : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm whitespace-nowrap">Prix ({currencySymbol})</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        disabled={priceOnRequest}
                        className={priceOnRequest ? "bg-muted text-muted-foreground" : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lead_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm whitespace-nowrap">Délai min (min)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_on_request"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm whitespace-nowrap opacity-0">Sur demande</FormLabel>
                    <div className="flex items-center gap-2 h-10">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="h-4 w-4"
                        />
                      </FormControl>
                      <FormLabel className="text-sm cursor-pointer font-normal whitespace-nowrap m-0">
                        Sur demande
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>

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
                      <SelectItem value="Male">👨 Male</SelectItem>
                      <SelectItem value="Female">👩 Female</SelectItem>
                      <SelectItem value="All">👥 All</SelectItem>
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
              <Button type="submit">Ajouter</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
