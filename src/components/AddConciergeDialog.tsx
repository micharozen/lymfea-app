import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VENUE_ROLES } from "@/lib/venueRoles";

const createFormSchema = (t: TFunction) => z.object({
  first_name: z.string().min(1, t('errors.validation.firstNameRequired')),
  last_name: z.string().min(1, t('errors.validation.lastNameRequired')),
  email: z.string().email(t('errors.validation.emailInvalid')),
  phone: z.string().min(1, t('errors.validation.phoneRequired')),
  country_code: z.string().default("+33"),
  hotel_ids: z.array(z.string()).min(1, t('errors.validation.hotelRequired')),
  profile_image: z.string().optional(),
  venue_role: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface AddConciergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
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

export function AddConciergeDialog({ open, onOpenChange, onSuccess }: AddConciergeDialogProps) {
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

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
      venue_role: "",
    },
  });

  useEffect(() => {
    if (open) {
      fetchHotels();
    }
  }, [open]);

  const fetchHotels = async () => {
    try {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, image")
        .order("name");

      if (error) throw error;
      setHotels(data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des hôtels");
      console.error(error);
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // Créer d'abord le concierge dans la table
      const { data: concierge, error: conciergeError } = await supabase
        .from("concierges")
        .insert({
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: values.phone,
          country_code: values.country_code,
          profile_image: profileImage || null,
          status: "pending",
          venue_role: values.venue_role || null,
        })
        .select()
        .single();

      if (conciergeError) throw conciergeError;

      // Créer les associations avec les hôtels
      const hotelAssociations = values.hotel_ids.map((hotel_id) => ({
        concierge_id: concierge.id,
        hotel_id,
      }));

      const { error: hotelsError } = await supabase
        .from("concierge_hotels")
        .insert(hotelAssociations);

      if (hotelsError) throw hotelsError;

      // Appeler l'edge function pour envoyer l'email d'invitation
      const { error: inviteError } = await invokeEdgeFunction(
        "invite-concierge",
        {
          body: {
            conciergeId: concierge.id,
            email: values.email,
            firstName: values.first_name,
            lastName: values.last_name,
            phone: values.phone,
            countryCode: values.country_code,
            hotelIds: values.hotel_ids,
          },
        }
      );

      if (inviteError) {
        console.error("Erreur lors de l'envoi de l'invitation:", inviteError);
        toast.error("Membre créé mais l'email d'invitation n'a pas pu être envoyé");
      } else {
        toast.success("Membre ajouté et invitation envoyée avec succès");
      }

      form.reset();
      setProfileImage("");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erreur lors de l'ajout du membre");
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
    if (selectedIds.length === 0) return "Sélectionner des lieux";
    if (selectedIds.length === 1) {
      const hotel = hotels.find((h) => h.id === selectedIds[0]);
      return hotel?.name || "1 lieu sélectionné";
    }
    return `${selectedIds.length} lieux sélectionnés`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Ajouter un membre</DialogTitle>
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
                  {uploading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
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
                  <FormLabel>Lieu(x)</FormLabel>
                  <Popover open={hotelPopoverOpen} onOpenChange={setHotelPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-between font-normal h-9 text-sm hover:bg-background hover:text-foreground",
                            !field.value.length && "text-muted-foreground"
                          )}
                        >
                          <span className="truncate">{getSelectedHotelsLabel(field.value)}</span>
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-48 p-0"
                      align="start"
                      onWheelCapture={(e) => e.stopPropagation()}
                      onTouchMoveCapture={(e) => e.stopPropagation()}
                    >
                      <ScrollArea className="h-40">
                        <div className="p-1">
                          {hotels.map((hotel) => {
                            const isSelected = field.value.includes(hotel.id);
                            return (
                              <button
                                key={hotel.id}
                                type="button"
                                onClick={() => field.onChange(toggleHotel(hotel.id, field.value))}
                                className={cn(
                                  "w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm",
                                  "px-3 py-1.5 text-sm text-popover-foreground transition-colors",
                                  "hover:bg-foreground/5",
                                  isSelected && "font-medium"
                                )}
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

            <FormField
              control={form.control}
              name="venue_role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rôle</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un rôle" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VENUE_ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.labelFr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                Suivant
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
