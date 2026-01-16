import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFileUpload } from "@/hooks/useFileUpload";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const createFormSchema = (t: TFunction) => z.object({
  first_name: z.string().min(1, t('errors.validation.firstNameRequired')),
  last_name: z.string().min(1, t('errors.validation.lastNameRequired')),
  email: z.string().email(t('errors.validation.emailInvalid')),
  phone: z.string().min(1, t('errors.validation.phoneRequired')),
  country_code: z.string().default("+33"),
  hotel_ids: z.array(z.string()).min(1, t('errors.validation.hotelRequired')),
  profile_image: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface EditConciergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  conciergeId: string;
}

const countryCodes = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
  { code: "+1", label: "États-Unis", flag: "🇺🇸" },
  { code: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
];

export function EditConciergeDialog({ open, onOpenChange, onSuccess, conciergeId }: EditConciergeDialogProps) {
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const [loading, setLoading] = useState(true);
  const [hotelPopoverOpen, setHotelPopoverOpen] = useState(false);
  const [hotels, setHotels] = useState<Hotel[]>([]);

  const {
    url: profileImage,
    setUrl: setProfileImage,
    uploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      country_code: "+33",
      hotel_ids: [],
      profile_image: "",
    },
  });

  useEffect(() => {
    if (open && conciergeId) {
      fetchHotels();
      loadConcierge();
    }
  }, [open, conciergeId]);

  const fetchHotels = async () => {
    try {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, image")
        .order("name");

      if (error) throw error;
      setHotels(data || []);
    } catch (error) {
      toast.error("Erreur lors du chargement des hôtels");
      console.error(error);
    }
  };

  const loadConcierge = async () => {
    try {
      setLoading(true);
      const { data: concierge, error } = await supabase
        .from("concierges")
        .select(`
          *,
          hotels:concierge_hotels(hotel_id)
        `)
        .eq("id", conciergeId)
        .single();

      if (error) throw error;

      const hotelIds = concierge.hotels?.map((h: { hotel_id: string }) => h.hotel_id) || [];
      
      form.reset({
        first_name: concierge.first_name,
        last_name: concierge.last_name,
        email: concierge.email,
        phone: concierge.phone,
        country_code: concierge.country_code,
        hotel_ids: hotelIds,
        profile_image: concierge.profile_image || "",
      });
      
      setProfileImage(concierge.profile_image || "");
    } catch (error) {
      toast.error("Erreur lors du chargement du concierge");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // Mettre à jour le concierge
      const { error: conciergeError } = await supabase
        .from("concierges")
        .update({
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: values.phone,
          country_code: values.country_code,
          profile_image: profileImage || null,
        })
        .eq("id", conciergeId);

      if (conciergeError) throw conciergeError;

      // Supprimer les anciennes associations
      const { error: deleteError } = await supabase
        .from("concierge_hotels")
        .delete()
        .eq("concierge_id", conciergeId);

      if (deleteError) throw deleteError;

      // Créer les nouvelles associations
      const hotelAssociations = values.hotel_ids.map((hotel_id) => ({
        concierge_id: conciergeId,
        hotel_id,
      }));

      const { error: hotelsError } = await supabase
        .from("concierge_hotels")
        .insert(hotelAssociations);

      if (hotelsError) throw hotelsError;

      toast.success("Concierge modifié avec succès");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error("Erreur lors de la modification du concierge");
      console.error(error);
    }
  };

  const toggleHotel = (hotelId: string, currentValue: string[]) => {
    const newHotels = currentValue.includes(hotelId)
      ? currentValue.filter((id) => id !== hotelId)
      : [...currentValue, hotelId];
    return newHotels;
  };

  const getSelectedHotelsLabel = (selectedIds: string[]) => {
    if (selectedIds.length === 0) return "Sélectionner des hôtels";
    if (selectedIds.length === 1) {
      const hotel = hotels.find((h) => h.id === selectedIds[0]);
      return hotel?.name || "1 hôtel sélectionné";
    }
    return `${selectedIds.length} hôtels sélectionnés`;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-center py-8">Chargement...</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Modifier le concierge</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Photo de profil</label>
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profileImage} />
                  <AvatarFallback className="bg-muted">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                    </svg>
                  </AvatarFallback>
                </Avatar>
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
                  onClick={triggerFileSelect}
                  disabled={uploading}
                >
                  {uploading ? "Téléchargement..." : "Télécharger une image"}
                </Button>
              </div>
            </div>

            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prénom</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Entrer l'adresse email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numéro de téléphone</FormLabel>
                  <FormControl>
                    <PhoneNumberField
                      value={field.value}
                      onChange={field.onChange}
                      countryCode={form.watch("country_code")}
                      setCountryCode={(value) => form.setValue("country_code", value)}
                      countries={countryCodes}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hotel_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hôtel(s)</FormLabel>
                  <Popover open={hotelPopoverOpen} onOpenChange={setHotelPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                        >
                          <span className="truncate">
                            {field.value.length === 0
                              ? "Sélectionner des hôtels"
                              : hotels
                                  .filter((h) => field.value.includes(h.id))
                                  .map((h) => h.name)
                                  .join(", ")}
                          </span>
                          <svg className="h-3 w-3 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m6 9 6 6 6-6"/>
                          </svg>
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-64 p-0"
                      align="start"
                      onWheelCapture={(e) => e.stopPropagation()}
                      onTouchMoveCapture={(e) => e.stopPropagation()}
                    >
                      <ScrollArea className="h-40 touch-pan-y">
                        <div className="p-1">
                          {hotels.map((hotel) => {
                            const isSelected = field.value.includes(hotel.id);
                            return (
                              <button
                                key={hotel.id}
                                type="button"
                                onClick={() => field.onChange(toggleHotel(hotel.id, field.value))}
                                className="w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-foreground/5"
                              >
                                <span className="min-w-0 truncate text-left">{hotel.name}</span>
                                {isSelected ? (
                                  <span className="h-4 w-4 grid place-items-center rounded-sm bg-primary text-primary-foreground">
                                    <Check className="h-3 w-3" strokeWidth={3} />
                                  </span>
                                ) : (
                                  <span className="h-4 w-4" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annuler
              </Button>
              <Button type="submit" className="bg-foreground text-background hover:bg-foreground/90">
                Enregistrer
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
