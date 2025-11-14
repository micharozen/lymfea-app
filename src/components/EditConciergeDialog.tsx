import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  first_name: z.string().min(1, "Le prénom est requis"),
  last_name: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().min(1, "Le numéro de téléphone est requis"),
  country_code: z.string().default("+33"),
  hotel_ids: z.array(z.string()).min(1, "Au moins un hôtel doit être sélectionné"),
  profile_image: z.string().optional(),
});

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
  { code: "+33", country: "FR" },
  { code: "+44", country: "UK" },
  { code: "+1", country: "US" },
];

export function EditConciergeDialog({ open, onOpenChange, onSuccess, conciergeId }: EditConciergeDialogProps) {
  const [profileImage, setProfileImage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [hotelPopoverOpen, setHotelPopoverOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
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
    } catch (error: any) {
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

      const hotelIds = concierge.hotels?.map((h: any) => h.hotel_id) || [];
      
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
    } catch (error: any) {
      toast.error("Erreur lors du chargement du concierge");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Le fichier doit être une image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 5MB");
      return;
    }

    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setProfileImage(publicUrl);
      toast.success("Image téléchargée avec succès");
    } catch (error: any) {
      toast.error("Erreur lors du téléchargement de l'image");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
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
    } catch (error: any) {
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
                  onClick={() => fileInputRef.current?.click()}
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
                  <div className="flex gap-2">
                    <FormField
                      control={form.control}
                      name="country_code"
                      render={({ field: codeField }) => (
                        <Select value={codeField.value} onValueChange={codeField.onChange}>
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {countryCodes.map((cc) => (
                              <SelectItem key={cc.code} value={cc.code}>
                                {cc.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FormControl>
                      <Input type="tel" placeholder="" {...field} className="flex-1" />
                    </FormControl>
                  </div>
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
                          className={cn(
                            "w-full justify-between",
                            !field.value.length && "text-muted-foreground"
                          )}
                        >
                          {getSelectedHotelsLabel(field.value)}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <div className="max-h-[300px] overflow-y-auto p-2">
                        {hotels.map((hotel) => (
                          <div
                            key={hotel.id}
                            className="flex items-center gap-3 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors"
                            onClick={() => field.onChange(toggleHotel(hotel.id, field.value))}
                          >
                            <img
                              src={hotel.image}
                              alt={hotel.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                            <span className="flex-1 text-sm">{hotel.name}</span>
                            <Checkbox
                              checked={field.value.includes(hotel.id)}
                              onCheckedChange={() => field.onChange(toggleHotel(hotel.id, field.value))}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        ))}
                      </div>
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
